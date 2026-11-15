// Warning phone ↔ SafeWay voice agent (ElevenLabs). Two-way: the resident speaks, the agent answers from the
// live drill and the building guide, and can file a "trapped" report to the responder. The phone asks our
// server for a signed session URL (the API key stays on the server); the agent's tools call back to the server.
import {$,api} from './common.mjs';

let conversation=null,starting=false;
const TOOL_LABEL={get_flood_status:'Checked the live flood',get_evacuation_route:'Looked up the way out',report_trapped:'Sent your report to the responder'};

function log(role,text){const li=document.createElement('li');li.className='voice-line '+role;const who=document.createElement('b');who.textContent=role==='user'?'You':role==='tool'?'SafeWay ✓':'SafeWay';const t=document.createElement('span');t.textContent=text;li.append(who,t);const list=$('#voice-log');list.append(li);while(list.children.length>12)list.firstElementChild.remove();li.scrollIntoView({block:'nearest'});}
function status(text,mode){$('#voice-status').textContent=text;$('#voice-agent').dataset.mode=mode||'';}
function setLive(live){$('#voice-agent').classList.toggle('live',live);document.body.classList.toggle('voice-open',live);if(!live)$('#voice-log').replaceChildren();}

/** Start a conversation. `getToken` returns the phone's device token; `onReport` refreshes the phone after a report. */
export async function startVoice({getToken,onReport,muteWarningCall}){
 if(conversation||starting)return;starting=true;$('#voice-start').disabled=true;status('Connecting to SafeWay…','connecting');$('#voice-agent').classList.add('live');document.body.classList.add('voice-open');
 try{
  if(!isSecureContext)throw new Error('Talking needs HTTPS (open the phone link on the https:// port).');
  await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>s.getTracks().forEach(t=>t.stop()));  // ask for the mic first, with a clear prompt
  const [{Conversation},session]=await Promise.all([import('/vendor/elevenlabs-client.mjs'),api('voice/session',{token:getToken(),data:{}})]);
  const tool=name=>async params=>{
   try{const r=await fetch('/api/demo/voice/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({name,params}),signal:AbortSignal.timeout(8000)});
    const data=await r.json();if(!r.ok)return 'Tool error: '+(data.error||r.status);log('tool',TOOL_LABEL[name]+(name==='report_trapped'?(data.responders?` · ${data.responders} responder online`:' · responder will see it on the dashboard'):''));if(name==='report_trapped')onReport?.(data);return JSON.stringify(data);}
   catch(e){return 'Tool unavailable: '+e.message;}};
  muteWarningCall?.(true);
  conversation=await Conversation.startSession({signedUrl:session.signedUrl,connectionType:'websocket',dynamicVariables:session.dynamicVariables,
   clientTools:{get_flood_status:tool('get_flood_status'),get_evacuation_route:tool('get_evacuation_route'),report_trapped:tool('report_trapped')},
   onConnect:()=>{setLive(true);status('Connected · speak any time','listening');},
   onDisconnect:()=>{conversation=null;setLive(false);muteWarningCall?.(false);status('Conversation ended. Tap to talk again.','');},
   onError:e=>{status('Voice error: '+(e?.message||e),'error');},
   onModeChange:({mode})=>status(mode==='speaking'?'SafeWay is speaking…':'Listening…',mode),
   onMessage:m=>{if(m?.message&&!/^[\s.…]*$/.test(m.message))log(m.source==='user'||m.role==='user'?'user':'ai',m.message);}});
 }catch(e){status(e.name==='NotAllowedError'?'Microphone blocked. Allow the microphone in your browser settings, then try again.':e.message,'error');conversation=null;muteWarningCall?.(false);}  // stays open so the message is readable; End closes it
 finally{starting=false;$('#voice-start').disabled=false;}
}
export async function endVoice(){const c=conversation;conversation=null;try{await c?.endSession();}catch{}setLive(false);}
export const voiceActive=()=>!!conversation;
