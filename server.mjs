import https from 'node:https';import {createResponseDemo} from './src/demo/engine.mjs';
import {reportStore} from './src/monitor-reports.mjs';import {createVexcel} from './src/demo/vexcel.mjs';import {voiceContext,floodStatus,evacuationRoute,signedUrl} from './src/demo/voice-agent.mjs';
import {databaseConfiguration,databaseHealth,closeDatabase} from './src/database.mjs';
import http from 'node:http';import {monitoringSnapshot} from './src/monitor.mjs';import {randomBytes} from 'node:crypto';import {readFile,appendFile,mkdir} from 'node:fs/promises';import {resolve,extname,sep} from 'node:path';import {fileURLToPath} from 'node:url';import {createSafeWay} from './src/safeway/engine.mjs';import {planResponse} from './src/demo/response-agent.mjs';import {modelConfiguration} from './src/models.mjs';import {matterportHouston,validateEvidenceManifest,sponsorGaps} from './src/safeway/sponsors.mjs';
const ROOT=fileURLToPath(new URL('.',import.meta.url)),PUBLIC=resolve(ROOT,'public');
const MIME={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.wasm':'application/wasm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webm':'video/webm','.wav':'audio/wav'};
export function createServer({engine,operatorToken=process.env.SAFEWAY_OPERATOR_TOKEN||'',journal=true,reportPath=resolve(ROOT,'data/runtime/monitor-reports.json'),demo,tls,triggerToken}={}){
 const ownsDemo=!demo;demo??=createResponseDemo();demo.startTimer();
 let journalQueue=Promise.resolve();const historySink=e=>{if(!journal)return;const record={...e,summary:['guidance','resident_action'].includes(e.type)?'De-identified resident decision/action':e.summary};journalQueue=journalQueue.then(async()=>{await mkdir(resolve(ROOT,'data/runtime'),{recursive:true});await appendFile(resolve(ROOT,'data/runtime/safeway-events.jsonl'),JSON.stringify(record)+'\n');}).catch(()=>{});};engine??=createSafeWay({historySink});let sponsorProbe,vexcel;
 const localOperatorToken=operatorToken||randomBytes(24).toString('base64url');
 const out=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 async function body(req){let text='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>24000)throw Object.assign(new Error('Body too large'),{status:413});text+=chunk;}return JSON.parse(text||'{}');}
 const session=req=>req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
 let exportQueue=Promise.resolve();
 const handler=async(req,res)=>{try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return out(res,403,{error:'Cross-origin request rejected'});
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  const isOperator=session(req)===localOperatorToken||(req.headers.cookie||'').split(';').some(c=>c.trim()==='safeway_operator='+localOperatorToken);
  if(path.startsWith('/api/demo/')){
   const bearer=session(req),post=()=>{if(req.method!=='POST')throw Object.assign(new Error('POST required'),{status:405});},admin=()=>{if(!isOperator)throw Object.assign(new Error('Dashboard authorization required'),{status:401});};
   {const m=/^\/api\/demo\/vexcel-tile\/(\d+)\/(\d+)\/(\d+)$/.exec(path);if(m&&req.method==='GET'){admin();vexcel??=createVexcel();const img=await vexcel.tile(m[1],m[2],m[3]);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=604800'});return res.end(img);}}
   if(path==='/api/demo/vexcel-photo'&&req.method==='GET'){if(!isOperator&&!bearer)throw Object.assign(new Error('Dashboard or connected device required'),{status:401});vexcel??=createVexcel();const img=await vexcel.photo(Object.fromEntries(url.searchParams));res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400','X-Attribution':'Imagery (c) Vexcel Imaging US, Inc.'});return res.end(img);}
   if(path==='/api/demo/connect'){post();return out(res,200,demo.connect(await body(req)));}
   if(path==='/api/demo/matterport-config'&&req.method==='GET'){admin();const b=demo.operatorState().scenario.building;if(!b)return out(res,404,{error:'This scenario has no Matterport building'});if(!process.env.MATTERPORT_SDK_KEY)return out(res,503,{error:'Local Matterport SDK key is not configured'});return out(res,200,{modelId:b.modelId,applicationKey:process.env.MATTERPORT_SDK_KEY,assetBase:'matterport-assets',note:'SDK key for browser use, restricted to localhost; the API token never leaves the server.'});}
   if(path==='/api/demo/agent'){admin();if(req.method==='GET'){const c=modelConfiguration();return out(res,200,{framework:'LangChain Deep Agents',provider:c.providerLabel,model:c.model,configured:c.configured,maxModelCalls:c.limits.maxCalls});}post();const input=await body(req);try{return out(res,200,await planResponse(demo,{question:input.question||undefined}));}catch(e){if(e.status)throw e;const quota=/Too many tokens|ThrottlingException|throttl/i.test(`${e.name} ${e.message}`);throw Object.assign(new Error(quota?'AWS Bedrock refused the request: this account has used its daily token quota (ThrottlingException). Try again later or ask AWS to raise the Bedrock quota.':'The model provider could not complete the request: '+String(e.message).slice(0,200)),{status:quota?429:502});}}
   if(path==='/api/demo/events'&&req.method==='GET'){
    if(!isOperator)demo.deviceState(bearer,{touch:false});
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    const send=()=>{if(res.destroyed)return;if(res.writableLength>1000000){res.end();return;}try{const state=isOperator?demo.operatorState():demo.deviceState(bearer,{touch:false});res.write('data: '+JSON.stringify(state)+'\n\n');}catch{res.end();}};
    const unsubscribe=demo.subscribe(send);send();const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n');},10000);req.on('close',()=>{clearInterval(heartbeat);unsubscribe();});return;
   }
   if(path.startsWith('/api/demo/audio/')&&req.method==='GET'){
    const text=demo.audioText(bearer,path.split('/').at(-1),isOperator);const {warningVoice}=await import('./src/demo/voice.mjs');const data=await warningVoice(text);
    // Recheck after synthesis so an obsolete warning cannot be fetched after withdrawal.
    demo.audioText(bearer,path.split('/').at(-1),isOperator);res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'});res.end(data);return;
   }
   if(path==='/api/demo/state'&&req.method==='GET')return out(res,200,isOperator?demo.operatorState():demo.deviceState(bearer));
   if(path==='/api/demo/control'||path==='/api/demo/trigger'){post();const triggerAuthorized=path==='/api/demo/trigger'&&triggerToken&&(url.searchParams.get('key')===triggerToken||req.headers['x-demo-key']===triggerToken);if(!triggerAuthorized)admin();const input=await body(req);if(path.endsWith('/trigger')){if(input.scenario)demo.control({action:'scenario',scenario:input.scenario});return out(res,200,demo.control({action:'start'}));}return out(res,200,demo.control(input));}
   // Two-way voice agent (ElevenLabs). The phone gets a signed session URL; the agent's tools come back here.
   if(path==='/api/demo/voice/status'){post();return out(res,200,demo.setVoiceStatus(bearer,await body(req)));}
   if(path==='/api/demo/voice/session'){post();const st=demo.voiceState(bearer);return out(res,200,{signedUrl:await signedUrl(),dynamicVariables:voiceContext(st)});}
   if(path==='/api/demo/voice/tool'){post();const input=await body(req),st=demo.voiceState(bearer),p=input.params||{};
    if(input.name==='get_flood_status')return out(res,200,floodStatus(st));
    if(input.name==='get_evacuation_route')return out(res,200,evacuationRoute(st,p));
    if(input.name==='report_trapped')return out(res,200,demo.voiceReport(bearer,{report:p}));
    throw Object.assign(new Error('Unknown voice tool'),{status:400});}
   if(path==='/api/demo/action'){post();return out(res,200,demo.deviceAction(bearer,await body(req)));}
   if(path==='/api/demo/location'){post();return out(res,200,demo.location(bearer,await body(req)));}
   if(path==='/api/demo/call/claim'){post();admin();return out(res,200,demo.claim(await body(req)));}
   if(path==='/api/demo/call'){post();return out(res,200,demo.callAction(bearer,await body(req),isOperator));}
   if(path==='/api/demo/signals'){if(req.method==='GET')return out(res,200,demo.poll(bearer,Number(url.searchParams.get('after'))||0,isOperator,url.searchParams.get('callerId')));post();return out(res,200,demo.signal(bearer,await body(req),isOperator));}
   if(path==='/api/demo/sos/ack'){post();return out(res,200,demo.acknowledge(bearer,await body(req),isOperator));}
   return out(res,404,{error:'Unknown demo endpoint'});
  }
  if(path.startsWith('/api/operator/')&&session(req)!==localOperatorToken&&!(req.headers.cookie||'').split(';').some(c=>c.trim()==='safeway_operator='+localOperatorToken))return out(res,401,{error:'Operator token required'});
  if(path==='/api/monitor/reports'){if(session(req)!==localOperatorToken&&!(req.headers.cookie||'').split(';').some(c=>c.trim()==='safeway_operator='+localOperatorToken))return out(res,401,{error:'Operator authorization required'});if(!['GET','POST'].includes(req.method))return out(res,405,{error:'GET or POST required'});const input=req.method==='POST'?await body(req):null;const assets=input?JSON.parse(await readFile(resolve(PUBLIC,'data/assets.json'),'utf8')):null;return out(res,200,await reportStore(reportPath,input,assets));}
  if(path==='/api/monitor'&&req.method==='GET')return out(res,200,await monitoringSnapshot(url.searchParams.get('region')||'houston'));
  if(path==='/api/database'&&req.method==='GET'){
   if(!isOperator)return out(res,401,{error:'Operator token required'});
   try{return out(res,200,{...databaseConfiguration(),health:await databaseHealth()});}
   catch(e){return out(res,503,{...databaseConfiguration(),health:{configured:true,ok:false},error:'Database connection failed'});}
  }
  if(path==='/api/operator/state'&&req.method==='GET')return out(res,200,engine.operatorState());
  if(path==='/api/operator/control'&&req.method==='POST'){const result=engine.control(await body(req));if(journal){const history=engine.exportHistory();exportQueue=exportQueue.then(async()=>{await mkdir(resolve(ROOT,'data/runtime'),{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile(resolve(ROOT,'data/runtime/safeway-history.json'),JSON.stringify(history,null,2)));}).catch(()=>{});}return out(res,200,result);}
  if(path==='/api/operator/invites'&&req.method==='POST')return out(res,200,{invites:engine.inviteLinks()});
  if(path==='/api/operator/sos/ack'&&req.method==='POST')return out(res,200,engine.acknowledgeSOS(await body(req)));
  if(path==='/api/operator/export'&&req.method==='GET')return out(res,200,engine.exportHistory());
  if(path==='/api/operator/sponsors'&&req.method==='POST'){sponsorProbe??=matterportHouston().catch(e=>{sponsorProbe=null;throw e;});return out(res,200,await sponsorProbe);}
  if(path==='/api/operator/matterport-config'&&req.method==='GET'){const modelId=url.searchParams.get('modelId');if(!modelId||!/^\w{8,24}$/.test(modelId))return out(res,400,{error:'Valid model ID required'});if(!process.env.MATTERPORT_SDK_KEY)return out(res,503,{error:'Local Matterport SDK key is not configured'});sponsorProbe??=matterportHouston().catch(e=>{sponsorProbe=null;throw e;});const catalog=await sponsorProbe;if(!catalog.candidates.some(m=>m.modelId===modelId))return out(res,403,{error:'Select an authorized Houston model from the sponsor list'});return out(res,200,{modelId,applicationKey:process.env.MATTERPORT_SDK_KEY,assetBase:'matterport-assets',apiTokenExposed:false});}
  if(path==='/api/operator/evidence'&&req.method==='POST'){const manifest=validateEvidenceManifest(await body(req));await mkdir(resolve(ROOT,'data/runtime'),{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile(resolve(ROOT,'data/runtime/safeway-sponsor-evidence.json'),JSON.stringify(manifest,null,2)));return out(res,200,{stored:true,missingSponsors:sponsorGaps(manifest),usedForGuidance:false,notice:'Reference metadata saved privately. Exercise policy is unchanged until approaches, entrances and check-in geometry are explicitly reviewed.'});}
  if(path==='/api/operator/supervisor'&&req.method==='POST'){const input=await body(req);const {explainEvidence}=await import('./src/safeway/supervisor.mjs');return out(res,200,await explainEvidence(engine.operatorState(),input));}
  if(path==='/api/resident/join'&&req.method==='POST')return out(res,200,engine.join(await body(req)));
  if(path==='/api/resident/state'&&req.method==='GET')return out(res,200,engine.residentState(session(req)));
  if(path==='/api/resident/position'&&req.method==='POST')return out(res,200,engine.position(session(req),await body(req)));
  if(path==='/api/resident/action'&&req.method==='POST')return out(res,200,engine.residentAction(session(req),await body(req)));
  if(path.startsWith('/api/'))return out(res,404,{error:'Unknown endpoint or method'});
  if(!['GET','HEAD'].includes(req.method))return out(res,405,{error:'GET required'});
  if(['/','/operator','/operator.html'].includes(path)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))res.setHeader('Set-Cookie','safeway_operator='+localOperatorToken+'; HttpOnly; SameSite=Strict; Path=/');
  const route={'/':'/demo/dashboard.html','/operator':'/demo/dashboard.html','/phone':'/demo/phone.html','/responder':'/demo/responder.html','/resident':'/resident.html','/demo':'/demo/dashboard.html','/monitor':'/monitor.html'}[path]||path;
  const local=resolve(PUBLIC,'.'+route);if(!local.startsWith(PUBLIC+sep))return out(res,403,{error:'Invalid path'});
  let data;try{data=await readFile(local);}catch{return out(res,404,{error:'Not found'});}
  res.writeHead(200,{'Content-Type':MIME[extname(local)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){out(res,e.status||400,{error:e.message||'Invalid request'});}};
 const server=tls?https.createServer(tls,handler):http.createServer(handler);
 server.on('close',()=>{engine.close();if(ownsDemo)demo.close();void closeDatabase();});return {server,engine,demo};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const host=process.env.HOST||'127.0.0.1';if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.SAFEWAY_OPERATOR_TOKEN)throw new Error('Set SAFEWAY_OPERATOR_TOKEN before exposing the server to your LAN.');
 const {server,engine}=createServer();engine.startTimer();server.listen(Number(process.env.PORT||4173),host,()=>console.log(`SafeWay ready: http://${host}:${process.env.PORT||4173}/operator`));
}
