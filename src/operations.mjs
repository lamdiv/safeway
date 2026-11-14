import {distanceM} from './analysis.mjs';
export const OPS_SCHEMA='headwater.operations.v1';
const STEPS=['reported','triaged','assigned','en_route','on_scene','assistance_completed','closed'];
const clone=x=>structuredClone(x);
const log=(state,type,message,extra={})=>{state.events.unshift({id:`event-${state.version}-${state.events.length}`,time:new Date().toISOString(),type,message,...extra});state.events=state.events.slice(0,120);};
function nodeKey(p){return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;}
export function buildRoadGraph(fc,closures=[]){
 const nodes=new Map(),edges=[];
 for(const f of fc.features){const lines=f.geometry.type==='MultiLineString'?f.geometry.coordinates:f.geometry.type==='LineString'?[f.geometry.coordinates]:[];
  for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],ka=nodeKey(a),kb=nodeKey(b);if(ka===kb)continue;if(!nodes.has(ka))nodes.set(ka,{id:ka,p:a,neighbors:[]});if(!nodes.has(kb))nodes.set(kb,{id:kb,p:b,neighbors:[]});const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];const blocking=closures.find(c=>c.status==='closed'&&Math.min(distanceM(c.coordinates,a),distanceM(c.coordinates,b),distanceM(c.coordinates,mid))<c.radiusM);const edge={id:`${String(f.id)}:${i}:${ka}`,a:ka,b:kb,distanceM:distanceM(a,b),coordinates:[a,b],status:blocking?'closed':'unknown',closureId:blocking?.id??null};edges.push(edge);nodes.get(ka).neighbors.push({to:kb,edge});nodes.get(kb).neighbors.push({to:ka,edge});}
 }
 return {nodes,edges};
}
export function nearestNode(graph,p){let found=null,d=Infinity;for(const n of graph.nodes.values()){const dd=distanceM(p,n.p);if(dd<d){d=dd;found=n;}}return found?{node:found,distanceM:d}:null;}
export function candidateRoute(graph,from,to,{maxSnapM=200}={}){
 const start=nearestNode(graph,from),end=nearestNode(graph,to);
 const base={safetyVerified:false,etaMinutes:null,accessStatus:'requires verification',method:'Shortest mapped path excluding reported closures; not a safe-route certification.'};
 if(!start||!end||start.distanceM>maxSnapM||end.distanceM>maxSnapM)return {...base,status:'no_mapped_connection',coordinates:[],edgeIds:[],distanceM:null,reason:'A mapped road connection within 200 m of an endpoint is unavailable.'};
 const dist=new Map([[start.node.id,0]]),prev=new Map(),pending=new Set([start.node.id]),visited=new Set();
 while(pending.size){let u=null,best=Infinity;for(const id of pending){const d=dist.get(id);if(d<best){u=id;best=d;}}pending.delete(u);if(u===end.node.id)break;if(visited.has(u))continue;visited.add(u);
  for(const {to:v,edge} of graph.nodes.get(u).neighbors){if(edge.status==='closed')continue;const d=best+edge.distanceM;if(d<(dist.get(v)??Infinity)){dist.set(v,d);prev.set(v,{id:u,edge});pending.add(v);}}
 }
 if(!dist.has(end.node.id))return {...base,status:'blocked_or_disconnected',coordinates:[],edgeIds:[],distanceM:null,reason:'No connected path remains in this mapped network. Aerial assessment or field verification is required; no fallback path is invented.'};
 let p=end.node.id;const coords=[graph.nodes.get(p).p],edgeIds=[];while(p!==start.node.id){const step=prev.get(p);if(!step)return {...base,status:'blocked_or_disconnected',coordinates:[],edgeIds:[],distanceM:null,reason:'Incomplete mapped route.'};edgeIds.unshift(step.edge.id);p=step.id;coords.unshift(graph.nodes.get(p).p);}
 return {...base,status:'candidate',coordinates:coords,edgeIds,distanceM:Math.round(dist.get(end.node.id)),endpointGapM:Math.round(start.distanceM+end.distanceM),reason:'Mapped connection found. Current road condition and endpoint access have not been verified.'};
}
export function priorityFor(r){return (r.urgency==='urgent'?60:r.urgency==='elevated'?35:10)+(r.needs.includes('medical')?15:0)+(r.needs.includes('transport')?10:0)+Math.min(r.people,10);}
export function createExercise(assets,roads){
 const graph=buildRoadGraph(roads),pick=assets.filter(a=>a.kind==='building').filter(a=>nearestNode(graph,a.coordinates)?.distanceM<100);
 const chosen=[pick[15]||assets[0],pick[55]||assets[1],pick[95]||assets[2]];
 const base=nearestNode(graph,(pick[35]||assets[4]).coordinates)?.node.p||(pick[35]||assets[4]).coordinates;
 const requests=chosen.map((a,i)=>({id:`REQ-${String(i+1).padStart(3,'0')}`,assetId:a.id,locationLabel:`Exercise household ${String.fromCharCode(65+i)}`,coordinates:a.coordinates,people:[3,2,4][i],needs:[['transport','medical'],['transport'],['search']][i],urgency:['urgent','elevated','elevated'][i],reportedBy:'Drill participant',sourceType:'exercise',reportedAt:new Date().toISOString(),status:i===0?'triaged':'reported',teamId:null,route:null,accessVerified:false,contactStatus:'not_contacted',note:['Caller reports one person needs mobility assistance. Location requires operator confirmation.','Caller requests transport for two people.','Welfare check requested; no direct acknowledgement yet.'][i]}));
 const teams=[{id:'TEAM-01',name:'Ground response Alpha',mode:'ground',capabilities:['transport','search','medical'],capacity:4,coordinates:base,status:'available',sourceType:'exercise'},{id:'TEAM-02',name:'Ground response Bravo',mode:'ground',capabilities:['transport','search'],capacity:6,coordinates:graph.nodes.values().next().value?.p||base,status:'available',sourceType:'exercise'},{id:'TEAM-03',name:'Medical support Charlie',mode:'ground',capabilities:['medical','search'],capacity:2,coordinates:base,status:'available',sourceType:'exercise'}];
 return {schema:OPS_SCHEMA,version:0,exercise:true,createdAt:new Date().toISOString(),requests,teams,closures:[],calls:[],events:[{id:'seed',time:new Date().toISOString(),type:'exercise_started',message:'Synthetic requests and response teams loaded on real geospatial data. No real rescue deployment or call has occurred.'}]};
}
export function proposeAssignments(state,roads){const graph=buildRoadGraph(roads,state.closures);return state.requests.filter(r=>['reported','triaged'].includes(r.status)).sort((a,b)=>priorityFor(b)-priorityFor(a)).map(r=>({requestId:r.id,priority:priorityFor(r),candidates:state.teams.filter(t=>t.status==='available').map(t=>({teamId:t.id,eligible:r.needs.every(n=>t.capabilities.includes(n))&&t.capacity>=r.people,capacity:t.capacity,route:candidateRoute(graph,t.coordinates,r.coordinates)})).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(a.route.distanceM??Infinity)-(b.route.distanceM??Infinity))}));}
export function applyOperation(input,action,roads){
 if(!action||typeof action.type!=='string')throw new Error('A valid operation is required.');
 const state=clone(input);if(action.expectedVersion!==undefined&&action.expectedVersion!==state.version)throw new Error('VERSION_CONFLICT');
 const r=state.requests.find(r=>r.id===action.requestId);
 if(action.type==='triage'){if(!r||r.status!=='reported')throw new Error('Only a reported request can be triaged.');r.status='triaged';log(state,'request_triaged',`${r.id} reviewed by the exercise operator.`);}
 else if(action.type==='assign'){
  if(!r||!['reported','triaged'].includes(r.status))throw new Error('Request is not awaiting assignment.');const t=state.teams.find(t=>t.id===action.teamId);if(!t||t.status!=='available')throw new Error('Team is not available.');if(!r.needs.every(n=>t.capabilities.includes(n))||t.capacity<r.people)throw new Error('Team does not satisfy the requested capabilities or capacity.');
  const route=candidateRoute(buildRoadGraph(roads,state.closures),t.coordinates,r.coordinates);if(route.status!=='candidate')throw new Error('No mapped route is available. Verify access or request a different response resource.');
  r.teamId=t.id;r.route=route;r.status='assigned';r.accessVerified=false;t.status='assigned';log(state,'team_assigned',`${t.name} assigned to ${r.id}. Candidate access awaits verification.`,{requestId:r.id,teamId:t.id});
 }
 else if(action.type==='verify_access'){if(!r||r.status!=='assigned'||!r.route||r.route.status!=='candidate')throw new Error('An assigned request and valid candidate route are required.');if(action.confirmed!==true)throw new Error('Explicit operator confirmation is required.');r.accessVerified=true;log(state,'access_reviewed',`Exercise operator confirmed access for ${r.id}; not a real-world safety certification.`);}
 else if(action.type==='advance'){
  if(!r)throw new Error('Unknown request.');const index=STEPS.indexOf(r.status);if(index<2||index>=STEPS.length-1)throw new Error('Request cannot advance from this state.');
  if(r.status==='assigned'&&(!r.accessVerified||r.route?.status!=='candidate'))throw new Error('Access must be reviewed before marking a team en route.');if(r.needsReview)throw new Error('A changed access condition requires review and replanning.');
  r.status=STEPS[index+1];if(r.status==='closed'){const t=state.teams.find(t=>t.id===r.teamId);if(t){t.status='available';t.coordinates=r.coordinates;}}
  log(state,'progress_updated',`${r.id}: ${r.status.replaceAll('_',' ')} (exercise operator update).`,{requestId:r.id});
 }
 else if(action.type==='closure'){
  if(!Array.isArray(action.coordinates)||action.coordinates.length!==2||!action.coordinates.every(Number.isFinite)||Math.abs(action.coordinates[0])>180||Math.abs(action.coordinates[1])>90)throw new Error('Closure needs valid WGS84 coordinates.');
  const c={id:action.id||`CLOSURE-${state.closures.length+1}`,coordinates:action.coordinates,label:String(action.label||'Reported crossing closure').slice(0,150),status:'closed',radiusM:Math.min(150,Math.max(15,Number(action.radiusM)||45)),sourceType:'exercise',reportedAt:new Date().toISOString()};state.closures.push(c);
  for(const item of state.requests.filter(x=>x.teamId&&!['closed','assistance_completed'].includes(x.status))){const t=state.teams.find(t=>t.id===item.teamId);const route=candidateRoute(buildRoadGraph(roads,state.closures),t.coordinates,item.coordinates);if(item.route?.edgeIds.some(id=>!route.edgeIds.includes(id))||route.status!=='candidate'){item.needsReview=true;item.accessVerified=false;}}
  log(state,'access_changed',`${c.label}; active assignments affected by changed access require review.`);
 }
 else if(action.type==='replan'){if(!r||!r.teamId)throw new Error('Assigned request required.');const t=state.teams.find(t=>t.id===r.teamId);const route=candidateRoute(buildRoadGraph(roads,state.closures),t.coordinates,r.coordinates);r.route=route;r.accessVerified=false;r.needsReview=false;r.status='assigned';log(state,'route_replanned',`${r.id}: ${route.status}. Access confirmation is required again.`);}
 else if(action.type==='record_call'){
  if(!r)throw new Error('Select a request.');if(!['acknowledged','needs_assistance','no_answer'].includes(action.outcome))throw new Error('Select a valid contact outcome.');
  const call={id:`CALL-${state.calls.length+1}`,requestId:r.id,time:new Date().toISOString(),mode:'exercise',outcome:action.outcome,note:String(action.note||'').slice(0,1000)};state.calls.unshift(call);r.contactStatus=action.outcome;log(state,'contact_recorded',`${r.id}: exercise contact outcome ${action.outcome.replaceAll('_',' ')}. This is not a verified rescue outcome.`);
 }
 else if(action.type==='create_request'){
  if(typeof action.locationLabel!=='string'||!action.locationLabel.trim()||!Array.isArray(action.coordinates)||action.coordinates.length!==2||!action.coordinates.every(Number.isFinite)||Math.abs(action.coordinates[0])>180||Math.abs(action.coordinates[1])>90)throw new Error('A location label and valid coordinates are required.');
  const people=Number(action.people);if(!Number.isInteger(people)||people<1||people>100)throw new Error('People count must be 1–100.');
  const needs=Array.isArray(action.needs)?action.needs.filter(n=>['transport','medical','search'].includes(n)):[];if(!needs.length)throw new Error('Select an assistance need.');
  const id=`REQ-${String(state.requests.length+1).padStart(3,'0')}`;state.requests.push({id,assetId:action.assetId||null,locationLabel:action.locationLabel.slice(0,120),coordinates:action.coordinates,people,needs,urgency:['urgent','elevated','routine'].includes(action.urgency)?action.urgency:'elevated',reportedBy:'Exercise operator',sourceType:'exercise',reportedAt:new Date().toISOString(),status:'reported',teamId:null,route:null,accessVerified:false,contactStatus:'not_contacted',note:String(action.note||'').slice(0,1000)});log(state,'request_created',`${id}: new exercise assistance request awaits review.`);
 }
 else throw new Error('Unsupported operation.');
 state.version++;return state;
}
export function operationsSummary(state){return {open:state.requests.filter(r=>r.status!=='closed').length,peopleRequested:state.requests.filter(r=>r.status!=='closed').reduce((n,r)=>n+r.people,0),availableTeams:state.teams.filter(t=>t.status==='available').length,reviewNeeded:state.requests.filter(r=>r.needsReview||(r.status==='assigned'&&!r.accessVerified)).length,completed:state.requests.filter(r=>r.status==='closed').length,closures:state.closures.length,contacted:state.requests.filter(r=>['acknowledged','needs_assistance'].includes(r.contactStatus)).length};}
