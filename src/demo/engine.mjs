import {randomBytes,randomUUID} from 'node:crypto';import {scenarios,hazardAt,warningAt,riskAt,interpolateRoute} from './scenarios.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});},token=()=>randomBytes(24).toString('base64url');
export function createResponseDemo({phoneKey=token(),responderKey=token(),now=Date.now}={}){
 let runId=randomUUID(),scenarioId='rasuwa',mode='ready',elapsed=0,lastTick=now(),sessions=new Map(),calls=new Map(),events=[],signals=[],sequence=0,acks=new Map(),sos=new Map(),history=[],timer;const signalIds=new Map();
 const s=()=>scenarios[scenarioId],event=(kind,message,personId=null)=>{events.unshift({id:randomUUID(),kind,message,personId,at:new Date(now()).toISOString()});events=events.slice(0,60);};
 const session=bearer=>{const x=sessions.get(bearer);if(!x)fail('Connect this device again',401);return x;};
 const owned=(bearer,id)=>{const x=session(bearer),c=calls.get(id);if(!c||c.runId!==runId)fail('Call no longer active',410);if(x.role!=='phone'||c.sessionId!==x.id)fail('Not your call',403);return {x,c};};
 function position(p){const a=acks.get(p.id);return a?interpolateRoute(p.route,(elapsed-a.at)/32):p.start;}
 function person(p){const a=acks.get(p.id),devices=[...sessions.values()].filter(x=>x.personId===p.id&&x.sharing),call=[...calls.values()].find(c=>c.personId===p.id&&c.runId===runId),atRisk=mode!=='ready'&&riskAt(scenarioId,elapsed,position(p)),arrived=Boolean(a&&elapsed-a.at>=32);return {...p,position:position(p),atRisk,arrived,deviceConnected:devices.some(x=>now()-x.lastSeen<10000),call:call?publicCall(call):null,status:sos.has(p.id)?'needs_help':arrived?'arrived':a?'evacuating':call?.status==='connected'?'in_call':call&&['ringing','offering','answered','reconnecting'].includes(call.status)?'calling':atRisk?'at_risk':'monitoring',acknowledged:!!a};}
 function publicCall(c){const {sessionId,callerId,callerSeen,...rest}=c;return rest;}
 function tick(){const current=now();if(mode==='running'){elapsed=Math.min(s().duration,elapsed+Math.min(5,(current-lastTick)/1000));if(elapsed>=s().duration)mode='complete';}lastTick=current;
  if(mode==='running')for(const p of s().people){if(!riskAt(scenarioId,elapsed,p.start)||acks.has(p.id))continue;for(const x of sessions.values()){if(x.role!=='phone'||x.personId!==p.id||!x.sharing||current-x.lastSeen>10000)continue;if([...calls.values()].some(c=>c.runId===runId&&c.sessionId===x.id))continue;const c={id:randomUUID(),runId,personId:p.id,sessionId:x.id,status:'ringing',createdAt:new Date(current).toISOString(),deadline:new Date(current+180000).toISOString(),attempt:0,audio:p.audio,instruction:scenarioId==='houston'&&p.id==='houston-c'?'Fire is approaching. Go to North Assembly Point within three minutes.':s().instruction,destination:p.destination};calls.set(c.id,c);event('call','Automatic warning call → '+p.name,p.id);}}
  for(const c of calls.values()){if(c.status==='answered'&&current-Date.parse(c.negotiatingAt||c.answeredAt)>30000)retry(c,'negotiation_timeout');else if(c.status==='connected'&&current-Date.parse(c.connectedAt)>90000)retry(c,'media_timeout');}
  for(const c of calls.values())if(['ringing','offering'].includes(c.status)&&current-Date.parse(c.createdAt)>60000){c.status='missed';event('missed','Warning call was not answered',c.personId);}
 }
 function control(input){if(!['start','pause','reset','scenario'].includes(input.action))fail('Unknown action');tick();if(input.action==='scenario'){if(!scenarios[input.scenario])fail('Unknown scenario');scenarioId=input.scenario;reset();}else if(input.action==='reset')reset();else if(input.action==='start'){if(mode==='complete')reset();mode='running';lastTick=now();event('start',s().hazard+' simulation started');}else{mode='paused';event('pause','Simulation paused');}return operatorState();}
 function reset(){for(const c of calls.values())c.status='cancelled';history.push({runId,endedAt:new Date(now()).toISOString()});runId=randomUUID();elapsed=0;mode='ready';acks.clear();sos.clear();signals=[];signalIds.clear();calls.clear();events=[];lastTick=now();event('reset',s().title+' ready');}
 function operatorState(){tick();return {runId,mode,elapsed,scenario:{...s(),flow:undefined,people:undefined},people:s().people.map(person),hazard:hazardAt(scenarioId,elapsed),warning:mode==='ready'?{type:'FeatureCollection',features:[]}:warningAt(scenarioId,elapsed),calls:[...calls.values()].map(publicCall),events,responders:[...sessions.values()].filter(x=>x.role==='responder'&&now()-x.lastSeen<10000).length,sos:[...sos.values()],serverTime:new Date(now()).toISOString(),simulation:true};}
 function connect(input){const role=input.key===phoneKey?'phone':input.key===responderKey?'responder':null;if(!role)fail('Invalid device link',403);if(input.consent!==true)fail('Device consent is required');if(role==='phone'&&!Object.values(scenarios).some(s=>s.people.some(p=>p.id===input.personId)))fail('Unknown demo person');const bearer=token(),x={id:randomUUID(),role,personId:role==='phone'?input.personId:null,sharing:true,shareGps:input.shareGps===true,lastSeen:now(),gps:null};if(role==='phone')for(const [key,old] of sessions)if(old.personId===x.personId){for(const c of calls.values())if(c.sessionId===old.id)c.status='cancelled';sessions.delete(key);}sessions.set(bearer,x);event('device',role==='phone'?'Warning phone connected':'Responder device connected',x.personId);return {token:bearer,role,personId:x.personId};}
 function deviceState(bearer){const x=session(bearer);x.lastSeen=now();tick();const all=operatorState();if(x.role==='responder')return {...all,tracking:all.people.filter(p=>[...sessions.values()].some(d=>d.personId===p.id&&d.sharing)).map(p=>{const device=[...sessions.values()].find(d=>d.personId===p.id&&d.sharing);return {id:p.id,name:p.name,position:p.position,source:'simulated route position',gps:device.gps,deviceOnline:now()-device.lastSeen<10000,updatedAt:new Date(device.lastSeen).toISOString(),status:p.status};})};const p=Object.values(scenarios).flatMap(s=>s.people).find(p=>p.id===x.personId),active=s().people.some(p=>p.id===x.personId),own=active?all.people.find(p=>p.id===x.personId):{...p,position:p.start,status:'standby',atRisk:false};return {runId,mode,elapsed,active,scenario:all.scenario,person:own,sharing:x.sharing,shareGps:x.shareGps,call:x.sharing?[...calls.values()].filter(c=>c.sessionId===x.id&&c.runId===runId).map(publicCall).at(-1)||null:null,sos:sos.get(x.personId)||null,serverTime:all.serverTime};}
 function deviceAction(bearer,input){const x=session(bearer);if(x.role!=='phone')fail('Phone action required',403);if(input.action==='stop'){x.sharing=false;x.gps=null;for(const c of calls.values())if(c.sessionId===x.id&&!['completed','declined'].includes(c.status))c.status='cancelled';sos.delete(x.personId);event('privacy','Device stopped sharing',x.personId);return {stopped:true};}if(!x.sharing)fail('Sharing has stopped',403);if(input.runId!==runId)fail('Exercise changed',409);if(!s().people.some(p=>p.id===x.personId))fail('This phone is on standby',409);if(input.action==='ack'){if(![...calls.values()].some(c=>c.sessionId===x.id&&['connected','completed'].includes(c.status)))fail('Answer the warning call first',409);if(!acks.has(x.personId)){acks.set(x.personId,{at:elapsed});event('moving','Resident following the demo route',x.personId);}}else if(input.action==='sos'){if(!sos.has(x.personId)){sos.set(x.personId,{personId:x.personId,at:new Date(now()).toISOString(),acknowledged:false});event('sos','Assistance requested',x.personId);}}else fail('Unknown device action');return deviceState(bearer);}
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

 function acknowledge(bearer,input,isOperator){if(!isOperator&&session(bearer).role!=='responder')fail('Responder required',403);if(input.runId!==runId)fail('Exercise changed',409);const entry=sos.get(input.personId);if(!entry)fail('No assistance request',404);entry.acknowledged=true;entry.acknowledgedAt=new Date(now()).toISOString();event('response','Responder acknowledged assistance',input.personId);return {acknowledged:true};}
 event('ready','Rasuwa ready');return {operatorState,control,connect,deviceState,deviceAction,location,callAction,claim,signal,poll,acknowledge,startTimer(){timer??=setInterval(tick,250);timer.unref();},close(){clearInterval(timer);sessions.clear();calls.clear();signals=[];},keys:{phoneKey,responderKey}};
}
