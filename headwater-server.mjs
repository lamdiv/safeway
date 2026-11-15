import {reportStore} from './src/monitor-reports.mjs';
import http from 'node:http';
import {monitoringSnapshot} from './src/monitor.mjs';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createIncidentPlan} from './src/simulation.mjs';
import {alertConfiguration,createAlertDispatcher} from './src/notifications.mjs';
import {modelConfiguration} from './src/models.mjs';
import {operationsStore} from './src/operations-store.mjs';
import {voiceConfiguration,initiateTestCall} from './src/voice.mjs';
const ROOT=fileURLToPath(new URL('.',import.meta.url));
const PUBLIC=resolve(ROOT,'public');
const PORT=Number(process.env.PORT||4173);
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const alertDispatcher=createAlertDispatcher();
let busy=false;let opsStorePromise;
async function getOpsStore(){if(!opsStorePromise)opsStorePromise=Promise.all(['assets.json','roads.geojson'].map(name=>readFile(resolve(PUBLIC,'data',name),'utf8').then(JSON.parse))).then(([assets,roads])=>operationsStore({path:resolve(ROOT,'data/runtime/operations.json'),assets,roads}));return opsStorePromise;}
function authorized(req){if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return false;return !process.env.HEADWATER_API_TOKEN||req.headers.authorization===`Bearer ${process.env.HEADWATER_API_TOKEN}`;}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>16000)throw new Error('Request too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString());}
const load=name=>readFile(resolve(PUBLIC,'data',name),'utf8').then(JSON.parse);
export const server=http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(path==='/api/monitor/reports'){if(!authorized(req))return json(res,403,{error:'Operator authorization required'});if(!['GET','POST'].includes(req.method))return json(res,405,{error:'GET or POST required'});const input=req.method==='POST'?await body(req):null;const result=await reportStore(resolve(ROOT,'data/runtime/monitor-reports.json'),input,input?await load('assets.json'):null);return json(res,200,result);}
  if(path==='/api/monitor'&&req.method==='GET'){try{return json(res,200,await monitoringSnapshot(new URL(req.url,'http://localhost').searchParams.get('region')||'rasuwa'));}catch{return json(res,400,{error:'Monitoring request failed'});}}
  if(path==='/api/config'){const c=modelConfiguration();return json(res,200,{...c,provider:c.providerLabel,agentAvailable:c.configured,voice:voiceConfiguration(),alerts:alertConfiguration(),authorizationRequired:Boolean(process.env.HEADWATER_API_TOKEN),mode:c.configured?`live-${c.provider}-deepagent`:'not-configured'});}
  if(path==='/api/incident/alerts'){
   if(req.method!=='POST')return json(res,405,{error:'POST required'});
   if(!authorized(req))return json(res,403,{error:'Authorization or same-origin check failed.'});
   try{const input=await body(req);const [grid,assets,roads]=await Promise.all(['terrain.json','assets.json','roads.geojson'].map(load));const plan=createIncidentPlan({grid,assets,roads},{stage:20,incidentId:String(input.incidentId||'RASUWA-EXERCISE').slice(0,100)});const records=await alertDispatcher.dispatch(plan,input);return json(res,200,{records,acknowledged:false,notice:'Provider acceptance does not establish delivery or a recipient acknowledgement.'});}catch(e){return json(res,400,{error:e.message});}
  }
  if(path==='/api/operations'){
   if(!authorized(req))return json(res,403,{error:'Authorization or same-origin check failed.'});
   const store=await getOpsStore();
   if(req.method==='GET')return json(res,200,{state:await store.get(),persistence:'local-server'});
   if(req.method!=='POST')return json(res,405,{error:'GET or POST required'});
   try{const action=await body(req);if(action.type==='reset_exercise'){if(action.confirmation!=='RESET EXERCISE')return json(res,400,{error:'Explicit exercise reset required'});return json(res,200,{state:await store.reset()});}return json(res,200,{state:await store.apply(action)});}catch(e){return json(res,e.message==='VERSION_CONFLICT'?409:400,{error:e.message});}
  }
  if(path==='/api/test-call'){
   if(req.method!=='POST')return json(res,405,{error:'POST required'});
   if(!authorized(req))return json(res,403,{error:'Authorization or same-origin check failed.'});
   try{const input=await body(req);const store=await getOpsStore(),ops=await store.get();if(!ops.requests.some(r=>r.id===input.requestId))return json(res,400,{error:'Unknown assistance request'});const result=await initiateTestCall(input);return json(res,200,result);}catch(e){return json(res,400,{error:e.message});}
  }
  if(path==='/api/investigate'){
   if(req.method!=='POST')return json(res,405,{error:'POST required'});
   const origin=req.headers.origin;
   if(origin&&new URL(origin).host!==req.headers.host)return json(res,403,{error:'Cross-origin request blocked'});
   if(process.env.HEADWATER_API_TOKEN&&req.headers.authorization!==`Bearer ${process.env.HEADWATER_API_TOKEN}`)return json(res,401,{error:'API authorization required'});
   if(!modelConfiguration().configured)return json(res,503,{error:'Configure AWS_BEARER_TOKEN_BEDROCK or AWS_PROFILE in the server environment to enable Bedrock investigations. No model request was made.',code:'MODEL_NOT_CONFIGURED'});
   if(busy)return json(res,429,{error:'An investigation is already running. Try again when it finishes.'});
   const data=await body(req);if(typeof data.question!=='string'||data.question.length<3||data.question.length>1600)return json(res,400,{error:'Question must be 3–1600 characters.'});
   const asOf=data.asOf||new Date().toISOString();if(!Number.isFinite(Date.parse(asOf)))return json(res,400,{error:'Invalid evidence cutoff'});
   busy=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),150000);
   try{
    const [grid,assets,extent,catalogue]=await Promise.all(['terrain.json','assets.json','observed-extent.geojson','satellite-catalogue.json'].map(load));
    const {investigate}=await import('./src/agent.mjs');
    const operations=await (await getOpsStore()).get();const roads=await load('roads.geojson');
    const result=await investigate(data.question,{grid,assets,extent,catalogue,asOf,operations,roads},{signal:controller.signal});return json(res,200,result);
   }catch(e){console.error('Investigation failed:',e.name);return json(res,502,{error:'The model investigation failed. Check server configuration and try again.',code:'AGENT_FAILED'});}finally{clearTimeout(timer);busy=false;}
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'GET required'});
  const local=path.startsWith('/src/')?resolve(ROOT,'.'+path):resolve(PUBLIC,'.'+(path==='/'?'/monitor.html':path==='/playback'?'/index.html':path));
  const allowed=path.startsWith('/src/')?resolve(ROOT,'src'):PUBLIC;
  if(local!==allowed&&!local.startsWith(allowed+sep))return json(res,403,{error:'Invalid path'});
  let data;try{if(!(await stat(local)).isFile())throw new Error();data=await readFile(local);}catch{return json(res,404,{error:'Not found'});}
  const etag='"'+createHash('sha256').update(data).digest('hex').slice(0,16)+'"';
  if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
  res.writeHead(200,{'Content-Type':MIME[extname(local)]||'application/octet-stream','ETag':etag,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){json(res,400,{error:'Invalid request'});}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Headwater ready: http://127.0.0.1:${PORT}`));
