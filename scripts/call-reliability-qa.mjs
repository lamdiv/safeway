import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {createServer} from '../server.mjs';
import {createResponseDemo} from '../src/demo/engine.mjs';

await mkdir('outputs',{recursive:true});
let offset=0, hold=false, releases=[], injectFault=null;
const demo=createResponseDemo({phoneKey:'test-phone',responderKey:'test-responder',now:()=>Date.now()+offset});
const {server}=createServer({demo,journal:false});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--mute-audio']});
const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext({viewport:{width:390,height:844}})]);
for(const context of contexts)await context.route('**/demo/map.mjs',route=>route.fulfill({contentType:'application/javascript',body:"export class ResponseMap{constructor(id){document.getElementById(id).dataset.ready='true'}update(){}locate(){}gps(){}}"}));
for(const context of contexts.slice(0,2)){
 await context.route('**/api/demo/events',route=>route.abort());
 await context.route('**/api/demo/state',async route=>{if(hold)await new Promise(resolve=>releases.push(resolve));await route.continue();});
 await context.route('**/api/demo/signals',async route=>{
  const input=route.request().method()==='POST'?route.request().postDataJSON():null;
  if(injectFault&&input?.type==='offer'){
   const fault=injectFault;injectFault=null;
   if(fault==='lost-response')await route.fetch();
   return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Injected transient connection failure"}'});
  }
  return route.continue();
 });
}
let ops=await Promise.all(contexts.slice(0,2).map(c=>c.newPage()));
const phone=await contexts[2].newPage(),errors=[],results=[];
function observe(page){page.on('pageerror',e=>errors.push(e.message));}
ops.forEach(observe);observe(phone);
const release=()=>{hold=false;for(const resolve of releases)resolve();releases=[];};
async function media(callId,attempt){
 const deadline=Date.now()+20000;let stats;
 while(Date.now()<deadline){
  stats=await phone.evaluate(async()=>(await import('/demo/phone.mjs')).rtc.stats());
  const verified=stats.find(r=>r.callId===callId&&r.attempt===attempt&&r.bytesReceived>1000&&r.totalAudioEnergy>0);
  if(verified)return verified;
  await new Promise(r=>setTimeout(r,150));
 }
 throw new Error('No decoded voice for '+callId+' attempt '+attempt+': '+JSON.stringify(stats));
}
try{
 await Promise.all(ops.map(p=>p.goto(base)));
 for(let index=0;index<8;index++){
  const scenario=index%2?'houston':'rasuwa';
  await ops[0].locator('.scenario-tabs button[data-scenario="'+scenario+'"]').click();
  if(index)await ops[1].locator('.scenario-tabs button[data-scenario="'+scenario+'"]').click();
  await phone.goto(base+'/phone?key=test-phone&person='+scenario+'-a');
  const joined=phone.waitForResponse(r=>r.url().endsWith('/api/demo/connect')&&r.request().method()==='POST');
  await phone.locator('#connect').click();const token=(await(await joined).json()).token;
  await phone.waitForFunction(()=>document.body.dataset.connected==='true');
  hold=true;injectFault=index===3?'before-send':index===5?'lost-response':null;
  demo.control({action:'start'});
  if(scenario==='rasuwa')for(let i=0;i<15;i++){offset+=1000;demo.deviceState(token);}
  demo.control({action:'pause'});
  await phone.locator('#call-screen:not([hidden])').waitFor();
  await phone.locator('#answer').click();
  await phone.waitForFunction(()=>document.body.dataset.callStatus==='answered',null,{timeout:10000,polling:100});
  const call=demo.deviceState(token).call;
  if(call.status!=='answered')throw new Error('Failed to exercise Answer before offer');
  release();
  const first=await media(call.id,1);
  const counts=await Promise.all(ops.map(p=>p.evaluate(async id=>(await import('/demo/dashboard.mjs')).host.peers.has(id)?1:0,call.id)));
  if(counts.reduce((a,b)=>a+b,0)!==1)throw new Error('Competing dashboard callers');
  const result={scenario,fastAnswer:true,oneCaller:true,first,fault:index===3?'temporary-503':index===5?'lost-offer-response':null};
  if(index===2){
   const winner=counts.indexOf(1);
   await ops[winner].evaluate(async id=>{const h=(await import('/demo/dashboard.mjs')).host;await h.fail(h.peers.get(id),'ice_failed');},call.id);
   result.recovered=await media(call.id,2);
  }
  if(index===4){
   const winner=counts.indexOf(1);await ops[winner].close();
   for(let i=0;i<9;i++){offset+=1000;demo.deviceState(token);}
   result.callerTakeover=await media(call.id,2);
   ops[winner]=await contexts[winner].newPage();observe(ops[winner]);await ops[winner].goto(base);
  }
  await phone.locator('#decline').click();
  results.push(result);console.log('PASS cycle '+(index+1)+' '+scenario+(result.recovered?' · peer recovery':'')+(result.callerTakeover?' · dashboard takeover':'')+(result.fault?' · '+result.fault:''));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile('outputs/call-reliability-qa.json',JSON.stringify({passed:true,cycles:8,independentDashboards:2,realDecodedVoice:true,results,errors},null,2));
 console.log('PASS: repeated early answers, duplicate dashboards, transient signaling loss, peer recovery and caller takeover.');
}catch(error){console.log(JSON.stringify({error:error.message,calls:demo.operatorState().calls,events:demo.operatorState().events.slice(0,12),phone:await phone.evaluate(async()=>({dataset:{...document.body.dataset},events:(await import('/demo/phone.mjs')).rtc.connectionEvents}))},null,2));throw error;}
finally{release();await browser.close();await new Promise(r=>server.close(r));demo.close();}
