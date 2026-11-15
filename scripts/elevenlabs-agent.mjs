// Create or update the SafeWay two-way voice agent on ElevenLabs (Agents Platform) and save its id to .env.
// Leaves the team's existing "Evacuation Guide" agent untouched. Knowledge base (RAG): the team's
// "Julis Romo Rabinowitz Building" document plus a SafeWay drill document generated here.
// Run: node --env-file=.env scripts/elevenlabs-agent.mjs
import {readFile,writeFile} from 'node:fs/promises';
import {agentDefinition,buildingGuide,VOICE_AGENT_NAME,voiceConversationSettings} from '../src/demo/voice-agent.mjs';

const KEY=process.env.ELEVENLABS_API_KEY;if(!KEY)throw new Error('ELEVENLABS_API_KEY is not set (.env)');
const API='https://api.elevenlabs.io/v1';
const call=async(method,path,body,form)=>{const r=await fetch(API+path,{method,headers:{'xi-api-key':KEY,...(form?{}:{'Content-Type':'application/json'})},body:form||(body&&JSON.stringify(body))});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}if(!r.ok)throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0,600)}`);return data;};

const VOICE='cjVigY5qzO86Huf0OWal';  // the team's chosen voice (from the Evacuation Guide agent)
const TEAM_DOC_NAME='Julis Romo Rabinowitz Building';
const DRILL_DOC_NAME='SafeWay flood drill guide';

// Knowledge base: reuse the team's building document; (re)create the SafeWay drill document.
const docs=(await call('GET','/convai/knowledge-base?page_size=100')).documents;
const team=docs.find(d=>d.name===TEAM_DOC_NAME);
const G=buildingGuide();
const drillText=[`${DRILL_DOC_NAME}. SafeWay runs flood drills. Everything here is a simulation unless the caller reports a real emergency.`,
 `Princeton drill: an artificial flood rises out of Lake Carnegie and Stony Brook toward ${G.name}, ${G.address}. The warning call starts the moment the drill starts. Assembly point: ${G.assembly}.`,
 `Way out of ${G.name}: ${G.stairway.name} serves Levels ${G.stairway.serves.join(', ')}. The ${G.exit.name} is ${G.exit.where}. ${G.exit.note} ${G.caveat}`,
 `Matterport 3D scan of the building: ${G.matterport.floors.map(f=>`${f.label}: hallway about ${f.hallwaySpanM} m across, the stair is a median ${f.toStair?.medianM} m and at most ${f.toStair?.maxM} m walk from scanned hallway points`).join('; ')}. Floors are ${G.matterport.stair.riseM} m apart with a half-landing at ${G.matterport.stair.landingHeightM} m.`,
 `Rooms: ${G.rooms.map(r=>`Room ${r.number} (${r.use}, Level ${r.level})`).join('; ')}.`,
 'Flood safety: in a building, go up, never down toward water. Never walk through moving water: 6 inches can knock a person over. Never drive through flood water: 12 inches can float a car. If trapped, go to the highest floor, not a closed attic, signal from a window, and keep the phone on.',
 'Zones: red means more than 3 ft of water expected, leave on the first warning. Yellow means 1 to 3 ft, water gets into homes and stalls cars, leave now. Green means under 1 ft at the edge of the flood, move away and stay off flooded paths.',
 'Houston drills: Hurricane Harvey 2017 in Kingwood, a downtown flash flood on Buffalo and White Oak Bayous, and a Brays Bayou flash flood in Meyerland. Depths are estimates from mapped flood extents and USGS 3DEP elevation, not forecasts.'].join('\n\n');
for(const d of docs.filter(d=>d.name===DRILL_DOC_NAME))await call('DELETE','/convai/knowledge-base/'+d.id+'?force=true').catch(e=>console.log('could not delete old drill doc:',e.message.slice(0,120)));
const drill=await call('POST','/convai/knowledge-base/text',{name:DRILL_DOC_NAME,text:drillText});
const knowledge=[...(team?[{type:'text',name:team.name,id:team.id,usage_mode:'auto'}]:[]),{type:'text',name:DRILL_DOC_NAME,id:drill.id,usage_mode:'auto'}];

const def=agentDefinition(),speech=voiceConversationSettings();
const config={name:VOICE_AGENT_NAME,tags:['safeway'],
 conversation_config:{turn:speech.turn,vad:speech.vad,agent:{...speech.agent,first_message:def.firstMessage,language:'en',dynamic_variables:{dynamic_variable_placeholders:def.dynamicVariables},
   prompt:{prompt:def.prompt,llm:'gemini-2.5-flash',temperature:0.2,tools:def.tools,knowledge_base:knowledge,rag:{enabled:true,embedding_model:'e5_mistral_7b_instruct',max_documents_length:50000}}},
  tts:{voice_id:VOICE,model_id:'eleven_flash_v2'},conversation:{max_duration_seconds:600}},
 platform_settings:{auth:{enable_auth:true}}};  // sessions only via signed URLs from our server

const existing=(await call('GET','/convai/agents?page_size=100')).agents.find(a=>a.name===VOICE_AGENT_NAME);
const agentId=existing?(await call('PATCH','/convai/agents/'+existing.agent_id,config),existing.agent_id):(await call('POST','/convai/agents/create',config)).agent_id;
const env=await readFile('.env','utf8');await writeFile('.env',/^HEADWATER_VOICE_AGENT_ID=.*$/m.test(env)?env.replace(/^HEADWATER_VOICE_AGENT_ID=.*$/m,'HEADWATER_VOICE_AGENT_ID='+agentId):env.trimEnd()+'\nHEADWATER_VOICE_AGENT_ID='+agentId+'\n',{mode:0o600});
const check=await call('GET','/convai/agents/'+agentId),p=check.conversation_config.agent.prompt;
console.log(JSON.stringify({agent:existing?'updated':'created',name:check.name,tools:(p.tools||[]).map(t=>t.name).concat(p.tool_ids||[]),knowledge:(p.knowledge_base||[]).map(k=>k.name),rag:p.rag?.enabled,llm:p.llm,voice:check.conversation_config.tts.voice_id,auth:check.platform_settings?.auth?.enable_auth},null,1));
