// Build the Rabinowitz Hall (Julis Romo Rabinowitz Building) guide used by the SafeWay voice agent.
// Two sources, kept apart so nothing is invented:
//   * Matterport model P3S6VUTP3qB (Model API, read-only): floors, scan points (sweeps), the rooms they sit in,
//     and the staircase, found as scan points whose height lies between two floors.
//   * The team's building document (ElevenLabs knowledge base "Julis Romo Rabinowitz Building"), which cites the
//     2016 JRR/LAS User Guide pp. 24-28 for room numbers and the published AccessAble survey for Stairway 7 and the
//     Shapiro Walk entrance. Neither establishes official emergency egress; the guide says so.
// Run: node --env-file=.env scripts/rabinowitz-building.mjs   → public/data/buildings/rabinowitz.json
import {mkdir,writeFile} from 'node:fs/promises';

const MODEL='P3S6VUTP3qB';
const {MATTERPORT_TOKEN_ID:id,MATTERPORT_TOKEN_SECRET:secret}=process.env;
if(!id||!secret)throw new Error('MATTERPORT_TOKEN_ID and MATTERPORT_TOKEN_SECRET are required (.env)');
const r=await fetch('https://api.matterport.com/api/models/graph',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64')},
 body:JSON.stringify({query:`{model(id:"${MODEL}"){name floors{id label sequence} locations{id floor{sequence label} position{x y z} neighbors room{id label tags classifications{label}}}}}`})});
const body=await r.json();if(!r.ok||body.errors)throw new Error('Matterport: '+JSON.stringify(body.errors||r.status).slice(0,300));
const m=body.data.model,locs=m.locations,by=new Map(locs.map(l=>[l.id,l]));

// Floor heights: the median scan height per Matterport floor. Scan points well off it are on the stair landing.
const floors=m.floors.map(f=>{const zs=locs.filter(l=>l.floor.sequence===f.sequence).map(l=>l.position.z).sort((a,b)=>a-b);return {...f,sweeps:zs.length,baseZ:zs.length?zs[zs.length>>1]:null};}).filter(f=>f.sweeps);
const stairs=locs.filter(l=>{const f=floors.find(f=>f.sequence===l.floor.sequence);return f&&Math.abs(l.position.z-f.baseZ)>0.6;});
const flat=locs.filter(l=>!stairs.includes(l));
const centre=a=>({x:a.reduce((s,l)=>s+l.position.x,0)/a.length,y:a.reduce((s,l)=>s+l.position.y,0)/a.length});
const stairAt=stairs.length?centre(stairs):null;

// Walking distance from each floor's scan points to the stair, along Matterport's scan-to-scan links on that floor.
const d=(a,b)=>Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z);
function toStair(floorSeq){
 const nodes=locs.filter(l=>l.floor.sequence===floorSeq||stairs.includes(l));if(!stairAt||!nodes.length)return null;
 const entry=flat.filter(l=>l.floor.sequence===floorSeq).sort((a,b)=>Math.hypot(a.position.x-stairAt.x,a.position.y-stairAt.y)-Math.hypot(b.position.x-stairAt.x,b.position.y-stairAt.y))[0];
 if(!entry)return null;const dist=new Map([[entry.id,0]]),todo=[entry];  // Dijkstra from the stair foot outwards (small graph)
 while(todo.length){todo.sort((a,b)=>dist.get(a.id)-dist.get(b.id));const u=todo.shift();for(const n of u.neighbors){const v=by.get(n);if(!v||!nodes.includes(v)||Math.abs(v.position.z-u.position.z)>1.2&&!(stairs.includes(v)||stairs.includes(u)))continue;const nd=dist.get(u.id)+d(u,v);if(nd<(dist.get(v.id)??Infinity)){if(!dist.has(v.id))todo.push(v);dist.set(v.id,nd);}}}
 const vals=flat.filter(l=>l.floor.sequence===floorSeq&&dist.has(l.id)).map(l=>dist.get(l.id)).sort((a,b)=>a-b);
 return vals.length?{scanPoints:vals.length,medianM:Math.round(vals[vals.length>>1]),maxM:Math.round(vals.at(-1))}:null;
}
const span=f=>{const p=flat.filter(l=>l.floor.sequence===f.sequence).map(l=>l.position);return Math.round(Math.hypot(Math.max(...p.map(q=>q.x))-Math.min(...p.map(q=>q.x)),Math.max(...p.map(q=>q.y))-Math.min(...p.map(q=>q.y))));};

const ROOMS={
 A:[['A01','Classroom',1],['A02','Classroom',1],['A12','Classroom'],['A17','Classroom'],['A34','Copy Room'],['A34B','Pantry'],['A87','Classroom'],['A97','Classroom',1],['A98','Classroom',1]],
 1:[['101','Classroom',1],['102','Meeting Room',1],['103','Pantry'],['104','Copy Room'],['116','Copy Room'],['117','Multipurpose Forum'],['134','Copy Room'],['134B','Pantry'],['198','Classroom',1]],
 2:[['200','Economics Common Room',1],['200A','Pantry'],['201','Economics Meeting Room',1],['217','Economics Meeting Room'],['234','Copy Room'],['234B','Pantry'],['296','Pantry'],['298','Economics Meeting Room',1]],
 3:[['301','Meeting Room',1],['396','Copy Room and Pantry'],['397','Meeting Room',1],['398','Pantry'],['399','Multipurpose Room',1]]};

const guide={
 id:'rabinowitz',name:'Julis Romo Rabinowitz Building (Rabinowitz Hall)',address:'20 Washington Road, Princeton, NJ 08544',
 levels:[{id:'B',name:'B Level',note:'Below ground. No confirmed starting points. In a flood, never go down here.'},{id:'A',name:'Campus Level (A)'},{id:'1',name:'Level 1'},{id:'2',name:'Level 2'},{id:'3',name:'Level 3'}],
 rooms:Object.entries(ROOMS).flatMap(([level,list])=>list.map(([number,use,routed])=>({number,level,use,routed:!!routed}))),
 stairway:{name:'Stairway 7',serves:['A','1','2','3'],source:'AccessAble survey of the building (published accessibility guide)'},
 exit:{name:'Shapiro Walk entrance',where:'on the Stairway 7 landing between Level A and Level 1',note:'The exterior approach has steps.',source:'AccessAble survey'},
 assembly:'Drill Assembly Point · high ground west of the building',
 caveat:'Circulation from the published accessibility survey and the 2016 user guide. It is not the official emergency egress plan. In a real emergency follow posted signs and emergency personnel, and call 911 if you cannot get out.',
 matterport:{modelId:MODEL,name:m.name,floors:floors.map(f=>({label:f.label,scanPoints:f.sweeps,hallwaySpanM:span(f),toStair:toStair(f.sequence)})),
  stair:{scanPoints:stairs.length,riseM:+(Math.max(...floors.map(f=>f.baseZ))-Math.min(...floors.map(f=>f.baseZ))).toFixed(1),landingHeightM:stairs.length?+(stairs[0].position.z-Math.min(...floors.map(f=>f.baseZ))).toFixed(1):null},
  roomTypes:[...new Set(locs.map(l=>(l.room?.classifications||[]).map(c=>c.label).join('/')).filter(Boolean))],
  note:'From the Matterport scan: floors, scan points and the stair they link through. The scan carries no room numbers or exit labels, so those come from the user guide and the accessibility survey.'},
 generatedAt:new Date().toISOString()};
await mkdir('public/data/buildings',{recursive:true});await writeFile('public/data/buildings/rabinowitz.json',JSON.stringify(guide,null,1));
console.log(JSON.stringify(guide.matterport,null,1));
