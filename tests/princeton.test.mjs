import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {createResponseDemo} from '../src/demo/engine.mjs';import {scenarios,zoneOf,riskAt} from '../src/demo/scenarios.mjs';import {depthAt,thresholdAt} from '../src/demo/raster-flood.mjs';
test('Princeton calls the moment the drill starts, long before the water reaches the room',()=>{
 let time=Date.now();const d=createResponseDemo({phoneKey:'k',responderKey:'r',now:()=>time});d.control({action:'scenario',scenario:'princeton'});
 const phone=d.connect({key:'k',personId:'princeton-a',consent:true});assert.equal(d.deviceState(phone.token).call,null,'no call before Start');
 d.control({action:'start'});time+=300;const c=d.deviceState(phone.token).call;
 assert.ok(c,'ringing on the first tick after Start');assert.equal(c.audio,'/demo/audio/princeton.wav');assert.match(c.instruction,/Rabinowitz Hall/);
 const s=scenarios.princeton,home=depthAt(s.flood,s.people[0].start),wet=[...Array(121).keys()].find(t=>thresholdAt(s.raster.thresholdsFt,t)<=home);
 assert.ok(wet>=40,'river water reaches the building only after about 40 s, so the call gives a head start ('+wet+' s)');
 assert.equal(zoneOf('princeton',s.people[0].destination.coordinates),'outside','assembly point stays dry');
 assert.equal(riskAt('princeton',-1,s.people[0].start),false);d.close();
});
test('After answering, the phone carries the Rabinowitz Hall Matterport tour',()=>{
 let time=Date.now();const d=createResponseDemo({phoneKey:'k',responderKey:'r',now:()=>time});d.control({action:'scenario',scenario:'princeton'});
 const phone=d.connect({key:'k',personId:'princeton-b',consent:true});d.control({action:'start'});time+=300;
 const st=d.deviceState(phone.token);assert.equal(st.scenario.building.modelId,'P3S6VUTP3qB');assert.match(st.scenario.building.tour,/^https:\/\/my\.matterport\.com\/show\/\?m=P3S6VUTP3qB/);
 assert.ok(existsSync(new URL('../public/demo/audio/princeton.wav',import.meta.url)));d.close();
});
test('Princeton water comes out of the lake and the red, yellow and green zones come from the same depths',()=>{
 const s=scenarios.princeton,r=s.raster;assert.match(r.extent.dataset,/Lake Carnegie/);assert.ok(r.extent.waterLevelM>r.extent.lakeSurfaceM);
 const t=r.thresholdsFt;assert.equal(t.at(-1),0);for(let i=1;i<t.length;i++)assert.ok(t[i]<t[i-1],'the water level only rises');
 const [you,mate]=s.people;assert.equal(zoneOf('princeton',you.start),depthAt(s.flood,you.start)>=3?'high':depthAt(s.flood,you.start)>=1?'medium':'low');
 assert.equal(zoneOf('princeton',mate.start),depthAt(s.flood,mate.start)>=3?'high':'medium');
});

test('The Matterport drill tag tracks the rising water against the building',async()=>{
 const {drillTagText}=await import('../public/demo/building-sdk.mjs');
 assert.match(drillTagText('ready',Infinity,2).join(' '),/has not started/);
 assert.match(drillTagText('running',40,2)[1],/38 ft below this building/);
 assert.match(drillTagText('running',1.5,2)[0],/Flood water is here/);
});
