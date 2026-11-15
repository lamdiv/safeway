import {readFileSync} from 'node:fs';
import {houstonScenarios} from './houston.mjs';import {frameAt,floodedNear,zoneAt,thresholdAt} from './raster-flood.mjs';import {prepareFlow,smoothPath} from '../flow-visual.mjs';
import {createIncidentPlan,positionAlong} from '../simulation.mjs';
import {distanceM} from '../analysis.mjs';
const get=name=>JSON.parse(readFileSync(new URL('../../public/data/'+name,import.meta.url)));
const plan=createIncidentPlan({grid:get('terrain.json'),assets:get('assets.json'),roads:get('roads.geojson')});
const flow=prepareFlow(get('connected-flow-profile.json')).coordinates.filter(p=>p[1]<=28.1805&&p[1]>=28.156);
const floodPath=smoothPath(flow.filter((_,i)=>i%5===0),1);
const people=plan.people.map((p,i)=>({id:'rasuwa-'+String.fromCharCode(97+i),name:['Asha Tamang','Pasang Sherpa','Maya Lama'][i],start:p.coordinates,route:[p.coordinates,...p.route.coordinates],destination:{name:'Assembly Point A',coordinates:plan.assembly.coordinates},audio:'/demo/audio/rasuwa.wav'}));
export const scenarios={
 rasuwa:{id:'rasuwa',title:'Rasuwa',country:'Nepal',hazard:'Flood',color:'#55c6f0',center:[85.340,28.171],zoom:14.1,pitch:57,bearing:-18,duration:120,people,flow:floodPath,summary:'Flood front moving downstream through the valley.',useCase:'Test the warning chain for a fast flood front moving down a mountain valley toward homes.',instruction:'Flood water is approaching your area. Go to Assembly Point A within three minutes. Follow the marked route away from the river.'},
 ...houstonScenarios
};
const fc=features=>({type:'FeatureCollection',features});
function offset(p,east,north){return [p[0]+east/(111195*Math.cos(p[1]*Math.PI/180)),p[1]+north/111195];}
function corridor(points,width){if(points.length<2)return fc([]);const left=[],right=[];for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=(b[0]-a[0])*Math.cos(points[i][1]*Math.PI/180),dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;left.push(offset(points[i],-dy/len*width,dx/len*width));right.push(offset(points[i],dy/len*width,-dx/len*width));}const ring=[...left,...right.reverse(),left[0]];return fc([{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{demo:true}}]);}
export function hazardAt(id,time,buffer=0){const s=scenarios[id];if(!s)throw new Error('Unknown scenario');if(s.raster)return rasterState(s,time);if(time<=0)return fc([]);const t=Math.min(1,time/65),front=positionAlong(s.flow,t),total=s.flow.slice(1).reduce((n,p,i)=>n+distanceM(s.flow[i],p),0),target=total*t,points=[s.flow[0]];let travelled=0;for(let i=1;i<s.flow.length;i++){const length=distanceM(s.flow[i-1],s.flow[i]);if(travelled+length>=target){points.push(front);break;}points.push(s.flow[i]);travelled+=length;}if(points.length<2)points.push(front);return corridor(points,28+52*t+buffer);}
export function contains(point,featureCollection){return featureCollection.features.some(f=>{let yes=false;const ring=f.geometry.coordinates[0];for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;});}
export function riskAt(id,time,position){const s=scenarios[id];if(s?.raster)return time>=0&&floodedNear(s.flood,time+s.warn.lead,position,s.warn.radius);return contains(position,warningAt(id,time));}
export function interpolateRoute(route,fraction){return positionAlong(route,Math.max(0,Math.min(1,fraction)));}

export function warningAt(id,time){const w=scenarios[id]?.warn||{lead:25,buffer:180};return time>=0?hazardAt(id,time+w.lead,w.buffer):{type:'FeatureCollection',features:[]};}

// Planning risk zones, drawn from the full simulated extent of each scenario plus fixed distance bands.
// They are exposure bands for this simulation, not probabilities or an official flood-zone map.
export const ZONE_BANDS={high:0,medium:120,low:300};
const zoneCache=new Map();
export function zonesAt(id){if(!scenarios[id])throw new Error('Unknown scenario');if(scenarios[id].raster)return {raster:true};if(!zoneCache.has(id)){const s=scenarios[id],end=s.duration||120;const round=fc=>({...fc,features:fc.features.map(f=>({...f,geometry:{...f.geometry,coordinates:f.geometry.coordinates.map(r=>r.map(([x,y])=>[+x.toFixed(5),+y.toFixed(5)]))}}))});zoneCache.set(id,Object.fromEntries(Object.entries(ZONE_BANDS).map(([k,b])=>[k,round(hazardAt(id,end,b))])));}return zoneCache.get(id);}
export function zoneOf(id,point){if(scenarios[id]?.raster)return zoneAt(scenarios[id].flood,point);const z=zonesAt(id);return ['high','medium','low'].find(k=>contains(point,z[k]))||'outside';}

// What the browser receives. Gridded floods are static images, so state carries only the frame number.
export function clientHazard(id,time){return hazardAt(id,time);}
export function clientWarning(id,time){const s=scenarios[id];if(s.raster)return time>=0?rasterState(s,time+s.warn.lead):{...fc([]),raster:true,frame:-1,thresholdFt:null};return warningAt(id,time);}
function rasterState(s,time){const t=thresholdAt(s.raster.thresholdsFt,time);return {...fc([]),raster:true,frame:frameAt(s.flood,time),thresholdFt:t===Infinity?null:+t.toFixed(3)};}
export function clientZones(id){return zonesAt(id);}

// A green demonstration resident sits outside the modeled reach, rather than relabelling flooded ground green.
for(const scenario of Object.values(scenarios)){
 const green=scenario.people[2];green.start=scenario.id==='rasuwa'?[green.destination.coordinates[0]-.006,green.destination.coordinates[1]+.002]:[...green.destination.coordinates];green.route=[[...green.start],[...green.start]];
 for(const p of scenario.people)p.refuge={id:p.id+'-refuge',name:p.name.split(' ')[0]+'’s upper-floor refuge',coordinates:[...p.start],definedForDemo:true,realWorldVerified:false,approvedForDemo:true,floorAboveGroundM:12,maxModeledDepthM:8};
}
