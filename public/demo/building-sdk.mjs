// Matterport SDK inside the drill building (dashboard only). The SDK key is limited to localhost, so anywhere
// else the plain embedded tour stays. Adds a live drill tag in the 3D scene and buttons that move the tour
// to the ground floor or the floor plan. Read-only: nothing is saved to the Matterport model.
import {api} from './common.mjs';

const say=(el,text)=>{if(el)el.textContent=text;};

export async function mountBuildingSdk({frame,status,controls},building,drill){
 if(location.hostname!=='localhost'){say(status,'Embedded tour (the Matterport SDK key works on localhost only).');return null;}
 let config;try{config=await api('matterport-config');}catch(e){say(status,'Embedded tour · SDK unavailable: '+e.message);return null;}
 await import('/vendor/safeway-matterport.mjs');
 const viewer=document.createElement('matterport-viewer');
 for(const [k,v] of Object.entries({m:config.modelId,'application-key':config.applicationKey,'asset-base':config.assetBase,qs:'1',play:'1',brand:'0'}))viewer.setAttribute(k,v);
 // The web component positions itself absolutely, so it lives in a sized, positioned box.
 const shell=document.createElement('div');shell.className='sdk-shell';shell.append(viewer);frame.replaceWith(shell);say(status,'Connecting the Matterport SDK…');
 const state={sdk:null,tag:null,text:'',sweeps:{},current:null,viewer};
 viewer.addEventListener('mpViewerError',()=>{shell.replaceWith(frame);say(status,'Embedded tour · the SDK could not start for this model.');});
 viewer.addEventListener('mpSdkPlaying',async event=>{
  const sdk=state.sdk=event.detail.mpSdk;say(status,'Matterport SDK connected · live drill tag in the building');
  sdk.Sweep?.current?.subscribe?.(s=>{if(s?.sid)state.current=s;});
  sdk.Sweep?.data?.subscribe?.({onCollectionUpdated:c=>{state.sweeps=c;}});
  for(let i=0;i<40&&!state.current;i++)await new Promise(r=>setTimeout(r,250));
  const at=state.current?.position||{x:0,y:0,z:0},anchor={x:at.x,y:at.y+1.4,z:at.z},color={r:.84,g:.27,b:.25};
  try{
   if(sdk.Tag?.add)[state.tag]=await sdk.Tag.add({label:'Flood drill',description:'Waiting for the drill to start.',anchorPosition:anchor,stemVector:{x:0,y:.35,z:0},color});
   else [state.tag]=await sdk.Mattertag.add([{label:'Flood drill',description:'Waiting for the drill to start.',anchorPosition:anchor,stemVector:{x:0,y:.35,z:0},color}]);
  }catch(e){say(status,'Matterport SDK connected · tag could not be placed ('+e.message+')');}
  controls.hidden=false;
  setInterval(()=>update(state,building,drill()),1000);update(state,building,drill());
 });
 controls.querySelector('[data-sdk=ground]')?.addEventListener('click',()=>groundFloor(state));
 controls.querySelector('[data-sdk=plan]')?.addEventListener('click',()=>state.sdk?.Mode?.moveTo(state.sdk.Mode.Mode.FLOORPLAN));
 controls.querySelector('[data-sdk=inside]')?.addEventListener('click',()=>state.sdk?.Mode?.moveTo(state.sdk.Mode.Mode.INSIDE));
 return state;
}

/** Tag text from the drill: the gap between the rising water and the building, in feet. */
export function drillTagText(mode,thresholdFt,buildingDepthFt){
 if(mode==='ready'||thresholdFt==null||thresholdFt===Infinity)return ['Flood drill','The drill has not started. When it does, the warning call rings at once.'];
 const gap=thresholdFt-buildingDepthFt;
 if(gap>0)return ['Flood drill · leave now',`River water is ${Math.max(1,Math.round(gap))} ft below this building and rising. Take the stairs, not the elevator, and head west to high ground.`];
 return ['Flood water is here',`Water has reached the building (about ${buildingDepthFt.toFixed(1)} ft at the entrance). Get out and go to the high-ground assembly point.`];
}

async function update(state,building,d){
 if(!state.sdk||!state.tag)return;
 const [label,description]=drillTagText(d.mode,d.thresholdFt,building.depthFt??0),text=label+'|'+description;if(text===state.text)return;state.text=text;
 try{if(state.sdk.Tag?.editBillboard)await state.sdk.Tag.editBillboard(state.tag,{label,description});else await state.sdk.Mattertag.editBillboard(state.tag,{label,description});}catch{}
}

async function groundFloor(state){
 const sdk=state.sdk,list=Object.values(state.sweeps||{}).filter(s=>s.enabled!==false&&s.floorInfo);if(!sdk||!list.length)return;
 const lowest=Math.min(...list.map(s=>s.floorInfo.sequence??0)),here=state.current?.position||{x:0,y:0,z:0};
 const target=list.filter(s=>(s.floorInfo.sequence??0)===lowest).sort((a,b)=>Math.hypot(a.position.x-here.x,a.position.z-here.z)-Math.hypot(b.position.x-here.x,b.position.z-here.z))[0];
 if(target)await sdk.Sweep.moveTo(target.uuid||target.id||target.sid,{transition:sdk.Sweep.Transition.FLY,transitionTime:1500}).catch(()=>{});
}
