/** Deterministic exercise playback on real terrain/roads. Time is authored, not a forecast. */
import {buildDrainage,screenAssets,gridIndex,cellCoordinate,distanceM} from './analysis.mjs';
import {buildRoadGraph,candidateRoute,nearestNode} from './operations.mjs';
export const SCENARIO_DURATION=180;
export const ASSEMBLY={id:'ASSEMBLY-A',name:'Assembly Point A',coordinates:[85.3342437,28.1623846],basis:'Authored exercise assembly location on mapped road geometry; not an approved real shelter.'};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function positionAlong(coordinates,fraction){
 if(!coordinates?.length)return null;if(coordinates.length===1)return [...coordinates[0]];
 const lengths=coordinates.slice(1).map((p,i)=>distanceM(coordinates[i],p)),total=lengths.reduce((a,b)=>a+b,0);let remaining=clamp(fraction)*total;
 for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const t=lengths[i]?clamp(remaining/lengths[i]):0;return coordinates[i].map((v,j)=>v+(coordinates[i+1][j]-v)*t);}remaining-=lengths[i];}return [...coordinates.at(-1)];
}
export function createIncidentPlan(data,{stage=20,closures=[],incidentId='RASUWA-EXERCISE',origin=null}={}){
 if(!Number.isFinite(stage)||stage<1||stage>60)throw new Error('Assumed stage must be 1–60 m.');
 if(typeof incidentId!=='string'||!incidentId.length||incidentId.length>100)throw new Error('Invalid incident ID.');
 const {grid,assets,roads}=data;const drainage=buildDrainage(grid),screen=screenAssets(assets,drainage,{stage,spread:.25}),baseGraph=buildRoadGraph(roads),graph=buildRoadGraph(roads,closures);
 if(origin&&(!Array.isArray(origin)||origin.length!==2||origin.some(v=>!Number.isFinite(v))||gridIndex(grid,origin)<0))throw new Error('Flood report location must be inside this case terrain window.');
 const candidates=screen.filter(a=>a.kind==='building'&&a.band==='higher'&&nearestNode(baseGraph,a.coordinates)?.distanceM<=90).map(a=>({asset:a,route:candidateRoute(baseGraph,a.coordinates,ASSEMBLY.coordinates)})).filter(a=>a.route.status==='candidate'&&a.route.distanceM>100&&a.route.distanceM<2600).sort((a,b)=>b.asset.coordinates[1]-a.asset.coordinates[1]);
 if(candidates.length<3)throw new Error('Insufficient connected assessed points for this exercise stage.');
 const chosen=[.2,.5,.8].map(p=>candidates[Math.floor((candidates.length-1)*p)]);
 const people=chosen.map(({asset,route:baseline},i)=>{
  const route=candidateRoute(graph,asset.coordinates,ASSEMBLY.coordinates);
  return {id:`HH-0${i+1}`,name:`Household ${String.fromCharCode(65+i)}`,assetId:asset.id,coordinates:asset.coordinates,people:[3,2,4][i],needs:i===0?'Mobility assistance':i===2?'Welfare check':'Transport',band:asset.band,route,baselineRoute:baseline,destination:ASSEMBLY,sourceType:'exercise',routeReview:'operator_review_required'};
 });
 const teams=[{id:'UNIT-01',name:'Rescue Alpha',coordinates:[85.32980677,28.15456439],color:'#7befbd'},{id:'UNIT-02',name:'Rescue Bravo',coordinates:ASSEMBLY.coordinates,color:'#7befbd'}].map((t,i)=>({...t,route:candidateRoute(graph,t.coordinates,people[i].coordinates),sourceType:'exercise'}));
 const crossings=assets.filter(a=>a.kind==='crossing');
 const tasks=crossings.map((a,i)=>({id:`ACCESS-0${i+1}`,name:`Crossing ${i+1} access check`,coordinates:a.coordinates,assetId:a.id,kind:'reconnaissance',status:'requested',reason:'Possible access loss in the exercise corridor. Destruction and passability are unverified.',sourceType:'exercise'}));
 return {schema:'headwater.incident.v1',id:incidentId,exercise:true,stage,origin:origin||[85.343,28.188],duration:SCENARIO_DURATION,people,teams,tasks,closures,assembly:ASSEMBLY,summary:{households:people.length,people:people.reduce((n,p)=>n+p.people,0),higher:screen.filter(a=>a.band==='higher').length,screened:screen.length,blocked:people.filter(p=>p.route.status!=='candidate').length},basis:{movement:'Authored exercise sequence, not reconstructed actual movements or predicted arrival times.',flood:'Terrain-stage sensitivity revealed along a north-to-south scenario front; no hydrodynamic solver.',destination:ASSEMBLY.basis},_drainage:drainage};
}
export function publicPlan(plan){const {_drainage,...rest}=plan;return rest;}
export function floodGeometry(plan,grid,progress){
 progress=clamp(progress);if(!progress)return {type:'FeatureCollection',features:[]};
 const hand=plan._drainage?.hand||buildDrainage(grid).hand,[w,s,e,n]=grid.bbox;const front=n-(n-s)*progress,features=[];
 for(let y=0;y<grid.height;y++){
  const north=n-y/grid.height*(n-s),south=n-(y+1)/grid.height*(n-s);if(north<front)continue;
  let start=-1;
  for(let x=0;x<=grid.width;x++){
   const h=hand[y*grid.width+x],wet=x<grid.width&&Number.isFinite(h)&&h<=plan.stage;
   if(wet&&start<0)start=x;
   if(!wet&&start>=0){const west=w+start/grid.width*(e-w),east=w+x/grid.width*(e-w);features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[west,Math.max(south,front)],[east,Math.max(south,front)],[east,north],[west,north],[west,Math.max(south,front)]]]},properties:{exercise:true}});start=-1;}
  }
 }
 return {type:'FeatureCollection',features};
}
export function scenarioFrame(plan,time,{alertsApproved=false,acknowledged=[],helpRequested=[],closure=false,haltAt=0}={}){
 if(!Number.isFinite(time))throw new Error('A finite scenario time is required.');time=clamp(time,0,plan.duration);
 const movement=alertsApproved?clamp(((closure?haltAt:time)-30)/100):0;
 return {time,progress:time/plan.duration,phase:time<12?'monitoring':!alertsApproved?'review_alerts':time<65?'evacuating':'response',
  people:plan.people.map((p,i)=>{const blocked=p.route.status!=='candidate'||closure;const needsHelp=helpRequested.includes(p.id);const f=p.route.status!=='candidate'||needsHelp?0:clamp((movement-i*.05));return {...p,position:f>0?positionAlong(p.route.coordinates,f):p.coordinates,fraction:f,status:blocked?'route_review':needsHelp?'needs_help':f>=1?'arrived_exercise':acknowledged.includes(p.id)?'acknowledged':alertsApproved?'alert_simulated':'awaiting_alert'};}),
  teams:plan.teams.map((t,i)=>({...t,position:(closure?haltAt:time)>50&&alertsApproved&&t.route.status==='candidate'?positionAlong(t.route.coordinates,clamp(((closure?haltAt:time)-50-i*10)/95)):t.coordinates})),
  tasks:time>=12?plan.tasks:[],arrivalTimesPredicted:false};
}
export function evacuationMessage(person,{publicBaseUrl=''}={}){
 const prefix='HEADWATER DRILL — this is a test. ';
 if(person.route.status!=='candidate')return prefix+`${person.name}: mapped access is unavailable. No movement instruction is issued. Contact the exercise coordinator for assistance.`;
 const [lon,lat]=person.destination.coordinates,entry=person.route.coordinates[0];
 const url=publicBaseUrl?` Route: ${publicBaseUrl.replace(/\/$/,'')}/route.html?person=${encodeURIComponent(person.id)}`:'';
 return prefix+`${person.name}: go to ${person.destination.name} (${lat.toFixed(5)} N, ${lon.toFixed(5)} E). Join the reviewed mapped road at ${entry[1].toFixed(5)} N, ${entry[0].toFixed(5)} E; follow the highlighted ${Math.round(person.route.distanceM)} m route. The ${person.route.endpointGapM} m endpoint connection needs operator review. Reply 1 to acknowledge or 2 for help.${url}`;
}
