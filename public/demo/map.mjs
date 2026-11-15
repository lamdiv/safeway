import {WaterSurface,sceneTime,waterThreshold} from './water-surface.mjs';
import * as maplibre from '/vendor/maplibre-gl.mjs';import {labels} from './common.mjs';
const fc=features=>({type:'FeatureCollection',features}),empty=()=>fc([]);
const mercX=lng=>lng*20037508.34/180,mercY=lat=>Math.log(Math.tan((90+lat)*Math.PI/360))*6378137;
const unmerc=(x,y)=>[x*180/20037508.34,Math.atan(Math.exp(y/6378137))*360/Math.PI-90];
// Houston is flat, so terrain and water heights are exaggerated by the same factor (water stays level).
export const HOUSTON_EXAGGERATION=4;
const WATER_BLOCK=6;  // 6 x 5 m grid cells -> one 30 m water column
const DEPTH_COLORS=['#cfe9f6',1,'#a3d3ee',2,'#72b9e3',3,'#4799d3',4,'#2b79bf',5,'#1d58a2',6,'#123a78'];
/** Same water-level curve as the server (src/demo/raster-flood.mjs). */
function thresholdAt(r,time){const {start,step}=r.timeline,t=r.thresholdsFt;if(time<start)return Infinity;const u=(time-start)/step,k=Math.floor(u);if(k>=t.length-1)return t.at(-1);return t[k]+(t[k+1]-t[k])*(u-k);}
const WAVES='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/></svg>';

class FloodMapControl{
 constructor(toggle){this.toggle=toggle;}
 onAdd(){const el=document.createElement('div');el.className='maplibregl-ctrl maplibregl-ctrl-group flood-ctrl';const b=document.createElement('button');b.type='button';b.className='flood-map-button';b.title='Flood depth map';b.setAttribute('aria-label','Flood depth map');b.setAttribute('aria-pressed','false');b.innerHTML=WAVES;b.onclick=()=>this.toggle();el.append(b);this.el=el;this.button=b;return el;}
 onRemove(){}
}

// Everything the simulation draws. Hidden while the flood depth map is open.
const SCENE_LAYERS=['buildings-3d','zone-fill','zone-edge','warning-zone','hazard-fill','hazard-edge','flood-zones','water-3d','flow-line','flow-arrows','route-shadow','route-line'];
// Drawn only once the simulation has started.
const AFTER_START=['zone-fill','zone-edge','flood-zones','flow-line','flow-arrows'];

export class ResponseMap{
 constructor(container,{compact=false}={}){
  this.container=container;this.markers=new Map();this.destinations=new Map();this.compact=compact;this.view=compact?'street':'3d';this.moves=new Map();this.hidden=new Map();
  this.map=new maplibre.Map({container,style:'https://tiles.openfreemap.org/styles/liberty',center:[85.340,28.171],zoom:13.8,pitch:compact?0:57,bearing:compact?0:-18,canvasContextAttributes:{antialias:true},attributionControl:{compact:true}});
  this.map.addControl(new maplibre.NavigationControl({visualizePitch:true}),'top-right');
  this.floodControl=new FloodMapControl(()=>this.setFloodMap(!this.floodMode));this.map.addControl(this.floodControl,'top-right');
  this.map.on('click',e=>{if(this.floodMode)this.depthPopup(e.lngLat);});
  this.map.on('load',async()=>{try{
   const tiles=await fetch('/data/terrain-tiles.json').then(r=>r.json());
   this.map.addSource('valley-dem',{type:'raster-dem',tiles:tiles.tiles.map(t=>location.origin+t),tileSize:256,minzoom:12,maxzoom:12,encoding:'terrarium',bounds:tiles.bounds,attribution:'Elevation: Mapzen / SRTM'});
   this.map.addSource('houston-dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:'Elevation: AWS Terrain Tiles (USGS 3DEP)'});
   const label=this.label=this.map.getStyle().layers.find(l=>l.type==='symbol')?.id;
   if(!compact)this.map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:13,paint:{'fill-extrusion-color':'#98a6a7','fill-extrusion-height':['max',5,['to-number',['get','render_height'],5]],'fill-extrusion-opacity':.86}},label);
   for(const id of ['hazard','warning','routes','zones','arrows'])this.map.addSource(id,{type:'geojson',data:empty()});
   const zoneColor=['match',['get','zone'],'red','#df5149','yellow','#e6b544','#3ba684'];
   this.map.addLayer({id:'zone-fill',type:'fill',source:'zones',layout:{visibility:'none'},paint:{'fill-color':zoneColor,'fill-opacity':['match',['get','zone'],'high',.2,'medium',.15,.12]}},label);
   this.map.addLayer({id:'zone-edge',type:'line',source:'zones',layout:{visibility:'none'},paint:{'line-color':zoneColor,'line-width':1.2,'line-opacity':.75}},label);
   this.map.addLayer({id:'warning-zone',type:'line',source:'warning',paint:{'line-color':'#c4845b','line-width':1.5,'line-dasharray':[4,3],'line-opacity':.85}},label);
   this.map.addLayer({id:'hazard-fill',type:'fill',source:'hazard',paint:{'fill-color':'#47b9e4','fill-opacity':.48,'fill-antialias':true}},label);
   this.map.addLayer({id:'hazard-edge',type:'line',source:'hazard',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#77dcf4','line-width':2,'line-opacity':.95}},label);
   this.waterLayer=new WaterSurface();this.map.addLayer(this.waterLayer,label);
   for(const [id,source]of [['valley-relief','valley-dem'],['houston-relief','houston-dem']])this.map.addLayer({id,type:'hillshade',source,layout:{visibility:'none'},paint:{'hillshade-exaggeration':.65,'hillshade-shadow-color':'#5f6c63','hillshade-highlight-color':'#fff8df'}},label);
   this.map.addLayer({id:'flow-line',type:'line',source:'arrows',layout:{visibility:'none'},paint:{'line-color':'#0f5f8f','line-width':1.5,'line-opacity':.7,'line-dasharray':[2,2]}});
   this.map.addLayer({id:'flow-arrows',type:'symbol',source:'arrows',layout:{visibility:'none','symbol-placement':'line','symbol-spacing':90,'text-field':'›','text-font':['Noto Sans Bold'],'text-size':26,'text-keep-upright':false,'text-allow-overlap':true,'text-rotation-alignment':'map','text-offset':[0,-.12]},paint:{'text-color':'#0f5f8f','text-halo-color':'#ffffff','text-halo-width':1.5}});
   this.map.addLayer({id:'route-shadow',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#fff','line-width':6,'line-opacity':.85}});
   this.map.addLayer({id:'route-line',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#168a72','line-width':3}});
   this.loaded=true;document.getElementById(container).dataset.ready='true';if(this.state)this.update(this.state);
  }catch(e){document.getElementById(container).dataset.error=e.message;}});
 }

 /** Show or hide a layer. While the depth map is open, remember the wish and apply it on close. */
 setVisible(id,on){if(!this.map.getLayer(id))return;const v=on?'visible':'none';if(this.floodMode){this.hidden.set(id,v);return;}if(this.map.getLayoutProperty(id,'visibility')!==v)this.map.setLayoutProperty(id,'visibility',v);}

 /** Zone colors are separate from the continuous blue water surface. */
 async rasterLayers(r){
  const key=this.zoneKey=r.key,cells=new Uint8Array(await fetch(r.url+'depth.bin').then(x=>x.arrayBuffer()));if(this.zoneKey!==key)return;
  this.zoneCells=cells;this.zoneMeta=r;this.zoneCanvas??=document.createElement('canvas');this.zoneCanvas.width=256;this.zoneCanvas.height=Math.max(2,Math.round(256*r.size[1]/r.size[0]));
  if(this.map.getSource('flood-zones'))this.map.getSource('flood-zones').setCoordinates(r.bounds);
  else{this.map.addSource('flood-zones',{type:'canvas',canvas:this.zoneCanvas,coordinates:r.bounds,animate:true});this.map.addLayer({id:'flood-zones',type:'raster',source:'flood-zones',layout:{visibility:'none'},paint:{'raster-opacity':.22,'raster-resampling':'linear','raster-fade-duration':0}},this.label);}
  this.paintZones();
 }
 paintZones(){if(!this.zoneCanvas||!this.zoneCells||!this.state||this.zoneMeta.key!==this.state.scenario.raster?.key)return;const r=this.zoneMeta,[w,h]=r.size,c=this.zoneCanvas,context=c.getContext('2d'),image=context.createImageData(c.width,c.height),threshold=waterThreshold(r,(this.state.modelTime??this.state.elapsed)+(this.state.speed||1)*18);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const value=this.zoneCells[Math.min(h-1,Math.floor(y/c.height*h))*w+Math.min(w-1,Math.floor(x/c.width*w))],depth=value?(value-1)/10:null,color=depth===null?[59,166,132]:depth>3||depth>=threshold?[223,81,73]:[230,181,68],i=(y*c.width+x)*4;image.data.set([...color,190],i);}
  context.putImageData(image,0,0);const source=this.map.getSource('flood-zones');if(this.state.mode==='running')source?.play();else source?.pause();this.map.triggerRepaint();
 }
 animate(){if(this.animating)return;this.animating=true;const frame=()=>{const now=performance.now();for(const [id,move]of this.moves){const marker=this.markers.get(id);if(!marker){this.moves.delete(id);continue;}const t=Math.min(1,(now-move.at)/250),e=t*t*(3-2*t);marker.setLngLat(move.from.map((v,i)=>v+(move.to[i]-v)*e));if(t===1)this.moves.delete(id);}requestAnimationFrame(frame);};requestAnimationFrame(frame);}
 setView(view){if(!['street','terrain','3d'].includes(view))return;this.view=view;if(!this.loaded)return;this.applyTerrain(this.state?.scenario);this.setVisible('buildings-3d',view==='3d'&&!this.compact);this.setVisible('valley-relief',view==='terrain'&&this.scenario==='rasuwa');this.setVisible('houston-relief',view==='terrain'&&this.scenario?.startsWith('houston'));this.map.easeTo({pitch:view==='street'?0:58,bearing:view==='street'?0:-18,duration:650});this.waterLayer?.refresh();document.getElementById(this.container).dataset.view=view;}

 applyTerrain(s){
  if(this.compact||this.view==='street'||this.floodMode||!s){this.map.setTerrain(null);return;}
  this.map.setTerrain(s.id==='rasuwa'?{source:'valley-dem',exaggeration:1}:s.raster?{source:'houston-dem',exaggeration:HOUSTON_EXAGGERATION}:null);
 }

 update(state,{people=state.people||[],routes=true}={}){
  const prev=this.state;this.state=state;this.clockAt=performance.now();if(!prev||state.elapsed<prev.elapsed-.5||state.mode==='ready'||prev.scenario?.id!==state.scenario?.id){this.estElapsed=state.elapsed;this.lastT=null;this.filterT=undefined;}
  if(!this.loaded)return;this.animate();this.waterLayer?.setState(state,this.clockAt);if(this.waterLayer)this.waterLayer.enabled=!this.floodMode;const s=state.scenario,started=state.mode&&state.mode!=='ready';
  if(this.scenario!==s.id){
   this.scenario=s.id;this.applyTerrain(s);this.waterLayer.setScenario(s).catch(error=>{document.getElementById(this.container).dataset.waterError=error.message;});
   if(!this.floodMode)this.map.flyTo({center:s.center,zoom:this.compact?s.zoom+.4:s.zoom,pitch:this.compact||this.view==='street'?0:s.pitch,bearing:this.compact?0:s.bearing,duration:600});
   for(const m of this.destinations.values())m.remove();this.destinations.clear();
   const z=state.zones||{},features=[];for(const f of z.medium?.features||[]){const hole=z.high?.features[0]?.geometry.coordinates[0];features.push({...f,properties:{zone:'yellow'},geometry:{type:'Polygon',coordinates:[f.geometry.coordinates[0],...(hole?[[...hole].reverse()]:[])]}});}features.push(...(z.high?.features||[]).map(f=>({...f,properties:{zone:'red'}})));for(const p of people.filter(p=>p.zone==='green')){const ring=Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return [p.start[0]+Math.cos(a)*150/(111195*Math.cos(p.start[1]*Math.PI/180)),p.start[1]+Math.sin(a)*150/111195];});features.push({type:'Feature',properties:{zone:'green'},geometry:{type:'Polygon',coordinates:[ring]}});}this.map.getSource('zones').setData(fc(features));
   this.map.getSource('arrows').setData(s.arrows||empty());
   if(s.raster)this.rasterLayers(s.raster).catch(()=>{});
   if(this.floodControl.el)this.floodControl.el.hidden=!s.id.startsWith('houston');
   if(this.floodMode&&!s.id.startsWith('houston'))this.setFloodMap(false);
  }
  for(const id of AFTER_START)this.setVisible(id,started&&(id.startsWith('flood')?!!s.raster:!s.raster));
  this.map.getSource('hazard').setData(empty());this.map.getSource('warning').setData(s.raster?empty():state.warning||empty());
  if(s.raster)this.paintZones();const paths=[],activeDestinations=new Set();
  for(const p of people){
   if(routes&&p.guidance?.action==='evacuate'&&p.route?.length>1)paths.push({type:'Feature',geometry:{type:'LineString',coordinates:p.route},properties:{}});
   let marker=this.markers.get(p.id);
   if(!marker){const el=document.createElement('div');el.className='person-marker';el.title=p.name;const i=document.createElement('span');i.textContent=p.name.split(' ').map(n=>n[0]).join('');const tag=document.createElement('span');tag.className='person-tag';el.append(i,tag);marker=new maplibre.Marker({element:el,subpixelPositioning:true}).setLngLat(p.position).addTo(this.map);this.markers.set(p.id,marker);}
   const current=marker.getLngLat().toArray();if(Math.hypot(current[0]-p.position[0],current[1]-p.position[1])>1e-9)this.moves.set(p.id,{from:current,to:p.position,at:performance.now()});const el=marker.getElement();el.className='person-marker'+(p.atRisk?' risk':'')+(p.acknowledged||p.arrived?' moving':'')+(started&&!this.compact?' tagged':'')+' zone-'+p.zone;
   const tag=el.querySelector('.person-tag');if(tag)tag.textContent=labels[p.status]||'';
   if(p.destination&&p.guidance?.action==='evacuate')activeDestinations.add(p.destination.name);if(p.destination&&p.guidance?.action==='evacuate'&&!this.destinations.has(p.destination.name)){const el=document.createElement('div');el.className='destination-marker';el.textContent='⚑ '+p.destination.name;this.destinations.set(p.destination.name,new maplibre.Marker({element:el}).setLngLat(p.destination.coordinates).addTo(this.map));}
  }
  for(const [id,m] of this.markers)if(!people.some(p=>p.id===id)){m.remove();this.markers.delete(id);}
  for(const [name,marker]of this.destinations)if(!activeDestinations.has(name)){marker.remove();this.destinations.delete(name);}this.map.getSource('routes').setData(fc(paths));
 }

 /** County-wide flood depth tiles (Harris County, levels 1-7), built by scripts/houston-county-flood.py. */
 async countyMeta(){this.countyInfo??=fetch('/data/county-flood/meta.json').then(r=>{if(!r.ok)throw new Error('County flood map unavailable');return r.json();});return this.countyInfo;}

 async setFloodMap(on,event=this.depthEvent||'100'){
  if(!this.loaded)return;if(on&&!this.state?.scenario?.id?.startsWith('houston'))return;
  this.floodMode=on;if(this.waterLayer)this.waterLayer.enabled=!on;this.depthEvent=event;this.floodControl.button?.setAttribute('aria-pressed',String(on));document.getElementById(this.container).classList.toggle('flood-map-mode',on);this.popup?.remove();
  if(on){
   for(const id of SCENE_LAYERS)if(this.map.getLayer(id)&&!this.hidden.has(id)){this.hidden.set(id,this.map.getLayoutProperty(id,'visibility')||'visible');this.map.setLayoutProperty(id,'visibility','none');}
   const meta=await this.countyMeta();
   for(const e of Object.keys(meta.events)){
    const id='county-'+e;
    if(!this.map.getSource(id)){this.map.addSource(id,{type:'raster',tiles:[`${location.origin}/data/county-flood/${e}/{z}/{x}/{y}.png`],tileSize:meta.tile,minzoom:meta.minzoom,maxzoom:meta.maxzoom,bounds:meta.bounds,attribution:'Flood zones: FEMA NFHL · Elevation: USGS 3DEP'});this.map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':.86,'raster-resampling':'linear','raster-fade-duration':150}},this.label);}
    this.map.setLayoutProperty(id,'visibility',e===event?'visible':'none');
   }
   this.map.setTerrain(null);
   if(!this.countyFitted){this.countyFitted=true;const [w,s,e,n]=meta.bounds,wide=document.getElementById(this.container).clientWidth>640;this.map.fitBounds([[w,s],[e,n]],{padding:wide?{top:30,bottom:30,left:320,right:50}:{top:290,bottom:20,left:12,right:12},pitch:0,bearing:0,duration:800});}
   else this.map.easeTo({pitch:0,bearing:0,duration:500});
  }else{
   this.countyFitted=false;
   for(const id of ['county-100','county-500'])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility','none');
   for(const [id,v] of this.hidden)this.map.setLayoutProperty(id,'visibility',v);this.hidden=new Map();
   const st=this.state?.scenario;if(st){this.applyTerrain(st);this.map.flyTo({center:st.center,zoom:this.compact?st.zoom+.4:st.zoom,pitch:this.compact?0:st.pitch,bearing:this.compact?0:st.bearing,duration:700});}
  }
  this.onFloodMap?.(on,event,on?await this.countyMeta():null);
 }

 /** Depth at a point, read from the zoom-13 data tile (0 dry, else 1 + tenths of a foot). */
 async depthAt(lngLat,event=this.depthEvent||'100'){
  const meta=await this.countyMeta(),[w,s,e,n]=meta.bounds;if(lngLat.lng<w||lngLat.lng>e||lngLat.lat<s||lngLat.lat>n)return {inArea:false};
  const scale=2**meta.maxzoom*meta.tile,px=(mercX(lngLat.lng)+20037508.342789244)/(2*20037508.342789244)*scale,py=(20037508.342789244-mercY(lngLat.lat))/(2*20037508.342789244)*scale;
  const tx=Math.floor(px/meta.tile),ty=Math.floor(py/meta.tile),key=`${event}/${tx}/${ty}`;
  this.dataTiles??=new Map();
  if(!this.dataTiles.has(key)){if(this.dataTiles.size>40)this.dataTiles.delete(this.dataTiles.keys().next().value);this.dataTiles.set(key,new Promise(yes=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=meta.tile;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);yes(g.getImageData(0,0,meta.tile,meta.tile).data);};img.onerror=()=>yes(null);img.src=`/data/county-flood/${event}-data/${meta.maxzoom}/${tx}/${ty}.png`;}));}
  const px4=await this.dataTiles.get(key);if(!px4)return {inArea:true,flooded:false};
  const v=px4[((Math.floor(py)-ty*meta.tile)*meta.tile+(Math.floor(px)-tx*meta.tile))*4];if(!v)return {inArea:true,flooded:false};
  const ft=(v-1)/10;return {inArea:true,flooded:true,depthFt:ft,level:meta.levels.find(l=>ft>=l.minFt&&(l.maxFt==null||ft<l.maxFt))?.level||7,capped:v>=254};
 }

 async depthPopup(lngLat){
  const r=await this.depthAt(lngLat).catch(()=>null),name=this.depthEvent==='500'?'a 500-year flood':'a 100-year flood',el=document.createElement('div');el.className='depth-popup';
  const t=document.createElement('strong'),d=document.createElement('small');
  if(!r||!r.inArea){t.textContent='Outside Harris County';d.textContent='The depth map covers Harris County.';}
  else if(!r.flooded){t.textContent='Not in the mapped floodplain';d.textContent='Outside the FEMA flood area for '+name+'.';}
  else{t.textContent='Depth level '+r.level;d.textContent=(r.capped?'More than 25 ft':'About '+r.depthFt.toFixed(1)+' ft')+' of water in '+name+' (estimated).';}
  el.append(t,d);this.popup?.remove();this.popup=new maplibre.Popup({offset:6,maxWidth:'240px'}).setLngLat(lngLat).setDOMContent(el).addTo(this.map);
 }

 locate(coordinates){this.map.flyTo({center:coordinates,zoom:16,pitch:0,duration:700});}
 gps(id,coordinates){const key='gps-'+id;let m=this.markers.get(key);if(!m){const el=document.createElement('div');el.className='person-marker moving';el.textContent='GPS';m=new maplibre.Marker({element:el}).setLngLat(coordinates).addTo(this.map);this.markers.set(key,m);}m.setLngLat(coordinates);}
}
