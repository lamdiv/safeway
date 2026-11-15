import test from 'node:test';import assert from 'node:assert/strict';
import {BaseChatModel} from '@langchain/core/language_models/chat_models';
import {AIMessage} from '@langchain/core/messages';
import {createResponseDemo} from '../src/demo/engine.mjs';
import {planResponse,responseTools} from '../src/demo/response-agent.mjs';

// Plays the part of the model so the real Deep Agents loop, tools and subagents run without a provider call.
class ScriptedResponseModel extends BaseChatModel{
 constructor(){super({});this.model='scripted';}
 _llmType(){return 'scripted';}
 bindTools(){return this;}
 async _generate(messages){
  const text=m=>typeof m.content==='string'?m.content:JSON.stringify(m.content),system=messages.filter(m=>m._getType?.()==='system'||m.type==='system').map(text).join(' ');
  const tools=messages.filter(m=>m._getType?.()==='tool'||m.type==='tool'),used=n=>tools.some(m=>m.name===n),call=(name,args)=>new AIMessage({content:'',tool_calls:[{name,args,id:name+'-'+tools.length,type:'tool_call'}]});
  let message;
  if(system.includes('You are the route checker'))message=used('check_evacuation_route')?new AIMessage('Jordan Lee: route checked against the mapped flood.'):call('check_evacuation_route',{personId:'houston-a'});
  else if(!used('write_todos'))message=call('write_todos',{todos:[{content:'Read the live drill',status:'in_progress'},{content:'Check evacuation routes',status:'pending'}]});
  else if(!used('get_situation'))message=call('get_situation',{});
  else if(!used('task'))message=call('task',{description:'Check every resident\'s evacuation route.',subagent_type:'route-checker'});
  else{const s=JSON.parse(tools.find(m=>m.name==='get_situation').content);message=new AIMessage(`Reach first: ${s.residents[0].name}. Route problems: none found. Do now: close low crossings.`);}
  return {generations:[{message,text:typeof message.content==='string'?message.content:''}]};
 }
}
function drill(){let time=Date.now();const d=createResponseDemo({phoneKey:'k',responderKey:'r',now:()=>time});d.control({action:'scenario',scenario:'houston'});d.control({action:'start'});for(let i=0;i<35;i++){time+=1000;d.operatorState();}return d;}

test('Response agent runs the real Deep Agents loop: plans, reads the live drill and delegates to a subagent',async()=>{
 const d=drill(),r=await planResponse(d,{chatModel:new ScriptedResponseModel()});
 assert.match(r.answer,/Jordan Lee/);
 assert.ok(r.steps.some(s=>s.kind==='plan'),'wrote a todo plan');
 assert.ok(r.steps.some(s=>s.kind==='tool'&&s.name==='get_situation'));
 assert.ok(r.steps.some(s=>s.kind==='subagent'&&s.name==='route-checker'),'delegated to the route-checker subagent');
 assert.ok(r.toolEvents.some(e=>e.name==='check_evacuation_route'&&e.type==='tool_end'),'the subagent ran its own tool');
 assert.ok(r.usage.modelCalls<=8);d.close();
});
test('Agent tools read the drill without changing it and report real grid values',async()=>{
 const d=drill(),before=JSON.stringify(d.operatorState().people),t=responseTools(d);
 const s=JSON.parse(await t.getSituation.invoke({}));assert.equal(s.drill.scenario,'Hurricane Harvey · August 2017');assert.equal(s.residents.length,3);assert.ok(s.residents[0].homeDepthFt>3,'Jordan lives in highly affected water');
 const w=JSON.parse(await t.timeUntilWater.invoke({personId:'houston-c'}));assert.ok(w.warningDueAtSecond>w.secondsFromNow);
 const r=JSON.parse(await t.checkRoute.invoke({personId:'houston-a'}));assert.equal(r.assemblyPointDry,true);
 assert.equal(JSON.stringify(d.operatorState().people),before,'reading does not change the drill');d.close();
});
test('The agent refuses Rasuwa and overlong questions',async()=>{
 let time=Date.now();const d=createResponseDemo({phoneKey:'k',responderKey:'r',now:()=>time});
 await assert.rejects(responseTools(d).getSituation.invoke({}),/Houston/);
 await assert.rejects(planResponse(d,{question:'x'.repeat(601),chatModel:new ScriptedResponseModel()}),/600 characters/);d.close();
});
