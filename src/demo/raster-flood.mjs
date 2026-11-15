// Gridded flood scenarios built by scripts/houston-floods.py. Each cell holds an estimated depth.
// Water "rises" by lowering a depth threshold continuously over time: deep cells flood first and
// shallow edges last. The browser animates with the same function (public/demo/map.mjs). That order is a simulation device, not a forecast of how fast water would arrive.
import {readFileSync} from 'node:fs';

export const TIMELINE={start:5,step:8};const FRAME_START=TIMELINE.start,FRAME_STEP=TIMELINE.step;
const merc=([lng,lat])=>[lng*20037508.34/180,Math.log(Math.tan((90+lat)*Math.PI/360))*6378137];

export function loadRasterFlood(id){
 const dir=new URL(`../../public/data/floods/${id}/`,import.meta.url),meta=JSON.parse(readFileSync(new URL('meta.json',dir))),cells=new Uint8Array(readFileSync(new URL('depth.bin',dir)));
 const [w,h]=meta.size;if(cells.length!==w*h)throw new Error('Depth grid size mismatch for '+id);
 const [x0,y1]=merc(meta.bounds[0]),[x1,y0]=merc(meta.bounds[2]);
 return {id,meta,cells,w,h,x0,y0,x1,y1,url:`/data/floods/${id}/`,frames:meta.thresholdsFt.length,near:new Map()};
}
function cellOf(f,point){const [x,y]=merc(point),c=Math.floor((x-f.x0)/(f.x1-f.x0)*f.w),r=Math.floor((f.y1-y)/(f.y1-f.y0)*f.h);return c<0||r<0||c>=f.w||r>=f.h?null:[r,c];}
/** Estimated depth in feet at a point; null when dry or outside the grid. */
export function depthAt(f,point){const rc=cellOf(f,point);if(!rc)return null;const v=f.cells[rc[0]*f.w+rc[1]];return v?(v-1)/10:null;}
/** Deepest water within `radius` metres (cached; the grid is static). */
function deepestNear(f,point,radius){const key=point.join(',')+'@'+radius;if(f.near.has(key))return f.near.get(key);const rc=cellOf(f,point);let best=null;if(rc){const n=Math.ceil(radius/f.meta.resolutionM);for(let dr=-n;dr<=n;dr++)for(let dc=-n;dc<=n;dc++){if(dr*dr+dc*dc>n*n)continue;const r=rc[0]+dr,c=rc[1]+dc;if(r<0||c<0||r>=f.h||c>=f.w)continue;const v=f.cells[r*f.w+c];if(v&&(best===null||v-1>best))best=v-1;}}const out=best===null?null:best/10;f.near.set(key,out);return out;}
export function frameAt(f,time){return time<FRAME_START?-1:Math.min(f.frames-1,Math.floor((time-FRAME_START)/FRAME_STEP));}
export function frameTime(k){return FRAME_START+k*FRAME_STEP;}
/** Depth threshold (ft) at a time: cells at least this deep are under water. Infinity before the flood starts. */
export function thresholdAt(thresholds,time){if(time<FRAME_START)return Infinity;const u=(time-FRAME_START)/FRAME_STEP,k=Math.floor(u);if(k>=thresholds.length-1)return thresholds.at(-1);return thresholds[k]+(thresholds[k+1]-thresholds[k])*(u-k);}
/** True when water at least as deep as the current threshold is within `radius` metres of the point. */
export function floodedNear(f,time,point,radius=0){const t=thresholdAt(f.meta.thresholdsFt,time);if(t===Infinity)return false;const d=radius?deepestNear(f,point,radius):depthAt(f,point);return d!==null&&d>=t;}
export function zoneAt(f,point){const d=depthAt(f,point);if(d===null)return 'outside';return d>3?'high':d>=1?'medium':'low';}
