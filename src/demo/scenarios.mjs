import {readFileSync} from 'node:fs';
import {prepareFlow,smoothPath} from '../flow-visual.mjs';
import {createIncidentPlan,positionAlong} from '../simulation.mjs';
import {distanceM} from '../analysis.mjs';
const get=name=>JSON.parse(readFileSync(new URL('../../public/data/'+name,import.meta.url)));
const plan=createIncidentPlan({grid:get('terrain.json'),assets:get('assets.json'),roads:get('roads.geojson')});
const flow=prepareFlow(get('connected-flow-profile.json')).coordinates.filter(p=>p[1]<=28.1805&&p[1]>=28.156);
const floodPath=smoothPath(flow.filter((_,i)=>i%5===0),1);
const people=plan.people.map((p,i)=>({id:'rasuwa-'+String.fromCharCode(97+i),name:['Asha Tamang','Pasang Sherpa','Maya Lama'][i],start:p.coordinates,route:[p.coordinates,...p.route.coordinates],destination:{name:'Assembly Point A',coordinates:plan.assembly.coordinates},audio:'/demo/audio/rasuwa.wav'}));
export const scenarios={
 rasuwa:{id:'rasuwa',title:'Rasuwa',country:'Nepal',hazard:'Flood',color:'#55c6f0',center:[85.340,28.171],zoom:14.1,pitch:57,bearing:-18,duration:120,people,flow:floodPath,summary:'Flood front moving downstream through the valley.',instruction:'Flood water is approaching your area. Go to Assembly Point A within three minutes. Follow the marked route away from the river.'},
 houston:{id:'houston',title:'Houston',country:'Texas',hazard:'Fire',color:'#ff855c',center:[-95.369,29.762],zoom:15.2,pitch:55,bearing:-22,duration:120,origin:[-95.374,29.765],wind:{bearing:125,label:'Wind SE · 18 km/h · simulated'},people:[
 {id:'houston-a',name:'Jordan Lee',start:[-95.370,29.7628],route:[[-95.370,29.7628],[-95.3697,29.7625],[-95.3712,29.7608],[-95.373,29.7589],[-95.375,29.758]],destination:{name:'West Assembly Point',coordinates:[-95.375,29.758]},audio:'/demo/audio/houston.wav'},
 {id:'houston-b',name:'Alex Morgan',start:[-95.367,29.761],route:[[-95.367,29.761],[-95.3684,29.760],[-95.370,29.759],[-95.373,29.7589],[-95.375,29.758]],destination:{name:'West Assembly Point',coordinates:[-95.375,29.758]},audio:'/demo/audio/houston.wav'},
 {id:'houston-c',name:'Sam Rivera',start:[-95.361,29.769],route:[[-95.361,29.769],[-95.360,29.771]],destination:{name:'North Assembly Point',coordinates:[-95.360,29.771]},audio:'/demo/audio/houston-north.wav'}],summary:'Wind-driven fire expanding towards the southeast.',instruction:'Fire is approaching your area. Go to West Assembly Point within three minutes. Follow the marked route west, away from the fire.'}
};
const fc=features=>({type:'FeatureCollection',features});
function offset(p,east,north){return [p[0]+east/(111195*Math.cos(p[1]*Math.PI/180)),p[1]+north/111195];}
function corridor(points,width){if(points.length<2)return fc([]);const left=[],right=[];for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=(b[0]-a[0])*Math.cos(points[i][1]*Math.PI/180),dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;left.push(offset(points[i],-dy/len*width,dx/len*width));right.push(offset(points[i],dy/len*width,-dx/len*width));}const ring=[...left,...right.reverse(),left[0]];return fc([{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{demo:true}}]);}
export function hazardAt(id,time,buffer=0){const s=scenarios[id];if(!s)throw new Error('Unknown scenario');if(time<=0)return fc([]);const t=Math.min(1,time/(id==='rasuwa'?65:105));if(id==='rasuwa'){const front=positionAlong(s.flow,t),total=s.flow.slice(1).reduce((n,p,i)=>n+distanceM(s.flow[i],p),0),target=total*t,points=[s.flow[0]];let travelled=0;for(let i=1;i<s.flow.length;i++){const length=distanceM(s.flow[i-1],s.flow[i]);if(travelled+length>=target){points.push(front);break;}points.push(s.flow[i]);travelled+=length;}if(points.length<2)points.push(front);return corridor(points,28+52*t+buffer);}
 const bearing=s.wind.bearing*Math.PI/180,major=70+820*t+buffer,minor=40+230*t+buffer,shift=major*.65,center=offset(s.origin,Math.sin(bearing)*shift,Math.cos(bearing)*shift),ring=[];for(let i=0;i<=128;i++){const a=i/128*2*Math.PI,x=Math.cos(a)*major,y=Math.sin(a)*minor;ring.push(offset(center,x*Math.sin(bearing)+y*Math.cos(bearing),x*Math.cos(bearing)-y*Math.sin(bearing)));}return fc([{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{demo:true}}]);}
export function contains(point,featureCollection){return featureCollection.features.some(f=>{let yes=false;const ring=f.geometry.coordinates[0];for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;});}
export function riskAt(id,time,position){return contains(position,warningAt(id,time));}
export function interpolateRoute(route,fraction){return positionAlong(route,Math.max(0,Math.min(1,fraction)));}

export function warningAt(id,time){return time>=0?hazardAt(id,time+25,id==='rasuwa'?180:70):{type:'FeatureCollection',features:[]};}
