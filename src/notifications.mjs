/** Real opt-in drill alerts. Playback never calls this module's external transports. */
import {createHash} from 'node:crypto';
import {evacuationMessage} from './simulation.mjs';
import {initiateTestCall,voiceConfiguration} from './voice.mjs';
const key=s=>{const h=createHash('sha256').update(s).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export function alertConfiguration(env=process.env){let contacts={};try{contacts=JSON.parse(env.HEADWATER_ALERT_CONTACTS||'{}');}catch{}return {textConfigured:Boolean(env.PHOTON_API_KEY&&env.PHOTON_PROJECT_ID&&env.PHOTON_AGENT_USER_ID),voiceConfigured:voiceConfiguration(env).configured,personIds:Object.entries(contacts).filter(([id,v])=>/^HH-0[123]$/.test(id)&&typeof v==='string'&&/^\+[1-9]\d{6,14}$/.test(v)).map(([id])=>id),contactCount:Object.values(contacts).filter(x=>typeof x==='string'&&/^\+[1-9]\d{6,14}$/.test(x)).length};}
export async function sendPhotonText({to,text,idempotencyKey},{env=process.env,fetchImpl=fetch}={}){
 const base=`https://api.photon.codes/v1/projects/${encodeURIComponent(env.PHOTON_PROJECT_ID)}`;
 async function post(path,body,suffix){const r=await fetchImpl(base+path,{method:'POST',headers:{Authorization:`Bearer ${env.PHOTON_API_KEY}`,'Content-Type':'application/json','idempotency-key':key(idempotencyKey+suffix)},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Photon did not accept the text request.');const value=await r.json();if(typeof value.id!=='string')throw new Error('Photon response lacks an object ID; check provider logs before retrying.');return value;}
 const recipient=await post('/users',{platform:'sms',handle:to},'user');
 const space=await post('/spaces',{platform:'sms',participantIds:[env.PHOTON_AGENT_USER_ID,recipient.id]},'space');
 const message=await post('/messages',{spaceId:space.id,senderId:env.PHOTON_AGENT_USER_ID,content:{type:'text',format:'plain',text}},'message');
 return {status:'provider_accepted',provider:'Photon',providerId:message.id,acknowledged:false};
}
export function createAlertDispatcher({env=process.env,fetchImpl=fetch,ledger=new Map(),save=async()=>{}}={}){
 const inFlight=new Map();
 return {async dispatch(plan,input){
  if(input.approval!=='SEND TEST ALERTS'||input.routeConfirmed!==true)throw new Error('Approve the test alerts and confirm the exercise route before sending.');
  if(!plan.exercise)throw new Error('Only opt-in drill alerts are supported.');
  const channels=input.channels||['text','voice'];if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(c=>!['text','voice'].includes(c)))throw new Error('Select text and/or voice.');
  const config=alertConfiguration(env);if(channels.includes('text')&&!config.textConfigured||channels.includes('voice')&&!config.voiceConfigured)throw new Error('Selected alert providers are not configured. No alerts sent.');
  let contacts;try{contacts=JSON.parse(env.HEADWATER_ALERT_CONTACTS||'{}');}catch{throw new Error('Configure the server exercise contact mapping.');}
  const allow=new Set((env.HEADWATER_TEST_RECIPIENTS||'').split(',').map(x=>x.trim()).filter(Boolean));
  const selected=input.personIds?plan.people.filter(p=>input.personIds.includes(p.id)):plan.people;
  if(!selected.length||selected.length>3)throw new Error('Select one to three known drill households.');
  for(const p of selected){if(p.route.status!=='candidate')throw new Error('A selected household has no mapped candidate access. Replan before sending directions.');if(!/^\+[1-9]\d{6,14}$/.test(contacts[p.id]||'')||!allow.has(contacts[p.id]))throw new Error('Every recipient must be configured and on the opt-in test allowlist.');}
  const jobs=selected.flatMap(p=>[...new Set(channels)].map(channel=>({person:p,channel,id:`${plan.id}:${p.id}:${channel}`})));
  return Promise.all(jobs.map(job=>{
   if(inFlight.has(job.id))return inFlight.get(job.id);
   if(ledger.has(job.id))return Promise.resolve({...ledger.get(job.id),duplicate:true});
   const promise=(async()=>{
    const record={id:job.id,personId:job.person.id,channel:job.channel,status:'pending',acknowledged:false,createdAt:new Date().toISOString()};ledger.set(job.id,record);await save(ledger);
    try{const text=evacuationMessage(job.person);
     const result=job.channel==='text'?await sendPhotonText({to:contacts[job.person.id],text,idempotencyKey:job.id},{env,fetchImpl}):await initiateTestCall({to:contacts[job.person.id],requestId:job.person.id,approval:'CALL TEST PARTICIPANT',evacuationMessage:text},{env,fetchImpl});Object.assign(record,{status:'provider_accepted',provider:result.provider,providerId:result.providerId||result.callId||result.conversationId});
    }catch{record.status='provider_error_or_unknown';record.message='Check provider logs before retrying; delivery is unconfirmed.';}
    await save(ledger);return {...record};
   })();inFlight.set(job.id,promise);promise.finally(()=>inFlight.delete(job.id)).catch(()=>{});return promise;
  }));
 }};
}
