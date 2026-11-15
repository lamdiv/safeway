// Vexcel API 2.0 oblique ("bird's-eye") and ortho photos of a building, fetched on the server so the
// key (VEXCEL_API_KEY in .env) never reaches a browser. Obliques are angled aerial photos looking north,
// south, east or west: they show walls, doors, windows and the ground around a building, where an ortho
// only shows the roof. Requests are limited to the Houston drill area and cached on disk.
// Imagery © Vexcel Imaging US, Inc.
import {createHash} from 'node:crypto';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';

const API='https://api.vexcelgroup.com/v2',LAYERS='urban,urban-r,wide-area,urban-g';
export const VEXCEL_VIEWS=['north','east','south','west','ortho'];
const HOUSTON={w:-96.0,s:29.4,e:-94.8,n:30.3};  // Harris County and around: the drills and the county flood map

export function vexcelRequest(query){
 const lon=Number(query.lon),lat=Number(query.lat),view=String(query.view||'north'),size=Math.min(1024,Math.max(200,Number(query.size)||640));
 if(!Number.isFinite(lon)||!Number.isFinite(lat))throw Object.assign(new Error('lon and lat required'),{status:400});
 if(lon<HOUSTON.w||lon>HOUSTON.e||lat<HOUSTON.s||lat>HOUSTON.n)throw Object.assign(new Error('Vexcel photos are available for the Houston drills only'),{status:403});
 if(!VEXCEL_VIEWS.includes(view))throw Object.assign(new Error('view must be one of '+VEXCEL_VIEWS.join(', ')),{status:400});
 const wkt=`POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`,dims=`${size},${Math.round(size*.75)}`;
 const dy=5/111320,dx=dy/Math.cos(lat*Math.PI/180),[w,e,so,no]=[lon-dx,lon+dx,lat-dy,lat+dy].map(v=>v.toFixed(7));
 const marker={wkt:`POLYGON((${w} ${so},${e} ${so},${e} ${no},${w} ${no},${w} ${so}))`,'outline-width':5};  // a 10 m square on the spot (oriented/extract fails on buffered points)
 if(view==='ortho')return {path:'ortho/extract',body:{wkt,srid:4326,layer:LAYERS,'buffer-meter':40,crop:'bounding_box','image-format':'jpeg','destination-dimensions':dims,drawing:[{...marker,'outline-color':'rgb(214,69,65)'}]}};
 return {path:'oriented/extract',body:{wkt,srid:4326,layer:'urban','product-type':'oblique-'+view,rotation:'natural','buffer-meter':40,crop:'bbox','image-format':'jpeg','destination-dimensions':dims,
  drawing:[{...marker,'outline-color':'214,69,65','fill-color':'214,69,65',transparency:0}]}};  // oriented quirk: bare r,g,b and a transparent fill
}

// Aerial base map: Vexcel ortho as 512 px XYZ tiles in Web Mercator. Limited to the drill areas Vexcel covers
// (Houston and Princeton; Rasuwa, Nepal, has no Vexcel imagery) and to zooms 11-20.
const MERC=20037508.342789244;
export const VEXCEL_TILE_AREAS=[{name:'Houston',...HOUSTON},{name:'Princeton',w:-74.80,s:40.25,e:-74.50,n:40.45}];
const tileLonLat=(z,x,y)=>{const n=2**z;return [x/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI];};
export function vexcelTileRequest(z,x,y){
 [z,x,y]=[z,x,y].map(Number);if(![z,x,y].every(Number.isInteger)||z<11||z>20||x<0||y<0||x>=2**z||y>=2**z)throw Object.assign(new Error('Tile out of range'),{status:400});
 const [w,n]=tileLonLat(z,x,y),[e,s]=tileLonLat(z,x+1,y+1);
 if(!VEXCEL_TILE_AREAS.some(a=>w<a.e&&e>a.w&&s<a.n&&n>a.s))throw Object.assign(new Error('No Vexcel imagery outside the drill areas'),{status:404});
 const size=2*MERC/2**z,[a,b,c,d]=[-MERC+x*size,MERC-(y+1)*size,-MERC+(x+1)*size,MERC-y*size];
 return {path:'ortho/extract',body:{wkt:`POLYGON((${a} ${b},${c} ${b},${c} ${d},${a} ${d},${a} ${b}))`,srid:3857,layer:LAYERS,crop:'bounding_box','image-format':'jpeg',zoom:z+1,'destination-dimensions':'512,512'}};
}

export function createVexcel({key=process.env.VEXCEL_API_KEY,cacheDir=resolve(process.cwd(),'data/runtime/vexcel-cache'),fetchImpl=fetch}={}){
 const pending=new Map();let active=0;const queue=[];  // at most 6 Vexcel calls at once, so a map pan does not trip the rate limit
 const limit=fn=>new Promise((ok,fail)=>{const run=()=>{active++;fn().then(ok,fail).finally(()=>{active--;queue.shift()?.();});};active<6?run():queue.push(run);});
 async function call(path,body){
  for(let attempt=0;;attempt++){
   const r=await fetchImpl(`${API}/${path}`,{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
   if(r.status===429&&attempt<5){await new Promise(x=>setTimeout(x,Math.min(2**attempt,30)*1000+Math.random()*1000));continue;}
   if(!r.ok){const text=(await r.text()).slice(0,200);throw Object.assign(new Error(r.status===404||r.status===403?'No Vexcel image here':r.status===401?'Vexcel rejected the API key':'Vexcel '+r.status+': '+text),{status:r.status===404||r.status===403?404:502});}
   return Buffer.from(await r.arrayBuffer());
  }
 }
 return {
  configured:!!key,
  async tile(z,x,y){
   if(!key)throw Object.assign(new Error('VEXCEL_API_KEY is not set in .env'),{status:503});
   const req=vexcelTileRequest(z,x,y),file=resolve(cacheDir,'tiles',`${z}-${x}-${y}.jpg`),id='t'+z+'/'+x+'/'+y;
   try{return await readFile(file);}catch{}
   if(!pending.has(id))pending.set(id,limit(()=>call(req.path,req.body)).then(async img=>{await mkdir(resolve(cacheDir,'tiles'),{recursive:true});await writeFile(file,img);return img;}).finally(()=>pending.delete(id)));
   return pending.get(id);
  },
  async photo(query){
   if(!key)throw Object.assign(new Error('VEXCEL_API_KEY is not set in .env'),{status:503});
   const req=vexcelRequest(query),id=createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0,24),file=resolve(cacheDir,id+'.jpg');
   try{return await readFile(file);}catch{}
   if(!pending.has(id))pending.set(id,call(req.path,req.body).then(async img=>{await mkdir(cacheDir,{recursive:true});await writeFile(file,img);return img;}).finally(()=>pending.delete(id)));
   return pending.get(id);
  }
 };
}
