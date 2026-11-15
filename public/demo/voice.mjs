// Direct two-way conversation. Browser mic consent is obtained from the initial Connect gesture.
import {$,api} from './common.mjs';
let conversation=null,starting=false,generation=0,micGranted=false,lastUpdate=null;
const TOOL_LABEL={get_flood_status:'Checked the live flood',get_evacuation_route:'Looked up the way out',report_trapped:'Sent your report to the responder'};
function log(role,text){const li=document.createElement('li');li.className='voice-line '+role;const who=document.createElement('b');who.textContent=role==='user'?'You':role==='tool'?'SafeWay ✓':'SafeWay';const t=document.createElement('span');t.textContent=text;li.append(who,t);const list=$('#voice-log');list.append(li);while(list.children.length>12)list.firstElementChild.remove();}
function status(text,mode){$('#voice-status').textContent=text;$('#voice-agent').dataset.mode=mode||'';}
// Full-screen call view while connecting or talking, and while an error is showing (End closes it).
function setLive(live){const card=$('#voice-agent'),open=live||starting||card.dataset.mode==='error';$('#voice-start').hidden=live||starting;
 card.classList.toggle('live',open);document.body.classList.toggle('voice-open',open);const end=$('#voice-end');end.hidden=false;const label=end.querySelector('small');if(label)label.textContent=starting&&!live?'Cancel':'End';end.setAttribute('aria-label',starting&&!live?'Cancel connection':'End conversation');
 if(!open)$('#voice-log').replaceChildren();}
export async function prepareVoice(){
 if(!isSecureContext)throw new Error('Open the HTTPS phone link to enable the microphone.');
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('This browser cannot access a microphone. Open the HTTPS link in Safari or Chrome.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());micGranted=true;
}
async function client(){try{return await import('/vendor/elevenlabs-client.mjs');}catch{throw new Error('Voice components could not load. Restart the app with npm run dev and refresh this page.');}}
export async function startVoice({getToken,onReport,muteWarningCall,onState=()=>{}}){
 if(conversation||starting)return false;
 const current=++generation;starting=true;$('#voice-start').disabled=true;$('#voice-start').hidden=true;status('Connecting your conversation…','connecting');setLive(false);
 const report=s=>api('voice/status',{token:getToken(),data:{status:s}}).catch(()=>{});
 try{
  if(!micGranted)await prepareVoice();
  if(current!==generation)return false;
  await report('connecting');
  const [{Conversation},session]=await Promise.all([client(),api('voice/session',{token:getToken(),data:{},signal:AbortSignal.timeout(20000)})]);
  if(current!==generation)return false;
  const tool=name=>async params=>{try{const data=await api('voice/tool',{token:getToken(),data:{name,params}});log('tool',TOOL_LABEL[name]+(name==='report_trapped'?(data.responders?' · responder online':' · report queued'):''));if(name==='report_trapped')onReport?.(data);return JSON.stringify(data);}catch(e){return 'Tool unavailable: '+e.message;}};
  muteWarningCall?.(true);
  const result=await Conversation.startSession({signedUrl:session.signedUrl,connectionType:'websocket',dynamicVariables:session.dynamicVariables,
   clientTools:{get_flood_status:tool('get_flood_status'),get_evacuation_route:tool('get_evacuation_route'),report_trapped:tool('report_trapped')},
   onConnect:()=>{if(current!==generation)return;status('Listening · speak naturally','listening');$('#voice-end').hidden=false;onState('connected');report('connected');},
   onDisconnect:()=>{if(current!==generation)return;conversation=null;starting=false;setLive(false);status('Conversation ended. Reconnect when ready.','');muteWarningCall?.(false);onState('ended');report('ended');},
   onError:error=>{if(current!==generation)return;status(error?.message||'Voice connection interrupted','error');onState('error');report('error');},
   onModeChange:({mode})=>{if(current===generation)status(mode==='speaking'?'SafeWay is speaking…':'Listening · speak naturally',mode);},
   onMessage:message=>{if(current===generation&&message?.message&&!/^[\s.…]*$/.test(message.message))log(message.source==='user'||message.role==='user'?'user':'ai',message.message);},
  });
  if(current!==generation){await result.endSession();return false;}
  conversation=result;starting=false;setLive(true);return true;
 }catch(error){if(current===generation){status(error.name==='NotAllowedError'?'Microphone blocked. Allow microphone access, then reconnect.':error.message,'error');conversation=null;starting=false;setLive(false);muteWarningCall?.(false);onState('error');report('error');}return false;}
 finally{if(current===generation){starting=false;$('#voice-start').disabled=false;setLive(!!conversation);}}
}
export function updateVoiceState(state){
 if(!conversation)return;const g=state.person?.guidance,key=state.runId+':'+state.mode+':'+(g?.revision||0);if(key===lastUpdate)return;lastUpdate=key;
 const update={drill:state.mode,zone:g?.zone,action:g?.action,instruction:g?.instruction,etaSeconds:g?.etaSeconds,routeWithdrawn:g?.routeWithdrawn,rescueRequested:!!state.sos};
 try{conversation.sendContextualUpdate('Current authoritative drill guidance: '+JSON.stringify(update));if(g?.routeWithdrawn)conversation.sendUserMessage('The current drill route was withdrawn. Relay the updated authoritative guidance immediately: '+g.instruction);}catch{}
}
export async function endVoice(){generation++;starting=false;lastUpdate=null;const previous=conversation;conversation=null;try{await previous?.endSession();}catch{}status('Conversation ended. Reconnect when ready.','');setLive(false);$('#voice-start').disabled=false;}
export const voiceActive=()=>!!conversation;
export const voiceStarting=()=>starting;
