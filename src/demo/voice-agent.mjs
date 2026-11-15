// SafeWay two-way voice agent (ElevenLabs Agents Platform). The resident talks to the agent from the warning
// phone; the agent answers from the live drill and, at Princeton, from the Rabinowitz Hall guide built from the
// Matterport scan (scripts/rabinowitz-building.mjs). Its three tools run in the phone's browser as ElevenLabs
// "client tools" and call this server, so the drill stays on localhost and the API key never leaves the server:
//   get_flood_status       live water, zone, deadline and destination for this caller
//   get_evacuation_route   building escape (Princeton) or the route to the assembly point, flood-aware
//   report_trapped         tells the responder someone is trapped or needs help (becomes a rescue request)
import {readFileSync} from 'node:fs';
import {thresholdAt} from './raster-flood.mjs';

export const VOICE_AGENT_NAME='SafeWay Flood Responder';
const ROOT=new URL('../../',import.meta.url);
let guideCache;
export function buildingGuide(){guideCache??=JSON.parse(readFileSync(new URL('public/data/buildings/rabinowitz.json',ROOT)));return guideCache;}

const isPrinceton=state=>state.scenario?.id==='princeton';
const minutes=s=>s==null?null:s<90?Math.max(1,Math.round(s))+' seconds':Math.round(s/60)+' minutes';
const ZONE={red:'red (deep water expected, over 3 ft)',yellow:'yellow (1 to 3 ft expected)',green:'green (outside modeled inundation; monitor updates)',outside:'outside the mapped flood'};

/** Water at the building (Princeton): how far below the building the rising drill water is, in feet. */
function buildingWater(state){
 const b=state.scenario?.building,r=state.scenario?.raster;if(!b||!r?.thresholdsFt||state.mode==='ready')return null;
 const t=thresholdAt(r.thresholdsFt,state.modelTime);if(t===Infinity)return null;
 const gap=t-(b.depthFt??0);return {reached:gap<=0,gapFt:Math.max(0,+gap.toFixed(1))};
}

/** Values the agent's prompt is filled with when the conversation starts. */
export function voiceContext(state){
 const p=state.person||{},g=p.guidance||{},b=state.scenario?.building;
 return {person_name:p.name==='You'?'there':p.name||'there',scenario:[state.scenario?.title,state.scenario?.variant].filter(Boolean).join(' · ')||'flood drill',
  place:state.scenario?.place||state.scenario?.title||'',building:isPrinceton(state)&&b?b.name:'none',in_building:isPrinceton(state),
  zone:ZONE[p.zone]||p.zone||'unknown',action:g.action||'monitor',destination:p.destination?.name||'the assembly point',drill_running:state.mode==='running'};
}

export function floodStatus(state){
 const p=state.person||{},g=p.guidance||{},w=buildingWater(state);
 return {simulation:true,drill:state.mode,scenario:voiceContext(state).scenario,yourZone:ZONE[p.zone]||p.zone,instruction:g.title||null,action:g.action||null,
  waterReachesYouIn:g.arrivalInDemoSeconds!=null&&g.arrivalInDemoSeconds>0?minutes(g.arrivalInDemoSeconds):g.arrivalInDemoSeconds!=null?'water has reached your area':null,
  destination:p.destination?.name||null,routeWithdrawn:!!g.routeWithdrawn,rescueRequested:!!state.sos,responderAcknowledged:!!state.sos?.acknowledged,
  building:w&&{name:state.scenario.building.name,waterAtBuilding:w.reached,waterBelowBuildingFt:w.gapFt},
  note:'Drill estimate, not a real flood forecast.'};
}

/** Escape route. Princeton: inside Rabinowitz Hall from the guide, then to the assembly point. Elsewhere: outdoor route. */
export function evacuationRoute(state,{floor,location,blockage}={}){
 const p=state.person||{},g=p.guidance||{},dest=p.destination?.name||'the assembly point';
 if(!isPrinceton(state)){
  if(g.rescueRequired||g.routeWithdrawn)return {route:null,say:'Your evacuation route was withdrawn because the water changed. Do not walk through water. Get to the highest floor you can reach and stay there. I can tell the responder where you are.',shouldReportTrapped:true};
  return {route:[`Leave now for ${dest}.`,'Follow the green route on your phone.','Never walk or drive through moving water.'],destination:dest,simulation:true};
 }
 const G=buildingGuide(),level=normaliseLevel(floor),room=findRoom(G,location),w=buildingWater(state),blocked=String(blockage||'').toLowerCase();
 const at=room?`Room ${room.number}, ${room.use}, Level ${room.level}`:level?`Level ${level}`:null;
 if(!at)return {route:null,ask:'Which floor are you on, and what room number or sign can you see?',rooms:G.rooms.filter(r=>r.routed).map(r=>r.number)};
 const lvl=room?.level||level,mp=G.matterport.floors.find(f=>f.label==='Floor '+lvl)?.toStair;
 const stairBlocked=/stair|7/.test(blocked),exitBlocked=/shapiro|exit|entrance|door|ground|water|flood/.test(blocked);
 if(lvl==='B')return {from:at,route:['Go up, not out: take Stairway 7 up to Level 1 or higher.','Do not stay below ground in a flood.'],shouldReportTrapped:stairBlocked};
 if(stairBlocked||w?.reached||exitBlocked&&lvl!=='3'){
  const up=lvl==='3'?'Stay on Level 3':'Go up to Level 3 if you can reach it safely';
  return {from:at,waterAtBuilding:!!w?.reached,route:[`${up}. Do not go down toward the water or the Shapiro Walk entrance.`,'Move away from the stairs into a room with a window, close the door, and stay together.','Keep your phone on. Responders have your location.'],
   shouldReportTrapped:true,why:stairBlocked?'Stairway 7 is blocked and the guide shows no other confirmed stair.':w?.reached?'Flood water has reached the building, so the ground-level exit is under water.':'The exit is blocked.',caveat:G.caveat};
 }
 const steps=[room?`Leave Room ${room.number} into the Level ${lvl} hallway.`:`Go into the Level ${lvl} hallway.`,
  `Walk to Stairway 7${mp?` (in the 3D scan it is about ${mp.medianM} metres from the middle of this hallway)`:''}.`,
  'Take the stairs, not the elevator.',lvl==='A'?'Go up to the half-landing between Level A and Level 1.':'Go down to the landing between Level 1 and Level A.',
  'Leave by the Shapiro Walk entrance on that landing. Mind the outside steps.',`Outside, head west and uphill to ${G.assembly}. Do not go toward the lake.`];
 return {from:at,route:steps,waterBelowBuildingFt:w?.gapFt??null,deadline:p.guidance?.arrivalInDemoSeconds>0?'Water reaches the building in about '+minutes(p.guidance.arrivalInDemoSeconds):null,
  sources:'Stairway 7 and the Shapiro Walk entrance: published accessibility survey. Distance: Matterport scan of Rabinowitz Hall.',caveat:G.caveat};
}
function normaliseLevel(f){const s=String(f??'').toLowerCase().replace(/level|floor|the|th|st|nd|rd/g,'').trim();if(!s)return null;
 if(/^(a|campus|ground)/.test(s))return 'A';if(/^b|basement|lower/.test(s))return 'B';const n={one:'1',first:'1',two:'2',second:'2',three:'3',third:'3'}[s]||s.match(/\d/)?.[0];return ['1','2','3'].includes(n)?n:null;}
function findRoom(G,text){const s=String(text??'').toUpperCase();if(!s)return null;const words={'TWO HUNDRED':'200','TWO ZERO ZERO':'200'};let q=s;for(const [k,v] of Object.entries(words))q=q.replace(k,v);
 if(/ECONOMICS COMMON/.test(q))return G.rooms.find(r=>r.number==='200');const m=q.match(/\b(A?\d{2,3}[AB]?)\b/);return m?G.rooms.find(r=>r.number===m[1])||null:null;}

/** Agent definition (prompt, first message, client tools). scripts/elevenlabs-agent.mjs creates or updates it. */
export function agentDefinition(){
 const prompt=`# Who you are
You are SafeWay, a calm two-way voice line for people caught in a flood drill. This is always a SIMULATION unless the caller says there is a real emergency. You speak to {{person_name}} in the drill "{{scenario}}" at {{place}}.
Their zone: {{zone}}. Current action: {{action}}. Destination: {{destination}}. Building: {{building}}.

# What you do
1. Find out if they are safe, can move, or are trapped. Ask one short question at a time.
2. Flood questions (how deep, how long, where to go): call get_flood_status and answer from it in one or two sentences. Never invent depths or times.
3. Getting out: call get_evacuation_route. In Rabinowitz Hall first ask which floor and which room or sign they can see, then pass them. Give ONE step at a time and wait for "done" before the next. If they report a blocked stair, exit or water, call get_evacuation_route again with the blockage.
4. Trapped, injured, blocked, or the route tool says shouldReportTrapped: call report_trapped with trapped=true, their floor, location, number of people, injuries, water level and whether they can move. Then tell them the responder has their report, and keep them on the line with shelter instructions: go up, never down toward water, stay together, signal from a window.
5. If they just want help but are not trapped, call report_trapped with trapped=false.

# Rules
- Short sentences for speech. Calm. Never more than two sentences before letting them talk.
- Never invent routes, stairs, exits or rooms. Use only what the tools return. If no route, say: "I can't confirm a route from there in this drill. I'm telling the responder."
- Flood safety: never walk or drive through moving water; in a building, go up, not down.
- Real emergency: stop the drill, tell them to call 911 with the building, floor and nearest room, and follow emergency personnel.`;
 const t=(name,description,properties={},required=[])=>({type:'client',name,description,expects_response:true,response_timeout_secs:10,parameters:{type:'object',properties,required}});
 const str=d=>({type:'string',description:d});
 return {name:VOICE_AGENT_NAME,prompt,
  firstMessage:'SafeWay here. This is a flood drill. Are you safe right now, and can you move?',
  tools:[
   t('get_flood_status','Live flood drill status for this caller: zone, when water arrives, what to do, destination, and the water level at their building.'),
   t('get_evacuation_route','Step-by-step way out. In Rabinowitz Hall it needs the floor and room or sign. Pass any blockage the caller reports.',{floor:str('Floor or level the caller is on, e.g. "2", "Level A", "third floor"'),location:str('Room number or sign they can see, e.g. "Room 200", "Economics Common Room"'),blockage:str('Anything blocked: stairs, exit, water in the hallway')}),
   t('report_trapped','Send the caller\'s situation to the human responder as a rescue request. Use when they are trapped, injured, blocked, or ask for help.',{trapped:{type:'boolean',description:'True if they cannot get out safely'},floor:str('Floor or level'),location:str('Room number, sign or landmark'),people:{type:'number',description:'How many people are with them, including the caller'},injuries:str('Injuries, or "none"'),water:str('Water they can see, e.g. "ankle deep in the hallway"'),canMove:{type:'boolean',description:'Whether they can walk'},notes:str('Anything else the responder should know')},['trapped'])],
  dynamicVariables:{person_name:'there',scenario:'flood drill',place:'',zone:'unknown',action:'monitor',destination:'the assembly point',building:'none'}};
}

/** Signed WebSocket URL for one conversation, so the browser never sees the API key. */
export async function signedUrl({agentId=process.env.HEADWATER_VOICE_AGENT_ID,key=process.env.ELEVENLABS_API_KEY,fetchImpl=fetch}={}){
 if(!key)throw Object.assign(new Error('ELEVENLABS_API_KEY is not set in .env'),{status:503});
 if(!agentId)throw Object.assign(new Error('Voice agent not created yet: run node --env-file=.env scripts/elevenlabs-agent.mjs'),{status:503});
 const r=await fetchImpl('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id='+encodeURIComponent(agentId),{headers:{'xi-api-key':key},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Object.assign(new Error('ElevenLabs refused the voice session ('+r.status+')'),{status:502});
 return (await r.json()).signed_url;
}
