// Flood Response Agent for the live-response drill, built with LangChain Deep Agents.
// It reads the running drill through read-only tools, delegates to two subagents (risk analyst and
// route checker) and writes a short plan for responders. It cannot place calls, move people or change
// the drill. Model calls are capped by the shared run budget (src/agent.mjs).
import {createDeepAgent} from 'deepagents';
import {tool} from 'langchain';
import {z} from 'zod';
import {createChatModel,modelConfiguration} from '../models.mjs';
import {createRunBudget} from '../agent.mjs';
import {scenarios,riskAt} from './scenarios.mjs';
import {depthAt,zoneAt,thresholdAt} from './raster-flood.mjs';

const SYSTEM=`You support a flood-response DRILL in Houston. It is an exercise, not a real emergency.
Use the tools for every fact and number; never invent depths, times or names.
You can only read the drill. You cannot place calls, move people or change anything.
Delegate: use the risk-analyst subagent to rank residents, and the route-checker subagent to check evacuation routes.
Then answer in plain language, under 170 words, with three short sections:
1. Reach first: who, and why (depth at home, time until water, whether their phone is connected).
2. Route problems: any route that crosses water, or "none found".
3. Do now: two mitigations from get_mitigations that fit this moment.`;

const ZONE={high:'highly affected (over 3 ft)',medium:'moderately affected (1-3 ft)',low:'lightly affected (under 1 ft)',outside:'outside the mapped flood'};

/** Read-only tools over the running drill. `demo` is the live-response engine. */
export function responseTools(demo,onEvent=()=>{}){
 const mk=(fn,cfg)=>tool(async args=>{onEvent({type:'tool_start',name:cfg.name,args,time:new Date().toISOString()});try{const out=await fn(args);onEvent({type:'tool_end',name:cfg.name,summary:String(out).slice(0,160),time:new Date().toISOString()});return out;}catch(e){onEvent({type:'tool_error',name:cfg.name,summary:e.message,time:new Date().toISOString()});throw e;}},cfg);
 const live=()=>{const s=demo.operatorState(),sc=scenarios[s.scenario.id];if(!sc?.raster)throw new Error('The response agent works on the Houston flood scenarios.');return {s,sc};};
 const firstWet=(sc,point)=>{for(let t=0;t<=sc.duration;t++)if(riskAt(sc.id,t,point))return t;return null;};
 const getSituation=mk(async()=>{
  const {s,sc}=live(),T=thresholdAt(sc.raster.thresholdsFt,s.elapsed);
  return JSON.stringify({drill:{scenario:sc.variant,place:sc.place,historical:sc.historical,useCase:sc.useCase,mode:s.mode,elapsedSeconds:Math.round(s.elapsed),durationSeconds:sc.duration},
   water:T===Infinity?'Not started: no water yet.':`Ground with an estimated depth of at least ${T.toFixed(1)} ft is under water now (deepest areas flood first).`,
   residents:s.people.map(p=>({id:p.id,name:p.name,zone:ZONE[p.zone]||p.zone,homeDepthFt:depthAt(sc.flood,p.start),status:p.status,atRisk:p.atRisk,phoneConnected:p.deviceConnected,call:p.call?.status||'none',onTheirWay:p.acknowledged,arrived:p.arrived,assemblyPoint:p.destination.name})),
   calls:{placed:s.calls.length,answered:s.calls.filter(c=>['connected','completed'].includes(c.status)).length}});
 },{name:'get_situation',description:'Read the live drill: scenario, water level, every resident (zone, depth at home, status, phone, call) and call counts.',schema:z.object({})});
 const timeUntilWater=mk(async({personId})=>{
  const {s,sc}=live(),p=sc.people.find(x=>x.id===personId);if(!p)return `Unknown resident ${personId}. Use ids from get_situation.`;
  const t=firstWet(sc,p.start);
  return JSON.stringify({id:p.id,name:p.name,warningDueAtSecond:t,secondsFromNow:t===null?null:Math.max(0,Math.round(t-s.elapsed)),note:t===null?'Water does not reach this home in this drill.':'Drill seconds (the drill compresses hours into 2 minutes).'});
 },{name:'time_until_water',description:'Seconds of drill time until flood water threatens a resident\'s home.',schema:z.object({personId:z.string().describe('Resident id, e.g. houston-a')})});
 const checkPoint=mk(async({lng,lat})=>{
  const {sc}=live(),d=depthAt(sc.flood,[lng,lat]);
  return JSON.stringify({lng,lat,estimatedDepthFt:d,zone:ZONE[zoneAt(sc.flood,[lng,lat])]});
 },{name:'check_point_depth',description:'Estimated flood depth (ft) and affected zone at a longitude/latitude in the current scenario.',schema:z.object({lng:z.number(),lat:z.number()})});
 const checkRoute=mk(async({personId})=>{
  const {sc}=live(),p=sc.people.find(x=>x.id===personId);if(!p)return `Unknown resident ${personId}. Use ids from get_situation.`;
  const [a,b]=[p.route[0],p.route.at(-1)],n=60,samples=[];
  for(let i=0;i<=n;i++){const q=[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n];samples.push(depthAt(sc.flood,q));}
  const wet=samples.map((d,i)=>({d,i})).filter(x=>x.d!==null),afterLeaving=wet.filter(x=>x.i>n*.15);
  return JSON.stringify({id:p.id,name:p.name,assemblyPoint:p.destination.name,assemblyPointDry:depthAt(sc.flood,b)===null,
   routeCrossesWater:afterLeaving.length>0,deepestOnRouteFt:afterLeaving.length?Math.max(...afterLeaving.map(x=>x.d)):0,
   wetShareOfRoute:+(wet.length/(n+1)).toFixed(2),note:'Straight-line exercise route checked against the full mapped flood. The start may be wet because the resident lives in the flood area.'});
 },{name:'check_evacuation_route',description:'Check a resident\'s evacuation route against the mapped flood: does it cross water after leaving home, and is the assembly point dry?',schema:z.object({personId:z.string()})});
 const getMitigations=mk(async()=>{
  const {sc}=live();return JSON.stringify({zones:sc.zoneText,risks:sc.risks,cause:sc.cause});
 },{name:'get_mitigations',description:'Risks and mitigations for the current flood scenario, plus what each affected zone means.',schema:z.object({})});
 return {getSituation,timeUntilWater,checkPoint,checkRoute,getMitigations};
}

export function createResponseAgent(demo,{chatModel=null,env=process.env,onEvent=()=>{},budget=createRunBudget({onEvent})}={}){
 const llm=chatModel||createChatModel({env});
 const t=responseTools(demo,onEvent);
 return createDeepAgent({model:llm,systemPrompt:SYSTEM,middleware:[budget.middleware],tools:Object.values(t),subagents:[
  {name:'risk-analyst',description:'Rank the drill residents by urgency using zone, depth at home, time until water and whether their phone is connected.',systemPrompt:SYSTEM+' You are the risk analyst. Return a ranked list with one reason each.',tools:[t.getSituation,t.timeUntilWater,t.checkPoint],model:llm,middleware:[budget.middleware]},
  {name:'route-checker',description:'Check every resident\'s evacuation route and assembly point against the mapped flood.',systemPrompt:SYSTEM+' You are the route checker. Return one line per resident.',tools:[t.getSituation,t.checkRoute],model:llm,middleware:[budget.middleware]}]});
}

/** Run once and return the plan with a readable trace. One run at a time per server. */
let running=false;
export async function planResponse(demo,{question='Plan the response for this moment of the drill.',chatModel=null,env=process.env}={}){
 if(running)throw Object.assign(new Error('The response agent is already running.'),{status:409});
 if(typeof question!=='string'||question.length>600)throw Object.assign(new Error('Question must be at most 600 characters.'),{status:400});
 running=true;const events=[],budget=createRunBudget({onEvent:e=>events.push(e)}),config=modelConfiguration(env),started=Date.now();
 try{
  const agent=createResponseAgent(demo,{chatModel,env,onEvent:e=>events.push(e),budget});
  const result=await agent.invoke({messages:[{role:'user',content:question}]},{recursionLimit:40});
  const steps=result.messages.flatMap(m=>(m.tool_calls||[]).map(c=>c.name==='task'?{kind:'subagent',name:c.args?.subagent_type,detail:c.args?.description}:c.name==='write_todos'?{kind:'plan',name:'write_todos',detail:(c.args?.todos||[]).map(x=>x.content).join(' · ')}:{kind:'tool',name:c.name,detail:JSON.stringify(c.args||{})}));
  const last=result.messages.at(-1),answer=Array.isArray(last?.content)?last.content.map(x=>x.text||'').join(''):String(last?.content||'');
  return {answer,steps,toolEvents:events.filter(e=>e.type.startsWith('tool')),usage:budget.usage,model:chatModel?'scripted test model':`${config.providerLabel} · ${config.model}`,seconds:+((Date.now()-started)/1000).toFixed(1)};
 }finally{running=false;}
}
