import test from 'node:test';import assert from 'node:assert/strict';
import {createResponseDemo} from '../src/demo/engine.mjs';
import {voiceContext,floodStatus,evacuationRoute,agentDefinition,buildingGuide,signedUrl} from '../src/demo/voice-agent.mjs';

function drill(scenario='princeton',person='princeton-a',seconds=20){let time=Date.now();const d=createResponseDemo({phoneKey:'k',responderKey:'r',now:()=>time});d.control({action:'scenario',scenario});
 const {token}=d.connect({key:'k',personId:person,consent:true});d.control({action:'start'});const tick=n=>{for(let i=0;i<n;i++){time+=1000;d.operatorState();}};tick(seconds);return {d,token,tick};}

test('Building guide combines the Matterport scan with the room catalogue',()=>{
 const G=buildingGuide();assert.equal(G.matterport.modelId,'P3S6VUTP3qB');assert.equal(G.matterport.floors.length,2);
 assert.ok(G.matterport.floors.every(f=>f.toStair?.medianM>0),'distance to the stair from the scan');
 assert.ok(G.rooms.some(r=>r.number==='200'&&r.level==='2'));assert.deepEqual(G.stairway.serves,['A','1','2','3']);assert.match(G.caveat,/not the official/);
});
test('Princeton: the agent asks where you are, then gives the way out by Stairway 7 and the Shapiro Walk entrance',()=>{
 const {d,token}=drill(),st=d.deviceState(token);
 assert.ok(evacuationRoute(st,{}).ask,'asks for floor and room first');
 const r=evacuationRoute(st,{floor:'second floor',location:'room two hundred'});assert.match(r.from,/Room 200.*Level 2/);
 const text=r.route.join(' ');assert.match(text,/Stairway 7/);assert.match(text,/not the elevator/);assert.match(text,/Shapiro Walk/);assert.match(text,/west/);assert.match(text,/metres/,'distance from the Matterport scan');
 assert.equal(r.shouldReportTrapped,undefined);d.close();
});
test('Princeton: once the water reaches the building, or the stair is blocked, the agent says go up and report trapped',()=>{
 const {d,token,tick}=drill('princeton','princeton-a',2);
 const blocked=evacuationRoute(d.deviceState(token),{floor:'3',location:'Room 301',blockage:'Stairway 7 is full of smoke'});assert.equal(blocked.shouldReportTrapped,true);assert.match(blocked.route[0],/Stay on Level 3/);
 tick(240);const st=d.deviceState(token),w=floodStatus(st);assert.equal(w.building.waterAtBuilding,true);
 const r=evacuationRoute(st,{floor:'2',location:'Room 201'});assert.equal(r.shouldReportTrapped,true);assert.equal(r.waterAtBuilding,true);assert.match(r.route[0],/Go up to Level 3/);d.close();
});
test('A spoken trapped report becomes a rescue request with the details for the responder',()=>{
 const {d,token}=drill(),res=d.voiceReport(token,{report:{trapped:true,floor:'2',location:'Room 200 <script>',people:3,injuries:'twisted ankle',water:'ankle deep in hallway',canMove:false}});
 assert.equal(res.recorded,true);const sos=d.operatorState().sos.find(x=>x.personId==='princeton-a');
 assert.equal(sos.trapped,true);assert.equal(sos.voice,true);assert.equal(sos.acknowledged,false);assert.equal(sos.report.people,3);assert.equal(sos.report.canMove,false);
 assert.ok(d.operatorState().events.some(e=>/TRAPPED \(voice\) · floor 2, Room 200/.test(e.message)));
 assert.equal(d.operatorState().people.find(p=>p.id==='princeton-a').status,'needs_help');
 assert.throws(()=>d.voiceReport('nope',{report:{trapped:true}}));d.close();
});
test('Houston: flood status and the route to the assembly point come from the live drill',()=>{
 const {d,token}=drill('houston','houston-a',30),st=d.deviceState(token),c=voiceContext(st),f=floodStatus(st);
 assert.equal(c.in_building,false);assert.match(c.scenario,/Houston/);assert.equal(f.simulation,true);assert.ok(f.yourZone);
 const r=evacuationRoute(st,{});assert.ok(r.route||r.say);d.close();
});
test('Agent definition: three client tools, and sessions need our server',async()=>{
 const a=agentDefinition();assert.deepEqual(a.tools.map(t=>t.name),['get_flood_status','get_evacuation_route','report_trapped']);assert.ok(a.tools.every(t=>t.type==='client'));
 assert.match(a.prompt,/go up, not down/);assert.match(a.prompt,/Never invent routes/);
 await assert.rejects(signedUrl({key:'',agentId:'x'}),e=>e.status===503);await assert.rejects(signedUrl({key:'k',agentId:''}),e=>e.status===503);
 const url=await signedUrl({key:'k',agentId:'a1',fetchImpl:async(u,init)=>{assert.equal(init.headers['xi-api-key'],'k');assert.match(u,/agent_id=a1/);return new Response(JSON.stringify({signed_url:'wss://x'}));}});assert.equal(url,'wss://x');
});
