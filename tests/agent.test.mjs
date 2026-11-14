import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createInvestigator,createRunBudget,investigate} from '../src/agent.mjs';
const load=f=>readFile(new URL('../public/data/'+f,import.meta.url),'utf8').then(JSON.parse);const [grid,assets,extent,catalogue]=await Promise.all(['terrain.json','assets.json','observed-extent.geojson','satellite-catalogue.json'].map(load));
test('Missing server key fails explicitly without making a model request',()=>{assert.throws(()=>createInvestigator({grid,assets,extent,catalogue},{env:{}}),/AWS Bedrock is not configured/);});
test('Real deepagent and Bedrock model can be constructed with analytical tools',()=>{const agent=createInvestigator({grid,assets,extent,catalogue},{env:{AWS_BEARER_TOKEN_BEDROCK:'test-only-not-live'}});assert.equal(typeof agent.invoke,'function');});

import {BaseChatModel} from '@langchain/core/language_models/chat_models';
import {AIMessage} from '@langchain/core/messages';
class ScriptedInvestigationModel extends BaseChatModel{
 constructor(){super({});this.model='headwater-test-model';}
 _llmType(){return 'headwater-test';}
 bindTools(){return this;}
 async _generate(messages){
  const toolMessages=messages.filter(m=>m.type==='tool'||m.getType?.()==='tool');
  let message;
  if(!toolMessages.some(m=>m.name==='inspect_evidence'))message=new AIMessage({content:'',tool_calls:[{name:'inspect_evidence',args:{topic:'Rasuwa mechanism chronology'},id:'test-evidence',type:'tool_call'}]});
  else if(!toolMessages.some(m=>m.name==='screen_asset_exposure'))message=new AIMessage({content:'',tool_calls:[{name:'screen_asset_exposure',args:{stage:20,mode:'terrain'},id:'test-screen',type:'tool_call'}]});
  else{const result=JSON.parse(toolMessages.find(m=>m.name==='screen_asset_exposure').content);message=new AIMessage({content:`Tool result: ${result.summary.higher} higher-band assets. This is scenario screening, not probability.`});}
  return {generations:[{message,text:typeof message.content==='string'?message.content:''}]};
 }
}
test('Deepagent actually executes evidence and exposure tools with a scripted model; no provider call',async()=>{
 const events=[];const agent=createInvestigator({grid,assets,extent,catalogue,asOf:'2026-11-14T23:59:59Z'},{chatModel:new ScriptedInvestigationModel(),onEvent:e=>events.push(e)});
 const result=await agent.invoke({messages:[{role:'user',content:'Inspect the evidence and calculate exposure at20m.'}]},{recursionLimit:20});
 assert.match(String(result.messages.at(-1).content),/101 higher-band/);
 assert.ok(events.some(e=>e.name==='inspect_evidence'&&e.type==='tool_end'));
 assert.ok(events.some(e=>e.name==='screen_asset_exposure'&&e.type==='tool_end'));
});

import {modelConfiguration,createChatModel,MODEL_LIMITS} from '../src/models.mjs';
test('Bedrock defaults are inexpensive Nova with a supported US inference profile; no silent provider fallback',()=>{
 const c=modelConfiguration({OPENAI_API_KEY:'unused'});assert.equal(c.provider,'bedrock');assert.equal(c.configured,false);assert.equal(c.model,'us.amazon.nova-2-lite-v1:0');assert.equal(c.region,'us-east-1');assert.equal(c.accessVerified,false);
 assert.throws(()=>modelConfiguration({HEADWATER_PROVIDER:'unknown'}),/bedrock or openai/);
});
test('Bedrock supports bearer keys, SSO profiles and explicit default-chain opt-in without resolving or exposing credentials',()=>{
 for(const env of [{AWS_BEARER_TOKEN_BEDROCK:'test-only'},{AWS_PROFILE:'test-profile'},{HEADWATER_AWS_ENABLED:'true'},{AWS_ACCESS_KEY_ID:'test',AWS_SECRET_ACCESS_KEY:'test-secret'}]){
  const c=modelConfiguration(env);assert.equal(c.configured,true);assert.equal(JSON.stringify(c).includes('test-secret'),false);
  const model=createChatModel({env});assert.equal(model.model,c.model);assert.equal(model.maxTokens,1200);assert.equal(model.caller.maxRetries,0);
 }
 assert.equal(createChatModel({env:{HEADWATER_PROVIDER:'openai',OPENAI_API_KEY:'test-only'}}).model,'gpt-5.4');
});
test('One shared budget limits concurrent parent/specialist model calls before another paid invocation',async()=>{
 const budget=createRunBudget();let invoked=0;
 const request={messages:[],systemMessage:new AIMessage('Budget test'),tools:[]};
 const handler=async()=>{invoked++;return new AIMessage({content:'Done',usage_metadata:{input_tokens:100,output_tokens:20,total_tokens:120}});};
 await Promise.all(Array.from({length:MODEL_LIMITS.maxCalls+4},()=>budget.middleware.wrapModelCall(request,handler)));
 assert.equal(invoked,8);assert.equal(budget.usage.modelCalls,8);assert.equal(budget.usage.inputTokens,800);assert.equal(budget.usage.outputTokens,160);assert.equal(budget.usage.stoppedAtLimit,true);
});
test('Context guard rejects a large request before any model invocation',async()=>{
 const budget=createRunBudget();const message=await budget.middleware.wrapModelCall({messages:[new AIMessage('x'.repeat(120001))],tools:[]},()=>assert.fail('Must not invoke the provider'));
 assert.match(message.content,/stopped/);assert.equal(budget.usage.modelCalls,0);
});

test('An actual deepagent investigation reports calls across its middleware and does not label a scripted run as live',async()=>{
 const result=await investigate('Compare the available evidence and stage screening.',{grid,assets,extent,catalogue,asOf:'2026-11-14T23:59:59Z'},{chatModel:new ScriptedInvestigationModel(),env:{}});
 assert.equal(result.mode,'test-scripted-deepagent');assert.equal(result.usage.modelCalls,3);assert.equal(result.usage.callsWithUsage,0);assert.match(result.answer,/101 higher-band/);assert.equal(result.events.filter(e=>e.type==='model_start').length,3);
});
