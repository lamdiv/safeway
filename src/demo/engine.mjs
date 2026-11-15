import {assessGuidance,zoneAssessment,CLOCK_SCALE} from './guidance.mjs';
import {randomBytes,randomUUID} from 'node:crypto';import {scenarios,hazardAt,warningAt,riskAt,interpolateRoute,zonesAt,zoneOf,clientHazard,clientWarning,clientZones} from './scenarios.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});},token=()=>randomBytes(24).toString('base64url');
export function createResponseDemo({phoneKey=token(),responderKey=token(),now=Date.now}={}){
 let runId=randomUUID(),scenarioId='rasuwa',mode='ready',elapsed=0,modelTime=0,speed=1,revision=0,lastTick=now(),sessions=new Map(),calls=new Map(),events=[],signals=[],sequence=0,acks=new Map(),sos=new Map(),history=[],timer;const signalIds=new Map(),guidances=new Map(),held=new Map(),arrivals=new Set(),listeners=new Set();let publishing=false,lastAssessment=-Infinity;
 const notify=()=>{if(publishing)return;publishing=true;queueMicrotask(()=>{publishing=false;for(const callback of listeners)try{callback();}catch{}});};
 const s=()=>scenarios[scenarioId],event=(kind,message,personId=null)=>{events.unshift({id:randomUUID(),kind,message,personId,at:new Date(now()).toISOString()});events=events.slice(0,60);notify();};
 const session=bearer=>{const x=sessions.get(bearer);if(!x)fail('Connect this device again',401);return x;};
 const owned=(bearer,id)=>{const x=session(bearer),c=calls.get(id);if(!c||c.runId!==runId)fail('Call no longer active',410);if(x.role!=='phone'||c.sessionId!==x.id)fail('Not your call',403);return {x,c};};
 function position(p){const a=acks.get(p.id),g=guidances.get(p.id);if(a&&g?.action==='evacuate'&&a.revision===g.revision)return interpolateRoute(g.route,(elapsed-a.at)/12);return held.get(p.id)||p.start;}
 function liveGuidance(p){const g=guidances.get(p.id);if(!g)return null;return {...g,...zoneAssessment(scenarioId,position(p),modelTime,speed)};}
 function person(p){const a=acks.get(p.id),g=liveGuidance(p),devices=[...sessions.values()].filter(x=>x.personId===p.id&&x.sharing),call=[...calls.values()].filter(c=>c.personId===p.id&&c.runId===runId).at(-1),arrived=arrivals.has(p.id),atRisk=mode!=='ready'&&g?.zone!=='green';return {...p,instruction:g?.instruction||'Await scenario start',audio:call?.audio||null,zone:g?.zone||zoneAssessment(scenarioId,p.start).zone,position:position(p),guidance:g,route:g?.route||[],destination:g?.destination||p.destination,atRisk,arrived,deviceConnected:devices.some(x=>now()-x.lastSeen<10000),call:call?publicCall(call):null,status:g?.routeWithdrawn?'sheltering':sos.has(p.id)?'needs_help':arrived?'arrived':a&&g?.action==='evacuate'?'evacuating':call?.status==='connected'?'in_call':call&&['ringing','offering','answered','reconnecting'].includes(call.status)?'calling':atRisk?'at_risk':'monitoring',acknowledged:!!a&&a.revision===g?.revision};}
 function updateGuidance(force=false){
  if(!force&&guidances.size&&now()-lastAssessment<200)return;lastAssessment=now();
  for(const p of s().people){const previous=guidances.get(p.id),currentPosition=position(p),next=assessGuidance(scenarioId,p,{position:currentPosition,modelTime,speed,withdrawn:previous?.routeWithdrawn});
   if(previous?.action==='evacuate'&&acks.has(p.id)&&elapsed-acks.get(p.id).at<12&&next.action==='monitor'){next.action='evacuate';next.route=p.route;next.destination=p.destination;next.title='Outside mapped exposure · continue to assembly';next.instruction='Continue on the current demo route to '+p.destination.name+'.';next.message='This is a SafeWay drill. Your current position is outside the modeled water. '+next.instruction;}
   // An arriving resident's reviewed destination remains a monitoring location in this exercise.
   if(arrivals.has(p.id)||acks.has(p.id)&&previous?.action==='evacuate'&&elapsed-acks.get(p.id).at>=12){arrivals.add(p.id);next.action='monitor';next.route=[];next.routeWithdrawn=false;next.rescueRequired=false;next.instruction='You reached the demo assembly point. Remain there and monitor updates.';next.title='Demo assembly reached';next.message='This is a SafeWay drill. You reached the demo assembly point. Remain there and monitor updates.';}
   const signature=[next.zone,next.action,speed].join(':');
   if(!force&&previous?.signature===signature)continue;
   const value={...next,signature,revision:++revision,issuedAt:new Date(now()).toISOString(),issuedAtModelTime:modelTime};
   if(previous){const ack=acks.get(p.id);if(ack&&previous.action==='evacuate'&&value.action==='evacuate')ack.revision=value.revision;else{held.set(p.id,currentPosition);acks.delete(p.id);}value.supersedes=previous.revision;}
   // Route publication and old-call cancellation happen before the new voice call can be claimed.
   for(const c of calls.values())if(c.personId===p.id&&c.runId===runId&&c.guidanceRevision!==value.revision&&!['cancelled','declined'].includes(c.status)){c.status='cancelled';c.cancelReason='guidance_replaced';}
   guidances.set(p.id,value);
   if(value.rescueRequired){const request=sos.get(p.id);sos.set(p.id,{...request,personId:p.id,at:request?.at||new Date(now()).toISOString(),acknowledged:request?.automatic&&request?.refuge?.id===value.refuge?.id?request.acknowledged:false,automatic:true,reason:'unsafe_route',guidanceRevision:value.revision,position:currentPosition,refuge:value.refuge});}
   event(value.routeWithdrawn?'withdrawal':'guidance',p.name+': '+value.title,p.id);
  }
 }
 function publicCall(c){const {sessionId,callerId,callerSeen,...rest}=c;return rest;}
 function tick(){const current=now();if(mode==='running'){const delta=Math.max(0,Math.min(5,(current-lastTick)/1000));elapsed=Math.min(s().duration,elapsed+delta);modelTime=Math.min(s().duration,modelTime+delta*speed);if(elapsed>=s().duration)mode='complete';}lastTick=current;
  if(mode==='running')updateGuidance();
  if(mode!=='ready')for(const p of s().people){const guidance=guidances.get(p.id);if(!guidance)continue;for(const x of sessions.values()){if(x.role!=='phone'||x.voiceMode==='conversation'||x.personId!==p.id||!x.sharing||current-x.lastSeen>10000)continue;if([...calls.values()].some(c=>c.runId===runId&&c.sessionId===x.id&&c.guidanceRevision===guidance.revision))continue;const c={id:randomUUID(),runId,personId:p.id,sessionId:x.id,status:'ringing',createdAt:new Date(current).toISOString(),deadline:new Date(current+180000).toISOString(),attempt:0,guidanceRevision:guidance.revision,zone:guidance.zone,action:guidance.action,audio:null,instruction:guidance.message,destination:guidance.destination};c.audio=s().callOnStart&&p.audio?p.audio:'/api/demo/audio/'+c.id;calls.set(c.id,c);event('call','Automatic warning call → '+p.name,p.id);}}
  for(const c of calls.values()){if(c.status==='answered'&&current-Date.parse(c.negotiatingAt||c.answeredAt)>30000)retry(c,'negotiation_timeout');else if(c.status==='connected'&&current-Date.parse(c.connectedAt)>90000)retry(c,'media_timeout');}
  for(const c of calls.values())if(['ringing','offering'].includes(c.status)&&current-Date.parse(c.createdAt)>60000){c.status='missed';event('missed','Warning call was not answered',c.personId);}
 }
 function control(input){if(!['start','pause','reset','scenario','speed'].includes(input.action))fail('Unknown action');tick();if(input.action==='scenario'){if(!scenarios[input.scenario])fail('Unknown scenario');scenarioId=input.scenario;for(const x of sessions.values())if(x.role==='phone'&&x.followScenario&&x.sharing){x.personId=s().people[Math.min(x.residentSlot,s().people.length-1)].id;x.voiceStatus='idle';}reset();}else if(input.action==='speed'){if(![1,2,4].includes(input.speed))fail('Speed must be 1, 2 or 4');if(input.speed===speed)return operatorState();speed=input.speed;if(mode!=='ready')updateGuidance(true);event('speed','Flood progression changed to '+speed+'×');}else if(input.action==='reset')reset();else if(input.action==='start'){if(mode==='complete')reset();mode='running';lastTick=now();updateGuidance();event('start',s().hazard+' simulation started');}else{mode='paused';event('pause','Simulation paused');}return operatorState();}
 function reset(){for(const c of calls.values())c.status='cancelled';history.push({runId,endedAt:new Date(now()).toISOString()});runId=randomUUID();elapsed=0;modelTime=0;speed=1;revision=0;lastAssessment=-Infinity;mode='ready';guidances.clear();held.clear();arrivals.clear();acks.clear();sos.clear();signals=[];signalIds.clear();calls.clear();events=[];lastTick=now();event('reset',s().title+' ready');}
 function operatorState(){tick();return {runId,mode,elapsed,modelTime,speed,revision,clockScale:CLOCK_SCALE,scenario:{...s(),flow:s().flow,people:undefined,flood:undefined},zones:clientZones(scenarioId),people:s().people.map(person),hazard:clientHazard(scenarioId,modelTime),warning:mode==='ready'?{type:'FeatureCollection',features:[]}:clientWarning(scenarioId,modelTime),calls:[...calls.values()].map(publicCall),conversations:[...sessions.values()].filter(x=>x.role==='phone'&&x.sharing&&x.voiceMode==='conversation'&&now()-x.lastSeen<10000&&s().people.some(p=>p.id===x.personId)).map(x=>({personId:x.personId,status:x.voiceStatus})),events,responders:[...sessions.values()].filter(x=>x.role==='responder'&&now()-x.lastSeen<10000).length,sos:[...sos.values()],serverTime:new Date(now()).toISOString(),simulation:true};}
 function connect(input){const role=input.key===phoneKey?'phone':input.key===responderKey?'responder':null;if(!role)fail('Invalid device link',403);if(input.consent!==true)fail('Device consent is required');if(role==='phone'&&!Object.values(scenarios).some(s=>s.people.some(p=>p.id===input.personId)))fail('Unknown demo person');const residentSlot=role==='phone'?Object.values(scenarios).find(sc=>sc.people.some(p=>p.id===input.personId)).people.findIndex(p=>p.id===input.personId):0,followScenario=role==='phone'&&input.followScenario===true;const bearer=token(),x={id:randomUUID(),role,residentSlot,followScenario,personId:role==='phone'?(followScenario?s().people[Math.min(residentSlot,s().people.length-1)].id:input.personId):null,sharing:true,voiceMode:input.voiceMode==='conversation'?'conversation':'warning',voiceStatus:'idle',shareGps:input.shareGps===true,lastSeen:now(),gps:null};if(role==='phone')for(const [key,old] of sessions)if(old.personId===x.personId){for(const c of calls.values())if(c.sessionId===old.id)c.status='cancelled';sessions.delete(key);}sessions.set(bearer,x);event('device',role==='phone'?'Warning phone connected':'Responder device connected',x.personId);return {token:bearer,role,personId:x.personId};}
 function deviceState(bearer,{touch=true}={}){const x=session(bearer);if(touch)x.lastSeen=now();tick();const all=operatorState();if(x.role==='responder')return {...all,tracking:all.people.filter(p=>[...sessions.values()].some(d=>d.personId===p.id&&d.sharing)).map(p=>{const device=[...sessions.values()].find(d=>d.personId===p.id&&d.sharing);return {id:p.id,name:p.name,position:p.position,source:'simulated route position',gps:device.gps,deviceOnline:now()-device.lastSeen<10000,updatedAt:new Date(device.lastSeen).toISOString(),status:p.status,zone:p.zone,guidance:p.guidance};})};const p=Object.values(scenarios).flatMap(s=>s.people).find(p=>p.id===x.personId),active=s().people.some(p=>p.id===x.personId),own=active?all.people.find(p=>p.id===x.personId):{...p,position:p.start,status:'standby',atRisk:false};return {runId,mode,elapsed,modelTime,speed,revision,clockScale:CLOCK_SCALE,active,scenario:all.scenario,person:own,voiceMode:x.voiceMode,voiceStatus:x.voiceStatus,sharing:x.sharing,shareGps:x.shareGps,call:x.sharing?[...calls.values()].filter(c=>c.sessionId===x.id&&c.runId===runId).map(publicCall).at(-1)||null:null,sos:sos.get(x.personId)||null,serverTime:all.serverTime};}
 function deviceAction(bearer,input){const x=session(bearer);if(x.role!=='phone')fail('Phone action required',403);if(input.action==='stop'){x.sharing=false;x.gps=null;for(const c of calls.values())if(c.sessionId===x.id&&!['completed','declined'].includes(c.status))c.status='cancelled';sos.delete(x.personId);event('privacy','Device stopped sharing',x.personId);notify();return {stopped:true};}if(!x.sharing)fail('Sharing has stopped',403);if(input.runId!==runId)fail('Exercise changed',409);if(!s().people.some(p=>p.id===x.personId))fail('This phone is on standby',409);if(input.action==='ack'){const guidance=guidances.get(x.personId);if(!guidance)fail('No current guidance',409);if(input.guidanceRevision!==guidance.revision)fail('Guidance changed. Read the current update before acknowledging.',409);if(!acks.has(x.personId)){acks.set(x.personId,{at:elapsed,revision:guidance.revision});event('moving',guidance.action==='evacuate'?'Resident following the current demo route':'Resident acknowledged the current warning',x.personId);}}else if(input.action==='sos'){if(!sos.has(x.personId)){sos.set(x.personId,{personId:x.personId,at:new Date(now()).toISOString(),acknowledged:false});event('sos','Assistance requested',x.personId);}}else fail('Unknown device action');return deviceState(bearer);}
 function location(bearer,input){const x=session(bearer);if(x.role!=='phone'||!x.sharing||!x.shareGps)fail('Location sharing is not enabled',403);const p=input.coordinates;if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90||!Number.isFinite(input.accuracy)||input.accuracy<0)fail('Invalid location');x.gps={coordinates:p,accuracy:input.accuracy,at:new Date(now()).toISOString(),source:'device GPS'};x.lastSeen=now();return {stored:true};}
 const terminal=c=>['completed','cancelled','declined','missed','failed'].includes(c.status);
 function retry(c,reason){
  if(terminal(c))return;
  c.failureReason=String(reason||'connection_failed').slice(0,120);c.callerId=null;c.callerSeen=0;
  if((c.attempt||0)<3){c.status=c.answeredAt?'reconnecting':'ringing';event('call','Retrying warning call: '+c.failureReason,c.personId);}
  else{c.status='failed';event('call','Warning call failed: '+c.failureReason,c.personId);}
 }
 function claim(input){
  const c=calls.get(input.callId);if(!c||c.runId!==runId||terminal(c))fail('Call expired',410);
  if(typeof input.callerId!=='string'||!/^[-\w]{8,80}$/.test(input.callerId))fail('Valid caller identity required');
  if(c.callerId&&c.callerId!==input.callerId&&now()-c.callerSeen<8000)return {claimed:false};
  if(!c.callerId||c.callerId!==input.callerId){
   if(c.attempt>=3){c.status='failed';c.failureReason='caller_unavailable';return {claimed:false};}
   c.attempt=(c.attempt||0)+1;c.callerId=input.callerId;c.negotiatingAt=new Date(now()).toISOString();
   if(c.answeredAt)c.status='answered';
   event('call','Preparing warning connection · attempt '+c.attempt,c.personId);
  }
  c.callerSeen=now();return {claimed:true,call:publicCall(c)};
 }
 function currentAttempt(c,input,isOperator){
  if(!c.callerId||input.attempt!==c.attempt||isOperator&&input.callerId!==c.callerId)fail('Call connection changed',409);
 }
 function callAction(bearer,input,isOperator){
  const c=calls.get(input.callId);if(!c||c.runId!==runId)fail('Call expired',410);if(!isOperator)owned(bearer,c.id);
  const allowed=isOperator?['offering','connected','completed','failed']:['answered','declined','connected','completed','failed'];
  if(!allowed.includes(input.status))fail('Invalid call status');
  if(terminal(c))return publicCall(c);
  if(isOperator||['connected','failed'].includes(input.status))currentAttempt(c,input,isOperator);
  if(input.status==='failed'){retry(c,input.reason||'connection_failed');return publicCall(c);}
  if(c.status===input.status)return publicCall(c);
  if(input.status==='offering'&&c.status!=='ringing')return publicCall(c);
  const transitions={answered:['ringing','offering','reconnecting'],declined:['ringing','offering','reconnecting'],connected:['answered'],completed:['answered','connected','reconnecting']};
  if(transitions[input.status]&&!transitions[input.status].includes(c.status))fail('Call transition is stale',409);
  c.status=input.status;if(input.status==='answered'){c.answeredAt??=new Date(now()).toISOString();c.negotiatingAt=new Date(now()).toISOString();}
  if(input.status==='connected'){c.connectedAt=new Date(now()).toISOString();c.failureReason=null;}
  event('call',input.status==='completed'?'Warning call ended':'Call '+input.status,c.personId);return publicCall(c);
 }
 function signal(bearer,input,isOperator){
  const c=calls.get(input.callId);if(!c||c.runId!==runId||terminal(c))fail('Call expired',410);
  if(!isOperator)owned(bearer,c.id);currentAttempt(c,input,isOperator);
  if(!['offer','answer','candidate'].includes(input.type)||isOperator&&input.type==='answer'||!isOperator&&input.type==='offer')fail('Invalid signal');
  if(input.data===undefined||JSON.stringify(input.data).length>18000)fail('Invalid signal data');
  const messageKey=input.messageId?c.id+':'+c.attempt+':'+(isOperator?'host':'phone')+':'+String(input.messageId).slice(0,80):null;
  if(messageKey&&signalIds.has(messageKey))return {sent:true,duplicate:true};
  signals.push({sequence:++sequence,callId:c.id,attempt:c.attempt,sessionId:c.sessionId,callerId:c.callerId,to:isOperator?'phone':'operator',type:input.type,data:input.data});
  if(messageKey)signalIds.set(messageKey,sequence);signals=signals.slice(-512);if(signalIds.size>1024)signalIds.delete(signalIds.keys().next().value);
  return {sent:true};
 }
 function poll(bearer,after,isOperator,callerId){
  const x=isOperator?null:session(bearer);if(x)x.lastSeen=now();
  return {cursor:sequence,signals:signals.filter(e=>{const c=calls.get(e.callId);return e.sequence>after&&c&&!terminal(c)&&c.callerId&&c.attempt===e.attempt&&(isOperator?e.to==='operator'&&(!callerId||e.callerId===callerId):e.to==='phone'&&e.sessionId===x.id);}).map(({sessionId,callerId,...e})=>e)};
 }

 function voiceState(bearer){const x=session(bearer);if(x.role!=='phone'||!x.sharing)fail('Connected phone required',403);const current=deviceState(bearer);if(current.active)return current;const sc=Object.values(scenarios).find(sc=>sc.people.some(p=>p.id===x.personId));const p=sc.people.find(p=>p.id===x.personId);return {...current,mode:'ready',scenario:{...sc,people:undefined,flood:undefined,flow:undefined},person:{...p,position:p.start,status:'standby',guidance:null,zone:zoneAssessment(sc.id,p.start).zone},sos:null};}
 function setVoiceStatus(bearer,input){const x=session(bearer);if(x.role!=='phone'||!x.sharing)fail('Connected phone required',403);if(!['connecting','connected','ended','error'].includes(input.status))fail('Invalid conversation state');const changed=x.voiceStatus!==input.status;x.voiceMode='conversation';x.voiceStatus=input.status;if(changed)event('voice','Two-way conversation '+input.status,x.personId);x.lastSeen=now();for(const c of calls.values())if(c.sessionId===x.id&&!terminal(c)){c.status='cancelled';c.cancelReason='direct_conversation';}notify();return {status:x.voiceStatus};}
 /** What a resident told the SafeWay voice agent (ElevenLabs). Becomes a rescue request the responder must acknowledge. */
 function voiceReport(bearer,input){const x=session(bearer);if(x.role!=='phone')fail('Phone action required',403);if(!x.sharing)fail('Sharing has stopped',403);if(!s().people.some(p=>p.id===x.personId))fail('This phone is on standby',409);
  const r=input?.report||{},text=v=>v==null?null:String(v).replace(/\s+/g,' ').trim().slice(0,200)||null,count=Number.isFinite(+r.people)&&+r.people>0?Math.min(99,Math.round(+r.people)):null;
  const report={trapped:r.trapped===true||r.trapped==='true',floor:text(r.floor),location:text(r.location),people:count,injuries:text(r.injuries),water:text(r.water),canMove:r.canMove==null?null:r.canMove===true||r.canMove==='true',notes:text(r.notes),at:new Date(now()).toISOString()};
  const prev=sos.get(x.personId);sos.set(x.personId,{...prev,personId:x.personId,at:prev?.at||report.at,acknowledged:false,voice:true,trapped:report.trapped||!!prev?.trapped,report,reports:[...(prev?.reports||[]),report].slice(-5)});
  const where=[report.floor&&(/floor|level/i.test(report.floor)?report.floor:'floor '+report.floor),report.location].filter(Boolean).join(', ');
  event('sos',(report.trapped?'TRAPPED (voice)':'Help requested by voice')+(where?' · '+where:'')+(report.people?' · '+report.people+' people':'')+(report.injuries?' · injuries: '+report.injuries:''),x.personId);
  return {recorded:true,trapped:report.trapped,responders:[...sessions.values()].filter(v=>v.role==='responder'&&now()-v.lastSeen<10000).length};}
 function acknowledge(bearer,input,isOperator){if(!isOperator&&session(bearer).role!=='responder')fail('Responder required',403);if(input.runId!==runId)fail('Exercise changed',409);const entry=sos.get(input.personId);if(!entry)fail('No assistance request',404);entry.acknowledged=true;entry.acknowledgedAt=new Date(now()).toISOString();event('response','Responder acknowledged assistance',input.personId);return {acknowledged:true};}
 function audioText(bearer,id,isOperator){const c=calls.get(id);if(!c||c.runId!==runId||c.status==='cancelled')fail('Warning replaced',410);if(!isOperator)owned(bearer,id);return c.instruction;}
 event('ready','Rasuwa ready');return {operatorState,control,audioText,subscribe(callback){listeners.add(callback);return ()=>listeners.delete(callback);},connect,deviceState,deviceAction,voiceState,setVoiceStatus,voiceReport,location,callAction,claim,signal,poll,acknowledge,startTimer(){timer??=setInterval(()=>{tick();notify();},250);timer.unref();},close(){clearInterval(timer);sessions.clear();calls.clear();signals=[];listeners.clear();},keys:{phoneKey,responderKey}};
}
