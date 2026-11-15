import {connectedLevels,inundationFootprint,levelAt} from './inundation.mjs';
export const BAYOU_SOURCE=[-95.3662,29.7653];
const BOUNDS=[-95.382,29.747,-95.351,29.777],SIZE=112,ZOOM=13;
const tilePoint=([lon,lat])=>{const n=2**ZOOM,r=lat*Math.PI/180;return [(lon+180)/360*n,(1-Math.asinh(Math.tan(r))/Math.PI)/2*n];};
async function imageTile(x,y){const image=new Image();image.crossOrigin='anonymous';await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Terrain tile unavailable. No scenario was substituted.'));image.src=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`;});const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);return c.getImageData(0,0,256,256).data;}
function inside(point,ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
function inWater(point,features){return features.some(f=>{const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];return polys.some(rings=>inside(point,rings[0])&&!rings.slice(1).some(ring=>inside(point,ring)));});}
export async function loadHoustonTerrain(waterFeatures){
 if(!waterFeatures?.length)throw new Error('OSM river geometry is not loaded. Keep the bayou in view and retry.');
 const [w,s,e,n]=BOUNDS,[x0,y1]=tilePoint([w,s]),[x1,y0]=tilePoint([e,n]),tiles=new Map();
 const jobs=[];for(let x=Math.floor(x0);x<=Math.floor(x1);x++)for(let y=Math.floor(y0);y<=Math.floor(y1);y++)jobs.push([x,y]);
 // Bounded reference area, at most four concurrent public DEM tile requests.
 for(let start=0;start<jobs.length;start+=4)await Promise.all(jobs.slice(start,start+4).map(async([x,y])=>tiles.set(x+','+y,await imageTile(x,y))));
 const sample=(lon,lat)=>{const [tx,ty]=tilePoint([lon,lat]),data=tiles.get(Math.floor(tx)+','+Math.floor(ty));const px=(tx%1)*255,py=(ty%1)*255,ix=Math.floor(px),iy=Math.floor(py),read=(x,y)=>{const i=(y*256+x)*4;return data[i]*256+data[i+1]+data[i+2]/256-32768;};const fx=px-ix,fy=py-iy;return read(ix,iy)*(1-fx)*(1-fy)+read(Math.min(ix+1,255),iy)*fx*(1-fy)+read(ix,Math.min(iy+1,255))*(1-fx)*fy+read(Math.min(ix+1,255),Math.min(iy+1,255))*fx*fy;};
 const elevations=new Float64Array(SIZE*SIZE);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)elevations[y*SIZE+x]=sample(w+x/(SIZE-1)*(e-w),s+y/(SIZE-1)*(n-s));
 // Source must lie inside mapped river water, not on a roof or hillside.
 let seed=-1,nearestDistance=Infinity,source;
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const point=[w+x/(SIZE-1)*(e-w),s+y/(SIZE-1)*(n-s)],distance=Math.hypot((point[0]-BAYOU_SOURCE[0])*96500,(point[1]-BAYOU_SOURCE[1])*111195),i=y*SIZE+x;if(distance<800&&distance<nearestDistance&&inWater(point,waterFeatures)){seed=i;nearestDistance=distance;source=point;}}
 if(seed<0)throw new Error('No terrain sample falls inside the mapped bayou reference area. No source was invented.');
 return {bounds:BOUNDS,width:SIZE,height:SIZE,elevations,levels:connectedLevels(elevations,SIZE,SIZE,seed),base:elevations[seed],seed,source,loadedAt:new Date().toISOString()};
}
export function scenarioAt(terrain,rise){const stage=terrain.base+rise;return {stage,footprint:inundationFootprint(terrain,stage),contains:p=>{const v=levelAt(terrain,p);return v!==null&&v<=stage;}};}
