// Princeton drill: people in a room in Rabinowitz Hall (Princeton University). An ARTIFICIAL flood rises out
// of Lake Carnegie and Stony Brook until it reaches the building (built by scripts/houston-floods.py with a
// connected-bathtub model on USGS 3DEP elevation). It is deliberately not realistic: the hall sits ~47 m
// above the lake. The warning call starts the moment the drill starts — SafeWay does not wait for the water.
// The building's 3D tour is the account's public Matterport model.
import {loadRasterFlood,TIMELINE} from './raster-flood.mjs';

export const PRINCETON_INSTRUCTION='This is a SafeWay flood drill. Flood water from Lake Carnegie is rising toward your room in Rabinowitz Hall. Leave now. Take the stairs, not the elevator, get out of the building and head west to the high-ground assembly point. Your phone shows the building and your route.';

const flood=loadRasterFlood('princeton'),meta=flood.meta;
const ASSEMBLY={name:'Drill Assembly Point · High ground west',coordinates:meta.people[0].destination};
const route=p=>[p.start,[p.start[0]-.0025,p.start[1]+.0004],[p.start[0]-.0058,p.start[1]+.0002],p.destination];

export const princetonScenario={
 id:'princeton',title:'Princeton',country:'New Jersey',hazard:'Flood',color:'#4aa8d8',center:[-74.6600,40.3460],zoom:14.9,pitch:48,bearing:0,  // frames lake, building and assembly point; the forced flood runs past every map edge
 duration:120,
 callOnStart:true,warn:{lead:12,radius:0},
 riseText:'Water rising out of Lake Carnegie and Stony Brook toward the building',
 variant:'Artificial river flood · Rabinowitz Hall',place:'Princeton University',
 status:'Lake Carnegie rising toward campus · artificial drill',
 summary:'You are in a room in Rabinowitz Hall. An artificial flood rises out of Lake Carnegie toward you, and SafeWay calls the moment it starts.',
 useCase:'Call first, not when it’s too late: the warning call starts the instant the river starts rising, long before water reaches the room.',
 zoneText:{high:'Red: water over 3 ft. Leave on the first warning.',medium:'Yellow: 1–3 ft. Water reaches doors and stalls cars. Leave now.',low:'Green: under 1 ft. The water’s edge. Move away and stay off flooded paths.',note:'Zones come from the same depth grid as the water: water level minus ground elevation.'},
 source:'Lake Carnegie and Stony Brook (OpenStreetMap) · USGS 3DEP elevation · connected-bathtub drill flood',
 raster:{key:'princeton',url:flood.url,bounds:meta.bounds,size:meta.size,timeline:TIMELINE,exaggeration:1,terrain:false,maxHeightM:4,  // flat water sheet coloured by depth; the terrain tiles here disagree with 3DEP and hide the water
 frames:flood.frames,thresholdsFt:meta.thresholdsFt,areaKm2:meta.areaKm2,areaKm2ByLevel:meta.areaKm2ByLevel,levels:meta.levels,medianDepthFt:meta.medianDepthFt,method:meta.method,extent:meta.extent},
 flood,
 building:{name:'Rabinowitz Hall, Princeton University',modelId:'P3S6VUTP3qB',tour:'https://my.matterport.com/show/?m=P3S6VUTP3qB&play=1&qs=1&brand=0',coordinates:meta.people[0].start,depthFt:meta.people[0].depthFt,source:'Matterport public 3D model'},
 instruction:PRINCETON_INSTRUCTION,
 people:meta.people.map((p,i)=>({id:['princeton-a','princeton-b'][i],name:['You','Your teammate'][i],initials:['YOU','TM'][i],start:p.start,route:route(p),destination:ASSEMBLY,audio:'/demo/audio/princeton.wav',instruction:PRINCETON_INSTRUCTION}))
};
