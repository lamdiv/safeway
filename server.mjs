import http from 'node:http';import {randomBytes} from 'node:crypto';import {readFile,appendFile,mkdir} from 'node:fs/promises';import {resolve,extname,sep} from 'node:path';import {fileURLToPath} from 'node:url';import {createSafeWay} from './src/safeway/engine.mjs';import {matterportHouston,validateEvidenceManifest,sponsorGaps} from './src/safeway/sponsors.mjs';
const ROOT=fileURLToPath(new URL('.',import.meta.url)),PUBLIC=resolve(ROOT,'public');
const MIME={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webm':'video/webm'};
export function createServer({engine,operatorToken=process.env.SAFEWAY_OPERATOR_TOKEN||'',journal=true}={}){
 let journalQueue=Promise.resolve();const historySink=e=>{if(!journal)return;const record={...e,summary:['guidance','resident_action'].includes(e.type)?'De-identified resident decision/action':e.summary};journalQueue=journalQueue.then(async()=>{await mkdir(resolve(ROOT,'data/runtime'),{recursive:true});await appendFile(resolve(ROOT,'data/runtime/safeway-events.jsonl'),JSON.stringify(record)+'\n');}).catch(()=>{});};engine??=createSafeWay({historySink});let sponsorProbe;
 const localOperatorToken=operatorToken||randomBytes(24).toString('base64url');
 const out=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 async function body(req){let text='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>24000)throw Object.assign(new Error('Body too large'),{status:413});text+=chunk;}return JSON.parse(text||'{}');}
 const session=req=>req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
 let exportQueue=Promise.resolve();
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return out(res,403,{error:'Cross-origin request rejected'});
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(path.startsWith('/api/operator/')&&session(req)!==localOperatorToken&&!(req.headers.cookie||'').split(';').some(c=>c.trim()==='safeway_operator='+localOperatorToken))return out(res,401,{error:'Operator token required'});
  if(path==='/api/operator/state'&&req.method==='GET')return out(res,200,engine.operatorState());
  if(path==='/api/operator/control'&&req.method==='POST'){const result=engine.control(await body(req));if(journal){const history=engine.exportHistory();exportQueue=exportQueue.then(async()=>{await mkdir(resolve(ROOT,'data/runtime'),{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile(resolve(ROOT,'data/runtime/safeway-history.json'),JSON.stringify(history,null,2)));}).catch(()=>{});}return out(res,200,result);}
  if(path==='/api/operator/invites'&&req.method==='POST')return out(res,200,{invites:engine.inviteLinks()});
  if(path==='/api/operator/sos/ack'&&req.method==='POST')return out(res,200,engine.acknowledgeSOS(await body(req)));
  if(path==='/api/operator/export'&&req.method==='GET')return out(res,200,engine.exportHistory());
  if(path==='/api/operator/sponsors'&&req.method==='POST'){sponsorProbe??=matterportHouston().catch(e=>{sponsorProbe=null;throw e;});return out(res,200,await sponsorProbe);}
  if(path==='/api/operator/evidence'&&req.method==='POST'){const manifest=validateEvidenceManifest(await body(req));await mkdir(resolve(ROOT,'data/runtime'),{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile(resolve(ROOT,'data/runtime/safeway-sponsor-evidence.json'),JSON.stringify(manifest,null,2)));return out(res,200,{stored:true,missingSponsors:sponsorGaps(manifest),usedForGuidance:false,notice:'Reference metadata saved privately. Exercise policy is unchanged until approaches, entrances and check-in geometry are explicitly reviewed.'});}
  if(path==='/api/operator/supervisor'&&req.method==='POST'){const input=await body(req);const {explainEvidence}=await import('./src/safeway/supervisor.mjs');return out(res,200,await explainEvidence(engine.operatorState(),input));}
  if(path==='/api/resident/join'&&req.method==='POST')return out(res,200,engine.join(await body(req)));
  if(path==='/api/resident/state'&&req.method==='GET')return out(res,200,engine.residentState(session(req)));
  if(path==='/api/resident/position'&&req.method==='POST')return out(res,200,engine.position(session(req),await body(req)));
  if(path==='/api/resident/action'&&req.method==='POST')return out(res,200,engine.residentAction(session(req),await body(req)));
  if(path.startsWith('/api/'))return out(res,404,{error:'Unknown endpoint or method'});
  if(!['GET','HEAD'].includes(req.method))return out(res,405,{error:'GET required'});
  if(!operatorToken&&['/','/operator','/operator.html'].includes(path)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))res.setHeader('Set-Cookie','safeway_operator='+localOperatorToken+'; HttpOnly; SameSite=Strict; Path=/');
  const route={'/':'/operator.html','/operator':'/operator.html','/resident':'/resident.html','/demo':'/demo.html'}[path]||path;
  const local=resolve(PUBLIC,'.'+route);if(!local.startsWith(PUBLIC+sep))return out(res,403,{error:'Invalid path'});
  let data;try{data=await readFile(local);}catch{return out(res,404,{error:'Not found'});}
  res.writeHead(200,{'Content-Type':MIME[extname(local)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){out(res,e.status||400,{error:e.message||'Invalid request'});}});
 server.on('close',()=>engine.close());return {server,engine};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const host=process.env.HOST||'127.0.0.1';if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.SAFEWAY_OPERATOR_TOKEN)throw new Error('Set SAFEWAY_OPERATOR_TOKEN before exposing the server to your LAN.');
 const {server,engine}=createServer();engine.startTimer();server.listen(Number(process.env.PORT||4173),host,()=>console.log(`SafeWay ready: http://${host}:${process.env.PORT||4173}/operator`));
}
