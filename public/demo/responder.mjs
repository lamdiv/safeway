import {$,api,escape,toast,clock,labels,watchState,arrivalLabel} from './common.mjs';import {ResponseMap} from './map.mjs';
const params=new URLSearchParams(location.search),map=new ResponseMap('map');let token,state,busy=false,lastSnapshot=0,stopLive;
$('#connect').onclick=async()=>{const b=$('#connect');b.disabled=true;try{const r=await api('connect',{data:{key:params.get('key'),consent:true}});if(r.role!=='responder')throw new Error('Use the responder link');token=r.token;$('#responder-connect').hidden=true;document.body.dataset.connected='true';await refresh();stopLive=watchState(accept,{getToken:()=>token});}catch(e){$('#connect-error').textContent=e.message;}finally{b.disabled=false;}};
function accept(s){const at=Date.parse(s.serverTime);if(at<lastSnapshot||state?.runId===s.runId&&s.revision<state.revision)return;lastSnapshot=at;state=s;render(s);}
const ZONE={red:'Red zone',yellow:'Yellow zone',green:'Green zone'},ago=t=>{const s=Math.max(0,(Date.now()-Date.parse(t))/1000);return s<60?'just now':s<3600?Math.floor(s/60)+' min ago':Math.floor(s/3600)+' h ago';};
const initials=n=>escape(n.split(' ').map(x=>x[0]).join('').slice(0,3).toUpperCase());
const ICON={pin:'<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/>',check:'<path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 11a6.5 6.5 0 0 1 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'};
const svg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
function requestCard(entry,s){
 const p=s.people.find(p=>p.id===entry.personId),r=entry.report,kind=entry.trapped?'trapped':entry.automatic?'auto':'help';
 const label=entry.trapped?'Trapped':entry.automatic?'Route withdrawn':'Needs help',source=entry.voice?'Voice report':entry.automatic?'Automatic':'Phone SOS';
 const facts=r?[['Floor',r.floor],['Location',r.location],['People',r.people],['Injuries',r.injuries],['Water',r.water],['Can move',r.canMove==null?null:r.canMove?'Yes':'No']].filter(([,v])=>v!=null&&v!==''):[];
 const body=r?(facts.length?`<dl class="rx-facts">${facts.map(([k,v])=>`<div${k==='Can move'&&v==='No'||k==='Injuries'&&!/^none$/i.test(v)?' class="warn"':''}><dt>${k}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>`:'')+(r.notes?`<p class="rx-note">${escape(r.notes)}</p>`:''):`<p class="rx-note">${entry.automatic?'Evacuation route withdrawn after conditions changed. '+escape(entry.refuge?.name||'No confirmed nearby refuge')+'.':'Resident pressed Request assistance.'}</p>`;
 return `<article class="rx-card rx-req ${kind}${entry.acknowledged?' done':''}" data-rescue="${entry.personId}">
  <header><span class="rx-badge ${kind}">${entry.voice?svg('mic'):''}${label}</span><span class="rx-meta">${source} · ${ago(entry.report?.at||entry.at)}</span></header>
  <h3>${escape(p?.name||entry.personId)}<small>${escape(s.scenario.building?.name.split(',')[0]||s.scenario.title)}</small></h3>${body}
  ${entry.acknowledged?`<p class="rx-ack">${svg('check')}Acknowledged · rescue team informed</p>`:`<div class="rx-actions"><button class="rx-btn rx-btn-danger" data-sos="${entry.personId}">${svg('check')}Acknowledge</button>${p?`<button class="rx-btn rx-btn-ghost" data-find="${p.id}">${svg('pin')}Show on map</button>`:''}</div>`}
 </article>`;
}
function personCard(p){
 const g=p.guidance,eta=arrivalLabel(g).replace(' to arrival','');
 return `<article class="rx-card rx-person" data-person="${p.id}" data-zone="${p.zone||''}">
  <div class="rx-person-head"><span class="rx-avatar">${initials(p.name)}</span><div><h3>${escape(p.name)}</h3><span class="rx-zone">${ZONE[p.zone]||'Waiting'}${g?' · '+escape(eta):''}</span></div><span class="pill ${p.status}">${labels[p.status]||p.status}</span></div>
  ${g?`<p class="rx-guidance">${escape(g.title)}</p>`:''}
  <div class="rx-person-foot"><span class="rx-device ${p.deviceOnline?'on':''}"><i></i>${p.deviceOnline?'Phone online':'Phone offline'}</span><span>${p.gps?'Real GPS ±'+Math.round(p.gps.accuracy)+' m':'Simulated position'}</span><button class="rx-link" data-find="${p.id}">${svg('pin')}Locate</button></div>
 </article>`;
}
function render(s){
 $('#connection-status').innerHTML='<i class="rx-dot"></i>Live';$('#map-title').textContent=s.scenario.title+(s.scenario.place&&s.scenario.place!==s.scenario.title?' · '+s.scenario.place:'');
 $('#hazard-status').textContent=s.mode==='ready'?'Waiting for the drill to start':s.sos.some(x=>x.trapped)?'People reported trapped':s.sos.some(x=>x.automatic)?'Unsafe route · rescue request active':'Drill running · live positions';
 $('#clock').textContent=clock((s.modelTime??s.elapsed)*(s.clockScale||6));
 const order=e=>(e.acknowledged?10:0)+(e.trapped?0:e.automatic?1:2),requests=[...s.sos].sort((a,b)=>order(a)-order(b)),open=requests.filter(e=>!e.acknowledged);
 $('#stat-trapped').textContent=s.sos.filter(x=>x.trapped&&!x.acknowledged).length;$('#stat-open').textContent=open.length;$('#stat-tracking').textContent=s.tracking.length;
 $('.rx-stat[data-kind=trapped]').classList.toggle('alert',s.sos.some(x=>x.trapped&&!x.acknowledged));$('.rx-stat[data-kind=open]').classList.toggle('alert',open.length>0);
 $('#sos-count').textContent=open.length;$('#tracking-count').textContent=s.tracking.length;
 $('#sos-list').innerHTML=requests.map(e=>requestCard(e,s)).join('');$('#sos-empty').hidden=requests.length>0;
 $('#tracking').innerHTML=s.tracking.length?s.tracking.map(personCard).join(''):'<p class="rx-empty">No resident is sharing in this scenario yet.</p>';
 map.update(s,{people:s.people.filter(p=>s.tracking.some(t=>t.id===p.id))});for(const p of s.tracking)if(p.gps)map.gps(p.id,p.gps.coordinates);
 for(const b of document.querySelectorAll('[data-sos]'))b.onclick=async()=>{b.disabled=true;try{await api('sos/ack',{token,data:{personId:b.dataset.sos,runId:s.runId}});refresh();}catch(e){toast(e.message);b.disabled=false;}};
 for(const b of document.querySelectorAll('[data-find]'))b.onclick=()=>{const t=s.tracking.find(p=>p.id===b.dataset.find),at=t?.gps?.coordinates||t?.position||s.people.find(p=>p.id===b.dataset.find)?.position;if(at){map.locate(at);if(matchMedia('(max-width:860px)').matches)document.querySelector('.rx-map').scrollIntoView({behavior:'smooth',block:'start'});}};
 Object.assign(document.body.dataset,{runId:s.runId,tracking:String(s.tracking.length),automaticRescues:String(s.sos.filter(x=>x.automatic).length)});
}
async function refresh(){if(!token||busy)return;busy=true;try{accept(await api('state',{token}));}catch{$('#connection-status').innerHTML='<i class="rx-dot off"></i>Reconnecting…';}finally{busy=false;}}setInterval(refresh,2000);addEventListener('beforeunload',()=>stopLive?.());
