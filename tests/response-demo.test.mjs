import test from 'node:test';import assert from 'node:assert/strict';import {createResponseDemo} from '../src/demo/engine.mjs';import {scenarios,riskAt,hazardAt,contains} from '../src/demo/scenarios.mjs';
function setup(){let time=Date.now();const d=createResponseDemo({phoneKey:'phone-link',responderKey:'responder-link',now:()=>time});const phone=d.connect({key:'phone-link',personId:'rasuwa-a',consent:true}),responder=d.connect({key:'responder-link',consent:true});return {d,phone,responder,advance(seconds){for(let i=0;i<seconds;i++){time+=1000;d.deviceState(phone.token);d.deviceState(responder.token);}}};}
test('Both scenarios expose the lead demo person; a distant Houston resident is outside the warning area',()=>{assert.ok(riskAt('rasuwa',14,scenarios.rasuwa.people[0].start));assert.ok(riskAt('houston',4,scenarios.houston.people[0].start));assert.equal(riskAt('houston',100,scenarios.houston.people[2].start),false);assert.equal(hazardAt('rasuwa',0).features.length,0);});
test('Risk dispatches one warning call per consenting connected device automatically',()=>{const {d,phone,advance}=setup();d.control({action:'start'});advance(18);let s=d.deviceState(phone.token);assert.ok(s.call);assert.equal(s.call.status,'ringing');assert.match(s.call.instruction,/three minutes/);advance(5);assert.equal(d.operatorState().calls.length,1);d.close();});
test('WebRTC signaling is isolated by device and blocks unauthorized answers',()=>{const {d,phone,advance}=setup();const other=d.connect({key:'phone-link',personId:'rasuwa-b',consent:true});d.control({action:'start'});advance(18);const c=d.deviceState(phone.token).call;const {call:claimed}=d.claim({callId:c.id,callerId:'test-caller'});d.signal('',{callId:c.id,attempt:claimed.attempt,callerId:'test-caller',type:'offer',data:{type:'offer',sdp:'test'}},true);assert.equal(d.poll(phone.token,0,false).signals.length,1);assert.equal(d.poll(other.token,0,false).signals.length,0);assert.throws(()=>d.callAction(other.token,{callId:c.id,status:'answered'},false),/Not your call/);assert.throws(()=>d.signal(phone.token,{callId:c.id,attempt:claimed.attempt,type:'offer',data:{}},false),/Invalid signal/);d.close();});
test('Answer, route movement and responder SOS acknowledgement form separate recorded transitions',()=>{const {d,phone,responder,advance}=setup();d.control({action:'start'});advance(18);let s=d.deviceState(phone.token);assert.throws(()=>d.deviceAction(phone.token,{action:'ack',runId:s.runId}),/Answer/);d.callAction(phone.token,{callId:s.call.id,status:'answered'},false);d.callAction(phone.token,{callId:s.call.id,attempt:d.claim({callId:s.call.id,callerId:'test-caller'}).call.attempt,status:'connected'},false);d.deviceAction(phone.token,{action:'ack',runId:s.runId});advance(4);const tracking=d.deviceState(responder.token).tracking[0];assert.notDeepEqual(tracking.position,scenarios.rasuwa.people[0].start);d.deviceAction(phone.token,{action:'sos',runId:s.runId});d.acknowledge(responder.token,{personId:'rasuwa-a',runId:s.runId},false);assert.equal(d.deviceState(phone.token).sos.acknowledged,true);advance(35);assert.equal(d.deviceState(phone.token).person.arrived,true);d.close();});
test('Stop sharing deletes GPS, removes responder tracking and refuses subsequent location uploads',()=>{const {d,responder}=setup();const p=d.connect({key:'phone-link',personId:'rasuwa-a',consent:true,shareGps:true});d.location(p.token,{coordinates:[-74.65,40.34],accuracy:5});assert.ok(d.deviceState(responder.token).tracking[0].gps);d.deviceAction(p.token,{action:'stop'});assert.equal(d.deviceState(responder.token).tracking.length,0);assert.throws(()=>d.location(p.token,{coordinates:[-74,40],accuracy:5}),/not enabled/);d.control({action:'start'});assert.equal(d.operatorState().calls.length,0);d.close();});
test('Reset and scenario changes invalidate prior calls and stale actions',()=>{const {d,phone,advance}=setup();d.control({action:'start'});advance(18);const old=d.deviceState(phone.token);d.control({action:'scenario',scenario:'houston'});assert.equal(d.deviceState(phone.token).active,false);assert.throws(()=>d.callAction(phone.token,{callId:old.call.id,status:'answered'},false),/expired/);assert.throws(()=>d.deviceAction(phone.token,{action:'sos',runId:old.runId}),/changed/);assert.equal(d.operatorState().calls.length,0);d.close();});
test('Unconsented location and invalid device enrollment fail',()=>{const {d,phone}=setup();assert.throws(()=>d.connect({key:'bad',consent:true}),/Invalid/);assert.throws(()=>d.connect({key:'phone-link',personId:'rasuwa-a'}),/consent/);assert.throws(()=>d.location(phone.token,{coordinates:[0,0],accuracy:4}),/not enabled/);d.close();});

test('Late caller updates cannot downgrade an answered or connected call',()=>{const {d,phone,advance}=setup();d.control({action:'start'});advance(18);const c=d.deviceState(phone.token).call;const claimed=d.claim({callId:c.id,callerId:'test-caller'}).call;d.callAction(phone.token,{callId:c.id,status:'answered'},false);d.callAction('',{callId:c.id,attempt:claimed.attempt,callerId:'test-caller',status:'offering'},true);assert.equal(d.deviceState(phone.token).call.status,'answered');d.callAction('',{callId:c.id,attempt:claimed.attempt,callerId:'test-caller',status:'connected'},true);d.callAction('',{callId:c.id,attempt:claimed.attempt,callerId:'test-caller',status:'offering'},true);assert.equal(d.deviceState(phone.token).call.status,'connected');d.close();});

test('A fast Answer before the caller claims the call is preserved for offer preparation',()=>{
 const {d,phone,advance}=setup();d.control({action:'start'});advance(18);
 const call=d.deviceState(phone.token).call;d.callAction(phone.token,{callId:call.id,status:'answered'},false);
 const claim=d.claim({callId:call.id,callerId:'caller-one'});assert.equal(claim.claimed,true);assert.equal(claim.call.status,'answered');assert.equal(claim.call.attempt,1);d.close();
});
test('Only one dashboard owns a live negotiation; takeover rejects old ICE and statuses',()=>{
 const {d,phone,advance}=setup();d.control({action:'start'});advance(18);const c=d.deviceState(phone.token).call;
 const first=d.claim({callId:c.id,callerId:'caller-one'});assert.equal(d.claim({callId:c.id,callerId:'caller-two'}).claimed,false);
 d.signal('',{callId:c.id,callerId:'caller-one',attempt:first.call.attempt,type:'offer',data:{sdp:'old'}},true);
 advance(9);const second=d.claim({callId:c.id,callerId:'caller-two'});assert.equal(second.call.attempt,2);
 assert.equal(d.poll(phone.token,0,false).signals.length,0);
 assert.throws(()=>d.signal('',{callId:c.id,callerId:'caller-one',attempt:1,type:'candidate',data:null},true),/changed/);
 assert.throws(()=>d.callAction('',{callId:c.id,callerId:'caller-one',attempt:1,status:'failed'},true),/changed/);d.close();
});
test('Transient signaling retries are idempotent and do not publish duplicate SDP',()=>{
 const {d,phone,advance}=setup();d.control({action:'start'});advance(18);const c=d.deviceState(phone.token).call;
 d.claim({callId:c.id,callerId:'caller-one'});const message={callId:c.id,callerId:'caller-one',attempt:1,type:'offer',messageId:'same-request',data:{sdp:'offer'}};
 d.signal('',message,true);assert.equal(d.signal('',message,true).duplicate,true);assert.equal(d.poll(phone.token,0,false).signals.length,1);d.close();
});
test('A failed connection retries with a new generation and late old results cannot end it',()=>{
 const {d,phone,advance}=setup();d.control({action:'start'});advance(18);const c=d.deviceState(phone.token).call;
 d.claim({callId:c.id,callerId:'caller-one'});d.callAction(phone.token,{callId:c.id,status:'answered'},false);
 d.callAction('',{callId:c.id,callerId:'caller-one',attempt:1,status:'failed',reason:'ice_failed'},true);
 assert.equal(d.deviceState(phone.token).call.status,'reconnecting');const next=d.claim({callId:c.id,callerId:'caller-one'});
 assert.equal(next.call.attempt,2);assert.equal(next.call.status,'answered');
 assert.throws(()=>d.callAction('',{callId:c.id,callerId:'caller-one',attempt:1,status:'completed'},true),/changed/);
 d.callAction(phone.token,{callId:c.id,attempt:2,status:'connected'},false);assert.equal(d.deviceState(phone.token).call.status,'connected');d.close();
});
test('Repeated peer failure is bounded and reports the reason',()=>{
 const {d,phone,advance}=setup();d.control({action:'start'});advance(18);const c=d.deviceState(phone.token).call;
 d.callAction(phone.token,{callId:c.id,status:'answered'},false);
 for(let attempt=1;attempt<=3;attempt++){d.claim({callId:c.id,callerId:'caller-one'});d.callAction('',{callId:c.id,callerId:'caller-one',attempt,status:'failed',reason:'ice_failed'},true);}
 const result=d.deviceState(phone.token).call;assert.equal(result.status,'failed');assert.equal(result.attempt,3);assert.equal(result.failureReason,'ice_failed');d.close();
});
