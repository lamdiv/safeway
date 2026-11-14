/** Headwater screening engine. No probabilistic hazard or structural claims. */
export const VERSION='0.1.0';
export function validateGrid(grid){
 if(!grid||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||grid.width<2||grid.height<2||grid.width*grid.height>500000)throw new Error('Terrain grid dimensions are invalid.');
 if(!Array.isArray(grid.bbox)||grid.bbox.length!==4||grid.bbox.some(v=>!Number.isFinite(v))||grid.bbox[0]>=grid.bbox[2]||grid.bbox[1]>=grid.bbox[3]||grid.bbox[0]<-180||grid.bbox[2]>180||grid.bbox[1]<-85||grid.bbox[3]>85)throw new Error('Terrain extent must be valid WGS84 bounds.');
 if(!Array.isArray(grid.elevation)||grid.elevation.length!==grid.width*grid.height||grid.elevation.some(v=>v!==null&&!Number.isFinite(v)))throw new Error('Terrain values must be finite elevations or null.');
 return grid;
}
export function gridIndex(grid,p){
 const [w,s,e,n]=grid.bbox;
 if(!p||p.length!==2||!p.every(Number.isFinite)||p[0]<w||p[0]>e||p[1]<s||p[1]>n)return -1;
 const x=Math.min(grid.width-1,Math.floor((p[0]-w)/(e-w)*grid.width));
 const y=Math.min(grid.height-1,Math.floor((n-p[1])/(n-s)*grid.height));
 return y*grid.width+x;
}
export function cellCoordinate(grid,index){
 const x=index%grid.width,y=Math.floor(index/grid.width),[w,s,e,n]=grid.bbox;
 return [w+(x+.5)/grid.width*(e-w),n-(y+.5)/grid.height*(n-s)];
}
export function distanceM(a,b){const k=111195,lat=(a[1]+b[1])/2*Math.PI/180;return Math.hypot((a[0]-b[0])*k*Math.cos(lat),(a[1]-b[1])*k);}
function pointSegmentM(p,a,b){
 const k=111195,c=Math.cos(p[1]*Math.PI/180),ax=(a[0]-p[0])*k*c,ay=(a[1]-p[1])*k,bx=(b[0]-p[0])*k*c,by=(b[1]-p[1])*k;
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(ax+t*dx,ay+t*dy);
}
export function inRing(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if(pointSegmentM(p,a,b)<.001)return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function inPolygon(p,polygon){return polygon.length>0&&inRing(p,polygon[0])&&!polygon.slice(1).some(r=>inRing(p,r));}
export function polygonsOf(fc){return fc.features.flatMap(f=>f.geometry.type==='MultiPolygon'?f.geometry.coordinates:f.geometry.type==='Polygon'?[f.geometry.coordinates]:[]);}
export function insideExtent(p,polygons){return polygons.some(poly=>inPolygon(p,poly));}
export function boundaryDistance(p,polygons){
 let min=Infinity;
 for(const poly of polygons)for(const ring of poly)for(let i=1;i<ring.length;i++)min=Math.min(min,pointSegmentM(p,ring[i-1],ring[i]));
 return min;
}
class MinHeap{
 constructor(){this.a=[];}
 push(item){const a=this.a;let i=a.length;a.push(item);while(i>0){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
 pop(){const a=this.a,out=a[0],last=a.pop();if(a.length){let i=0;while(true){let l=i*2+1;if(l>=a.length)break;let r=l+1,j=r<a.length&&a[r][0]<a[l][0]?r:l;if(a[j][0]>=last[0])break;a[i]=a[j];i=j;}a[i]=last;}return out;}
 get size(){return this.a.length;}
}
const NEIGHBORS=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
/** Priority flood gives an acyclic drainage parent toward a boundary outlet.
 * Its accumulation derives a channel proxy from this cropped DEM only.
 */
export function buildDrainage(input,{channelCells=90}={}){
 const grid=validateGrid(input),w=grid.width,h=grid.height,N=w*h;
 const filled=new Float64Array(N),parent=new Int32Array(N).fill(-1),seen=new Uint8Array(N),order=[],heap=new MinHeap();
 const valid=i=>grid.elevation[i]!==null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;filled[i]=valid(i)?grid.elevation[i]:NaN;
  if(!valid(i)){seen[i]=1;continue;}
  if(x===0||y===0||x===w-1||y===h-1||NEIGHBORS.some(([dx,dy])=>{const xx=x+dx,yy=y+dy;return xx>=0&&yy>=0&&xx<w&&yy<h&&!valid(yy*w+xx);})){seen[i]=1;heap.push([filled[i],i]);}
 }
 while(heap.size){const [z,i]=heap.pop();order.push(i);const x=i%w,y=Math.floor(i/w);
  for(const [dx,dy] of NEIGHBORS){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const j=yy*w+xx;if(seen[j])continue;seen[j]=1;parent[j]=i;filled[j]=Math.max(grid.elevation[j],z);heap.push([filled[j],j]);}
 }
 const accumulation=new Float64Array(N).fill(1);
 for(let k=order.length-1;k>=0;k--){const i=order[k];if(parent[i]>=0)accumulation[parent[i]]+=accumulation[i];}
 const channel=new Uint8Array(N),drain=new Int32Array(N).fill(-1),hand=new Float64Array(N).fill(NaN);
 for(const i of order){if(accumulation[i]>=channelCells){channel[i]=1;drain[i]=i;hand[i]=0;}else if(parent[i]>=0&&drain[parent[i]]>=0){drain[i]=drain[parent[i]];hand[i]=Math.max(0,filled[i]-filled[drain[i]]);}}
 return {grid,filled,parent,accumulation,channel,drain,hand,method:'Priority-flood drainage proxy; cropped catchment; uncalibrated'};
}
export function screenAssets(assets,drainage,{stage=10,spread=.25}={}){
 if(!Number.isFinite(stage)||stage<0||stage>60||!Number.isFinite(spread)||spread<0||spread>1)throw new Error('Stage must be 0–60 m and sensitivity 0–100%.');
 const stages=[Math.max(0,stage*(1-spread)),stage,stage*(1+spread)];
 return assets.map(a=>{
  const i=gridIndex(drainage.grid,a.coordinates),rel=i<0?NaN:drainage.hand[i],elev=i<0?null:drainage.grid.elevation[i];
  if(!Number.isFinite(rel))return {...a,band:'unknown',score:null,heightAboveDrainageM:null,reason:i<0?'Outside the terrain window.':'No derived drainage connection; unassessed.',mode:'terrain'};
  const count=stages.filter(s=>s>0&&rel<=s).length;
  const band=count===3?'higher':count>0?'sensitive':'lower';
  return {...a,band,score:count/3*100,scenarioCount:count,totalScenarios:3,heightAboveDrainageM:Math.round(rel*10)/10,elevationM:elev,stageRangeM:[stages[0],stages[2]],mode:'terrain',reason:count?`Terrain cell is ${rel.toFixed(1)} m above its derived drainage; ${count}/3 assumed stages reach that relative height.`:`Terrain cell exceeds all three assumed stages. This is not an all-clear.`,limitations:['Uncalibrated relative-terrain screen.','Point asset on a coarse elevation grid.','Scenario fraction is not event probability.']};
 }).sort((a,b)=>(b.score??-1)-(a.score??-1)||a.id.localeCompare(b.id));
}
export function assessObservedExtent(assets,extent,{uncertaintyM=40}={}){
 if(!Number.isFinite(uncertaintyM)||uncertaintyM<0||uncertaintyM>200)throw new Error('Boundary sensitivity must be 0–200 m.');
 const polygons=polygonsOf(extent);
 return assets.map(a=>{const inside=insideExtent(a.coordinates,polygons),d=boundaryDistance(a.coordinates,polygons),band=inside?(d<=uncertaintyM?'sensitive':'higher'):(d<=uncertaintyM?'sensitive':'lower');
 return {...a,insideMappedExtent:inside,boundaryDistanceM:Math.round(d),band,score:inside?100:(d<=uncertaintyM?50:0),mode:'observed',reason:inside?`Location intersects the mapped post-event footprint${d<=uncertaintyM?' near its boundary':''}.`:`Location is ${Math.round(d)} m from the mapped footprint.`,limitations:['Retrospective geometric intersection, not forecast.','Mapped mass movement is not a calibrated water-depth raster.','Damage-selected asset inventory; no regional false-positive rate.']};}).sort((a,b)=>(b.score??-1)-(a.score??-1)||a.id.localeCompare(b.id));
}
export function summarize(results){
 const counts={higher:0,sensitive:0,lower:0,unknown:0}; for(const a of results)counts[a.band]++;
 return {total:results.length,...counts,intersects:results.filter(a=>a.insideMappedExtent).length,crossings:results.filter(a=>a.kind==='crossing').length};
}
export function compareRuns(before,after){const old=new Map(before.map(a=>[a.id,a]));return after.filter(a=>old.has(a.id)&&old.get(a.id).band!==a.band).map(a=>({id:a.id,name:a.name,from:old.get(a.id).band,to:a.band,reason:a.reason}));}
export function assetGeoJSON(results){return {type:'FeatureCollection',features:results.map(a=>({type:'Feature',id:a.id,geometry:{type:'Point',coordinates:a.coordinates},properties:{id:a.id,kind:a.kind,band:a.band,mode:a.mode,screening_index:a.score,probability:null,reason:a.reason,height_above_drainage_m:a.heightAboveDrainageM??null,source:a.source}}))};}
export function validateImportedAssets(fc){
 if(!fc||fc.type!=='FeatureCollection'||!Array.isArray(fc.features)||fc.features.length>10000)throw new Error('Import a GeoJSON FeatureCollection with at most 10,000 point assets.');
 const ids=new Set();
 return fc.features.map((f,i)=>{if(f.geometry?.type!=='Point'||f.geometry.coordinates.length!==2||!f.geometry.coordinates.every(Number.isFinite))throw new Error(`Feature ${i+1} must contain one finite WGS84 point.`);const [lon,lat]=f.geometry.coordinates;if(Math.abs(lon)>180||Math.abs(lat)>90)throw new Error('Asset coordinates must be WGS84 longitude/latitude.');const id=String(f.properties?.id??f.id??`IMPORT-${i+1}`);if(ids.has(id))throw new Error('Asset IDs must be unique.');ids.add(id);return {id,name:String(f.properties?.name??id).slice(0,120),kind:f.properties?.kind==='crossing'?'crossing':'building',coordinates:[lon,lat],source:'user-import',vulnerability:null,inventory_basis:'user-supplied; provenance requires review'};});
}
export function makeReport({results,parameters,asOf,mode,manifest}){return {schema:'headwater.report.v1',engine:VERSION,createdAt:new Date().toISOString(),asOf,mode,parameters,summary:summarize(results),assets:results,sourceManifest:manifest,claims:{forecast:false,calibratedProbability:false,structuralForce:false,waterDepth:false,velocity:false,arrivalTime:false},limitations:['Research prototype; scenario screening, not operational warning.','Historical terrain and selected post-event assets.','No vulnerability model or complete regional inventory.']};}
