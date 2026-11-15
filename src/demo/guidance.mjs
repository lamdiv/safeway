/** Exercise policy. Arrival times derive from authored progression, never a calibrated forecast. */
import {scenarios,zoneOf,contains,hazardAt,interpolateRoute} from './scenarios.mjs';
import {depthAt} from './raster-flood.mjs';
import {distanceM} from '../analysis.mjs';
export const CLOCK_SCALE=6;
const arrivals=new Map();
export function arrivalTime(id,point){
 const key=id+':'+point.map(v=>v.toFixed(6)).join(',');if(arrivals.has(key))return arrivals.get(key);
 const s=scenarios[id];let result=null;
 if(s.raster){const depth=depthAt(s.flood,point),thresholds=s.raster.thresholdsFt,{start,step}=s.raster.timeline;
  if(depth!==null){if(depth>=thresholds[0])result=start;else for(let i=0;i<thresholds.length-1;i++){if(depth>=thresholds[i+1]){result=start+(i+(thresholds[i]-depth)/(thresholds[i]-thresholds[i+1]||1))*step;break;}}}
 }else if(contains(point,hazardAt(id,120))){let lo=0,hi=120;for(let i=0;i<15;i++){const mid=(lo+hi)/2;if(contains(point,hazardAt(id,mid)))hi=mid;else lo=mid;}result=hi;}
 if(arrivals.size>6000)arrivals.delete(arrivals.keys().next().value);arrivals.set(key,result);return result;
}
export function zoneAssessment(id,point,modelTime=0,speed=1){
 const impact=zoneOf(id,point),arrival=arrivalTime(id,point),remaining=arrival===null?null:Math.max(0,(arrival-modelTime)/speed);
 const zone=impact==='outside'?'green':impact==='high'||remaining!==null&&remaining<=18?'red':'yellow';
 return {zone,impact,arrivalModelTime:arrival,arrivalInDemoSeconds:remaining,etaSeconds:remaining===null?null:Math.round(remaining*CLOCK_SCALE),basis:'Authored flood progression · six scenario seconds per playback second',forecast:false};
}
export function routeAssessment(id,p,position,modelTime,speed){
 // Three playback seconds to clear the building are an exercise assumption, not a measured egress time.
 const departure=arrivalTime(id,position);
 if(departure!==null&&departure<=modelTime+speed*3)return {safe:false,reason:'The flood reaches the departure point before the assumed egress window.'};
 let nearest=0,best=Infinity;for(let i=0;i<p.route.length;i++){const d=distanceM(position,p.route[i]);if(d<best){best=d;nearest=i;}}const path=[position,...p.route.slice(nearest+1)];if(path.length<2)return {safe:true,reason:'At the end of the demo route.'};
 for(let i=1;i<=20;i++){const ratio=i/20,point=interpolateRoute(path,ratio),arrival=arrivalTime(id,point);
  if(arrival!==null&&arrival<=modelTime+speed*(3+12*ratio))return {safe:false,reason:'The modeled flood reaches a segment before the demo resident clears it.'};}
 return {safe:true,reason:'Route clears the modeled water within the authored travel window.'};
}
function etaText(seconds){if(seconds===null)return 'No inundation is modeled at your exact position.';if(seconds<=0)return 'The simulated flood has reached your location.';if(seconds<60)return `Estimated flood arrival is ${Math.max(1,Math.round(seconds))} scenario seconds.`;const rounded=Math.round(seconds/15)*15,minutes=Math.floor(rounded/60),rest=rounded%60;return `Estimated flood arrival is ${minutes} minute${minutes===1?'':'s'}${rest>=15?' and '+rest+' seconds':''} in the scenario.`;}
/** Princeton drill (unchanged design): everyone is told to leave at Start with the scripted call; the zone comes
 *  from the depth at their position and does not escalate, so each person gets one call unless the speed changes. */
function drillGuidance(id,p,position,modelTime,speed){
 const risk=zoneAssessment(id,position,modelTime,speed),zone=risk.impact==='high'?'red':risk.impact==='outside'?'green':'yellow';
 return {...risk,zone,action:'evacuate',title:'Flood drill · leave now',instruction:p.instruction,message:p.instruction,route:p.route,destination:p.destination,refuge:null,routeWithdrawn:false,routeReason:'Scripted drill route to the high-ground assembly point.',rescueRequired:false,speed};
}
export function assessGuidance(id,p,{position=p.start,modelTime=0,speed=1,withdrawn=false}={}){
 if(scenarios[id]?.callOnStart)return drillGuidance(id,p,position,modelTime,speed);
 const risk=zoneAssessment(id,position,modelTime,speed),route=risk.zone==='green'?{safe:false,reason:'No evacuation route is issued for the green monitoring group.'}:routeAssessment(id,p,position,modelTime,speed);
 const refuge=p.refuge?.definedForDemo&&p.refuge.approvedForDemo&&p.refuge.floorAboveGroundM>p.refuge.maxModeledDepthM+1&&distanceM(position,p.refuge.coordinates)<=60?p.refuge:null;
 const routeWithdrawn=withdrawn||!route.safe&&risk.zone!=='green';
 const action=routeWithdrawn?(refuge?'shelter':'await_rescue'):risk.zone==='green'?'monitor':'evacuate';
 const title=action==='shelter'?'Previous route withdrawn · use your refuge':action==='await_rescue'?'Route withdrawn · rescue requested':action==='monitor'?'Green zone · monitoring update':risk.zone==='red'?'Red zone · leave now':'Yellow zone · leave early';
 const instruction=action==='shelter'?`The previous evacuation route is withdrawn. Remain in ${refuge.name}, the defined upper-floor refuge in this drill. Do not use the old route. Rescue has been requested.`:action==='await_rescue'?'The previous evacuation route is withdrawn. No viable refuge has been confirmed at your current position. Rescue has been requested; await updated responder guidance.':action==='monitor'?'No inundation is modeled at your position in this scenario. Remain alert and avoid entering the flood area. We will update you if conditions change.':`Follow the marked demo route to ${p.destination.name}. ${risk.zone==='red'?'Leave now.':'Leave early before access deteriorates.'}`;
 const message=`This is a SafeWay drill. ${risk.zone} zone. ${etaText(risk.etaSeconds)} ${speed>1?'The flood progression has accelerated. ':''}${instruction}`;
 return {...risk,action,title,instruction,message,route:action==='evacuate'?p.route:[],destination:action==='evacuate'?p.destination:action==='shelter'?refuge:null,refuge,routeWithdrawn,routeReason:route.reason,rescueRequired:routeWithdrawn,speed};
}
