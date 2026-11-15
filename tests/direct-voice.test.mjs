import test from 'node:test';import assert from 'node:assert/strict';import {createResponseDemo} from '../src/demo/engine.mjs';import {voiceContext} from '../src/demo/voice-agent.mjs';
test('Direct conversation phones never receive competing one-way ringing calls',()=>{const d=createResponseDemo({phoneKey:'phones'});d.control({action:'scenario',scenario:'princeton'});const p=d.connect({key:'phones',personId:'princeton-a',consent:true,voiceMode:'conversation'});d.control({action:'start'});assert.equal(d.deviceState(p.token).call,null);assert.equal(d.operatorState().calls.length,0);d.setVoiceStatus(p.token,{status:'connected'});assert.equal(d.operatorState().conversations[0].status,'connected');d.deviceAction(p.token,{action:'stop'});assert.equal(d.operatorState().conversations.length,0);assert.throws(()=>d.setVoiceStatus(p.token,{status:'connected'}),/Connected phone/);d.close();});
test('A Princeton conversation uses Princeton building context even while another drill is selected',()=>{const d=createResponseDemo({phoneKey:'phones'}),p=d.connect({key:'phones',personId:'princeton-b',consent:true,voiceMode:'conversation'});const s=d.voiceState(p.token);assert.equal(s.scenario.id,'princeton');assert.equal(s.mode,'ready');assert.equal(s.person.id,'princeton-b');assert.equal(voiceContext(s).in_building,true);assert.throws(()=>d.voiceReport(p.token,{report:{trapped:true}}),/standby/);assert.equal(d.operatorState().sos.length,0);d.close();});
test('Switching a warning phone into conversation cancels its old prerecorded call',()=>{const d=createResponseDemo({phoneKey:'phones'});d.control({action:'scenario',scenario:'princeton'});const p=d.connect({key:'phones',personId:'princeton-a',consent:true});d.control({action:'start'});const previous=d.deviceState(p.token).call;assert.ok(previous);d.setVoiceStatus(p.token,{status:'connecting'});assert.equal(d.deviceState(p.token).call.status,'cancelled');assert.equal(d.deviceState(p.token).voiceMode,'conversation');d.close();});

test('A following phone opened from a Princeton URL uses Rasuwa and follows every dashboard scenario',()=>{
 const d=createResponseDemo({phoneKey:'phones'}),p=d.connect({key:'phones',personId:'princeton-b',consent:true,voiceMode:'conversation',followScenario:true});
 assert.equal(p.personId,'rasuwa-b');
 for(const id of ['rasuwa','princeton','houston','houston-downtown','rasuwa']){
  d.control({action:'scenario',scenario:id});d.control({action:'start'});
  const st=d.voiceState(p.token),ui=d.deviceState(p.token),ctx=voiceContext(st);
  assert.equal(st.scenario.id,id);assert.equal(ui.person.id,st.person.id);assert.equal(st.active,true);
  assert.equal(st.person.id,id.startsWith('houston')?'houston-b':id+'-b');
  assert.equal(ctx.in_building,id==='princeton');if(id!=='princeton'){assert.doesNotMatch(ctx.scenario,/Princeton/);assert.equal(ctx.building,'none');}
  d.voiceReport(p.token,{report:{trapped:true}});assert.equal(d.operatorState().sos.at(-1).personId,st.person.id);
 }d.close();
});
