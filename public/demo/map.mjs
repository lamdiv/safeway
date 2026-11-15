import * as maplibre from '/vendor/maplibre-gl.mjs';import {labels} from './common.mjs';import {WaterSurface,sceneTime,waterThreshold} from './water-surface.mjs';
const fc=features=>({type:'FeatureCollection',features}),empty=()=>fc([]);
const mercX=lng=>lng*20037508.34/180,mercY=lat=>Math.log(Math.tan((90+lat)*Math.PI/360))*6378137;
const unmerc=(x,y)=>[x*180/20037508.34,Math.atan(Math.exp(y/6378137))*360/Math.PI-90];
// Houston is flat, so terrain and water heights are exaggerated by the same factor (water stays level).
export const HOUSTON_EXAGGERATION=4;
const WATER_BLOCK=6;  // 6 x 5 m grid cells -> one 30 m water column
const WATER_BANDS=24;  // depth bands, each its own layer with a fixed filter
const DEPTH_COLORS=['#cfe9f6',1,'#a3d3ee',2,'#72b9e3',3,'#4799d3',4,'#2b79bf',5,'#1d58a2',6,'#123a78'];
/** Same water-level curve as the server (src/demo/raster-flood.mjs). */
function thresholdAt(r,time){const {start,step}=r.timeline,t=r.thresholdsFt;if(time<start)return Infinity;const u=(time-start)/step,k=Math.floor(u);if(k>=t.length-1)return t.at(-1);return t[k]+(t[k+1]-t[k])*(u-k);}
const WAVES='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/></svg>';

class FloodMapControl{
 constructor(toggle){this.toggle=toggle;}
 onAdd(){const el=document.createElement('div');el.className='maplibregl-ctrl maplibregl-ctrl-group flood-ctrl';const b=document.createElement('button');b.type='button';b.className='flood-map-button';b.title='Flood depth map';b.setAttribute('aria-label','Flood depth map');b.setAttribute('aria-pressed','false');b.innerHTML=WAVES;b.onclick=()=>this.toggle();el.append(b);this.el=el;this.button=b;return el;}
 onRemove(){}
}

const LAYERS_ICON='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 17.5 10 5 10-5"/></svg>';
// Aerial photos: USGS National Map imagery (public domain) in the US, Esri World Imagery elsewhere.
// Aerial base map: Vexcel ortho only, tiled by our server with the team's Vexcel key (src/demo/vexcel.mjs).
// Vexcel covers the Houston and Princeton drills; Rasuwa (Nepal) has no Vexcel imagery, so it keeps the street map.
const VEXCEL_ATTRIBUTION='Imagery © Vexcel Imaging US, Inc.';
const AERIAL={houston:{bounds:[-96.0,29.4,-94.8,30.3]},princeton:{bounds:[-74.80,40.25,-74.50,40.45]}};
const PREF_KEY='safeway-map-layers',DEFAULT_PREFS={base:'streets',water:true,zones:true,buildings:true,routes:true,vexcel:false};
// Which user switch controls which map layers.
const PREF_OF={'buildings-3d':'buildings','flood-zones':'zones','drill-zones':'zones','zone-fill':'zones','zone-edge':'zones','hazard-fill':'water','hazard-edge':'water','warning-zone':'water','route-shadow':'routes','route-line':'routes','vexcel-buildings':'vexcel'};
class LayersControl{
 constructor(map){this.rm=map;}
 onAdd(){
  const el=document.createElement('div');el.className='maplibregl-ctrl maplibregl-ctrl-group layers-ctrl';
  const b=document.createElement('button');b.type='button';b.className='layers-button';b.title='Map layers';b.setAttribute('aria-label','Map layers');b.setAttribute('aria-expanded','false');b.innerHTML=LAYERS_ICON;
  const panel=document.createElement('div');panel.className='layers-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','Map layers');
  panel.innerHTML='<div class="layers-title" data-base-title>Base map</div><div class="layers-base" role="radiogroup"><button type="button" data-base="streets" role="radio">Streets</button><button type="button" data-base="aerial" role="radio">Aerial</button></div><div class="layers-title">Show</div>'+[['water','Flood water'],['zones','Affected zones'],['buildings','3D buildings'],['routes','Evacuation routes'],['vexcel','Vexcel buildings']].map(([k,t])=>`<label><input type="checkbox" data-pref="${k}">${t}</label>`).join('')+'<p class="layers-note" data-note></p>';
  b.onclick=()=>{panel.hidden=!panel.hidden;b.setAttribute('aria-expanded',String(!panel.hidden));this.sync();};
  panel.addEventListener('click',e=>{const base=e.target.closest('[data-base]')?.dataset.base;if(base)this.rm.setPrefs({base});});
  panel.addEventListener('change',e=>{const k=e.target.dataset.pref;if(k)this.rm.setPrefs({[k]:e.target.checked});});
  el.append(b,panel);this.el=el;this.panel=panel;this.button=b;this.sync();return el;
 }
 sync(){if(!this.panel)return;const p=this.rm.prefs;for(const x of this.panel.querySelectorAll('[data-base]'))x.setAttribute('aria-checked',String(x.dataset.base===p.base));for(const x of this.panel.querySelectorAll('[data-pref]'))x.checked=!!p[x.dataset.pref];const s=this.rm.state?.scenario,houston=!!s?.id?.startsWith('houston'),rasuwa=s?.id==='rasuwa';this.panel.querySelector('[data-pref=vexcel]').closest('label').hidden=!houston;this.panel.querySelector('[data-base-title]').hidden=rasuwa;this.panel.querySelector('.layers-base').hidden=rasuwa;this.panel.querySelector('[data-note]').textContent=[p.base==='aerial'&&!rasuwa?VEXCEL_ATTRIBUTION:'',p.vexcel&&houston?'Building footprints and ground elevation © Vexcel Imaging US, Inc. Colour = flood depth at the building once the drill starts.':''].filter(Boolean).join(' · ');}
 onRemove(){}
}

// Everything the simulation draws. Hidden while the flood depth map is open.
const SCENE_LAYERS=['buildings-3d','vexcel-buildings','zone-fill','zone-edge','warning-zone','hazard-fill','hazard-edge','flood-zones','drill-zones','flow-line','flow-arrows','route-shadow','route-line'];
// Drawn only once the simulation has started.
const AFTER_START=['zone-fill','zone-edge','flood-zones','drill-zones','flow-line','flow-arrows'];

export class ResponseMap{
 constructor(container,{compact=false}={}){
  this.container=container;this.markers=new Map();this.destinations=new Map();this.compact=compact;this.view=compact?'street':'3d';this.moves=new Map();this.hidden=new Map();
  this.prefs={...DEFAULT_PREFS};if(!compact)try{Object.assign(this.prefs,JSON.parse(localStorage.getItem(PREF_KEY)||'{}'));}catch{}
  this.map=new maplibre.Map({container,style:'https://tiles.openfreemap.org/styles/liberty',center:[85.340,28.171],zoom:13.8,pitch:compact?0:57,bearing:compact?0:-18,canvasContextAttributes:{antialias:true},attributionControl:{compact:true}});
  this.map.addControl(new maplibre.NavigationControl({visualizePitch:true}),'top-right');
  this.floodControl=new FloodMapControl(()=>this.setFloodMap(!this.floodMode));this.map.addControl(this.floodControl,'top-right');if(!compact){this.layersControl=new LayersControl(this);this.map.addControl(this.layersControl,'top-right');}
  this.map.on('click',e=>{if(this.floodMode)this.depthPopup(e.lngLat);});
  this.map.on('click','vexcel-buildings',e=>{const p=e.features?.[0]?.properties;if(!p||this.floodMode)return;const ft=m=>(m*3.28084).toFixed(0)+' ft',zone={high:'Red · over 3 ft',medium:'Yellow · 1–3 ft',low:'Green · under 1 ft',dry:'Outside the flood'}[p.zone];
   const el=document.createElement('div');el.className='vexcel-popup';el.innerHTML=`<strong></strong><div>Flood at building: <b></b></div><div>Ground (Vexcel / USGS 3DEP): <span></span></div><div class="muted">If the floor sits at Vexcel's ground level: <span></span></div><div class="vexcel-views" role="group" aria-label="Viewing direction"></div><a class="vexcel-photo" target="_blank" rel="noopener"><img alt="Vexcel aerial photo of the building"></a><div class="muted vexcel-status">Bird's-eye photo · © Vexcel Imaging US, Inc.</div>`;
   const [t,b,g,pad]=el.querySelectorAll('strong,b,span');t.textContent=(p.type?String(p.type).replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()):'Building')+' · '+Math.round(p.areaM2||0)+' m²';b.textContent=(+p.gridDepthFt).toFixed(1)+' ft · '+zone;g.textContent=ft(p.vexcelGroundM)+' / '+ft(p.dep3GroundM);pad.textContent=p.padDepthFt!=null?(+p.padDepthFt).toFixed(1)+' ft':'dry';
   // Bird's-eye photos: angled aerial views from four sides (walls, doors, windows) plus straight down.
   const views=el.querySelector('.vexcel-views'),img=el.querySelector('img'),link=el.querySelector('.vexcel-photo'),status=el.querySelector('.vexcel-status'),{lng,lat}=e.lngLat;
   const show=v=>{const src=`/api/demo/vexcel-photo?lon=${lng.toFixed(6)}&lat=${lat.toFixed(6)}&view=${v}`;status.textContent='Loading Vexcel photo…';img.src=src+'&size=480';link.href=src+'&size=1024';for(const x of views.children)x.setAttribute('aria-pressed',String(x.dataset.view===v));};
   for(const [v,label] of [['north','Looking N'],['east','E'],['south','S'],['west','W'],['ortho','Top']]){const btn=document.createElement('button');btn.type='button';btn.dataset.view=v;btn.textContent=label;btn.onclick=()=>show(v);views.append(btn);}
   img.onload=()=>{status.textContent="Bird's-eye photo · © Vexcel Imaging US, Inc.";};img.onerror=()=>{status.textContent='No Vexcel photo for this view.';};show('north');
   new maplibre.Popup({maxWidth:'500px',className:'vexcel-popup-wrap'}).setLngLat(e.lngLat).setDOMContent(el).addTo(this.map);});
  this.map.on('mouseenter','vexcel-buildings',()=>{this.map.getCanvas().style.cursor='pointer';});this.map.on('mouseleave','vexcel-buildings',()=>{this.map.getCanvas().style.cursor='';});
  this.map.on('load',async()=>{try{
   const tiles=await fetch('/data/terrain-tiles.json').then(r=>r.json());
   this.map.addSource('valley-dem',{type:'raster-dem',tiles:tiles.tiles.map(t=>location.origin+t),tileSize:256,minzoom:12,maxzoom:12,encoding:'terrarium',bounds:tiles.bounds,attribution:'Elevation: Mapzen / SRTM'});
   this.map.addSource('houston-dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:'Elevation: AWS Terrain Tiles (USGS 3DEP)'});
   const label=this.label=this.map.getStyle().layers.find(l=>l.type==='symbol')?.id;
   for(const [k,a] of Object.entries(AERIAL)){this.map.addSource('aerial-'+k,{type:'raster',tiles:[location.origin+'/api/demo/vexcel-tile/{z}/{x}/{y}'],tileSize:512,minzoom:11,maxzoom:20,bounds:a.bounds,attribution:VEXCEL_ATTRIBUTION});this.map.addLayer({id:'aerial-'+k,type:'raster',source:'aerial-'+k,layout:{visibility:'none'},paint:{'raster-fade-duration':150}},label);}
   if(!compact)this.map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:13,paint:{'fill-extrusion-color':'#98a6a7','fill-extrusion-height':['max',5,['to-number',['get','render_height'],5]],'fill-extrusion-opacity':.86}},label);
   // Vexcel building footprints (scripts/vexcel-houston.py), coloured by the drill's depth at each building.
   this.map.addSource('vexcel',{type:'geojson',data:empty(),attribution:'Buildings © Vexcel Imaging US, Inc.'});
   if(!compact)this.map.addLayer({id:'vexcel-buildings',type:'fill-extrusion',source:'vexcel',minzoom:12,layout:{visibility:'none'},paint:{'fill-extrusion-color':['match',['get','zone'],'high','#d64541','medium','#f2c12e','low','#3fae5a','#b9c2c4'],'fill-extrusion-height':['coalesce',['get','heightM'],6],'fill-extrusion-opacity':.88}});
   for(const id of ['hazard','warning','routes','zones','arrows'])this.map.addSource(id,{type:'geojson',data:empty()});
   const zoneColor=['match',['get','zone'],'red','#df5149','yellow','#e6b544','#3ba684'];
   this.map.addLayer({id:'zone-fill',type:'fill',source:'zones',layout:{visibility:'none'},paint:{'fill-color':zoneColor,'fill-opacity':['match',['get','zone'],'high',.2,'medium',.15,.12]}},label);
   this.map.addLayer({id:'zone-edge',type:'line',source:'zones',layout:{visibility:'none'},paint:{'line-color':zoneColor,'line-width':1.2,'line-opacity':.75}},label);
   this.map.addLayer({id:'warning-zone',type:'line',source:'warning',paint:{'line-color':'#c4845b','line-width':1.5,'line-dasharray':[4,3],'line-opacity':.85}},label);
   this.map.addLayer({id:'hazard-fill',type:'fill',source:'hazard',paint:{'fill-color':'#47b9e4','fill-opacity':.48,'fill-antialias':true}},label);
   this.map.addLayer({id:'hazard-edge',type:'line',source:'hazard',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#77dcf4','line-width':2,'line-opacity':.95}},label);
   if(!compact)this.map.addSource('water3d',{type:'geojson',data:empty()});  // Princeton drill: depth-band water columns
   this.waterLayer=new WaterSurface();this.map.addLayer(this.waterLayer,label);  // smooth continuous water for Rasuwa and Houston
   for(const [id,source]of [['valley-relief','valley-dem'],['houston-relief','houston-dem']])this.map.addLayer({id,type:'hillshade',source,layout:{visibility:'none'},paint:{'hillshade-exaggeration':.65,'hillshade-shadow-color':'#5f6c63','hillshade-highlight-color':'#fff8df'}},label);
   this.map.addLayer({id:'flow-line',type:'line',source:'arrows',layout:{visibility:'none'},paint:{'line-color':'#0f5f8f','line-width':1.5,'line-opacity':.7,'line-dasharray':[2,2]}});
   this.map.addLayer({id:'flow-arrows',type:'symbol',source:'arrows',layout:{visibility:'none','symbol-placement':'line','symbol-spacing':90,'text-field':'›','text-font':['Noto Sans Bold'],'text-size':26,'text-keep-upright':false,'text-allow-overlap':true,'text-rotation-alignment':'map','text-offset':[0,-.12]},paint:{'text-color':'#0f5f8f','text-halo-color':'#ffffff','text-halo-width':1.5}});
   this.map.addLayer({id:'route-shadow',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#fff','line-width':6,'line-opacity':.85}});
   this.map.addLayer({id:'route-line',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#168a72','line-width':3}});
   this.loaded=true;document.getElementById(container).dataset.ready='true';if(this.state)this.update(this.state);this.setPrefs();
  }catch(e){document.getElementById(container).dataset.error=e.message;}});
 }

 /** Show or hide a layer. While the depth map is open, remember the wish and apply it on close. */
 /** Vexcel footprints for the current Houston drill (Princeton and Rasuwa have none). */
 loadVexcel(s){const key=s?.raster&&s.id.startsWith('houston')?s.raster.key:null;if(key===this.vexcelKey)return;this.vexcelKey=key;this.vexcelHas=false;this.map.getSource('vexcel')?.setData(empty());if(key)fetch(`/data/vexcel/houston-${key}.geojson`).then(r=>r.ok?r.json():null).then(d=>{if(d&&this.vexcelKey===key){this.map.getSource('vexcel')?.setData(d);this.vexcelHas=true;this.showVexcel();}}).catch(()=>{});}
 vexcelOn(){return !!(this.prefs.vexcel&&this.vexcelHas&&this.state?.mode&&this.state.mode!=='ready');}
 showVexcel(){if(!this.loaded||this.compact)return;const on=this.vexcelOn();this.setVisible('vexcel-buildings',on);this.setVisible('buildings-3d',this.view==='3d'&&!on);}
 setVisible(id,on){if(!this.map.getLayer(id))return;if(PREF_OF[id]&&!this.prefs[PREF_OF[id]])on=false;const v=on?'visible':'none';if(this.floodMode){this.hidden.set(id,v);return;}if(this.map.getLayoutProperty(id,'visibility')!==v)this.map.setLayoutProperty(id,'visibility',v);}

 /** Apply the Layers panel: base map and which overlays show. Saved in this browser. */
 setPrefs(change={}){
  Object.assign(this.prefs,change);try{localStorage.setItem(PREF_KEY,JSON.stringify(this.prefs));}catch{}
  if(this.loaded){
   const s=this.state?.scenario,us=s&&s.id!=='rasuwa',aerial=this.prefs.base==='aerial';
   for(const k of Object.keys(AERIAL))this.setVisible('aerial-'+k,aerial&&us);
   this.setVisible('buildings-3d',!this.compact&&this.view==='3d'&&!this.vexcelOn());for(const id of ['route-shadow','route-line'])this.setVisible(id,true);this.showVexcel();
   if(this.state)this.update(this.state);this.lastT=null;
  }
  this.layersControl?.sync();
 }

 /** Gridded flood (Houston): the affected-zones image and the 3D water built from the depth grid. */
 /** Princeton drill: static red/yellow/green zones image and depth-band water (unchanged design).
  *  Other gridded floods: the teammate's time-aware zone canvas and the smooth WaterSurface. */
 isBandDrill(r){return r?.terrain===false;}
 /** Princeton: hold the camera on the drill area (no zooming out to the region or into single pixels). Other scenarios are free. */
 limitView(s){if(this.compact)return;const m=this.map,b=s.id==='princeton'&&s.raster?.bounds;
  if(!b){m.setMaxBounds(null);m.setMinZoom(0);m.setMaxZoom(22);return;}
  const [[w,n],,[e,so]]=b,pad=.004;m.setMinZoom(13.6);m.setMaxZoom(18);m.once('moveend',()=>{if(this.scenario==='princeton')m.setMaxBounds([[w-pad,so-pad],[e+pad,n+pad]]);});}
 rasterLayers(r){
  if(this.isBandDrill(r)){
   const source=this.map.getSource('drill-zones');
   if(source)source.updateImage({url:r.url+'zones.png',coordinates:r.bounds});
   else{this.map.addSource('drill-zones',{type:'image',url:r.url+'zones.png',coordinates:r.bounds});this.map.addLayer({id:'drill-zones',type:'raster',source:'drill-zones',layout:{visibility:'none'},paint:{'raster-opacity':.2,'raster-resampling':'linear','raster-fade-duration':0}},this.label);}
   this.clearBands();  // water is the smooth WaterSurface for every gridded flood
   return this.zoneRaster(r);
  }
  this.clearBands();return this.zoneRaster(r);
 }
 clearBands(){this.waterToken=null;this.waterReady=null;for(const b of this.waterBandRanges||[])if(this.map.getLayer(b.id))this.map.setPaintProperty(b.id,'fill-extrusion-opacity',0),b.o=0;}
 /** Zone colors are separate from the continuous blue water surface. */
 async zoneRaster(r){
  const key=this.zoneKey=r.key,cells=new Uint16Array(await fetch(r.url+'depth.bin').then(x=>x.arrayBuffer()));if(this.zoneKey!==key)return;
  const [w,h]=r.size,W=Math.min(1024,w),H=Math.max(2,Math.round(W*h/w));this.zoneMeta=r;this.zoneT=null;this.zoneImage=null;
  this.zoneCanvas??=document.createElement('canvas');this.zoneCanvas.width=W;this.zoneCanvas.height=H;
  // Per-pixel final depth (bilinear between grid cells; -1 = never flooded) and an edge fade, computed once.
  const D=new Float32Array(W*H),F=new Float32Array(W*H),at=(x,y)=>{const v=cells[Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x))];return v?(v-1)/10:-1;},edge=.04;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const fx=(x+.5)/W*w-.5,fy=(y+.5)/H*h-.5,ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,a=at(ix,iy),b=at(ix+1,iy),c=at(ix,iy+1),d=at(ix+1,iy+1);
   const i=y*W+x;D[i]=Math.min(a,b,c,d)<0?Math.max(a,b,c,d)<0?-1:Math.max(a,b,c,d)*.5-.3:a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v;
   const ex=Math.min(x/W,1-x/W)/edge,ey=Math.min(y/H,1-y/H)/edge;F[i]=Math.min(1,ex)*Math.min(1,ey);}
  this.zoneDepth=D;this.zoneFade=F;
  if(this.map.getSource('flood-zones')){this.map.removeLayer('flood-zones');this.map.removeSource('flood-zones');}  // canvas size may change between scenarios
  this.map.addSource('flood-zones',{type:'canvas',canvas:this.zoneCanvas,coordinates:r.bounds,animate:true});this.map.addLayer({id:'flood-zones',type:'raster',source:'flood-zones',layout:{visibility:'none'},paint:{'raster-opacity':.75,'raster-resampling':'linear','raster-fade-duration':0}},this.label);
  this.paintZones();this.update(this.state);
 }
 /** Affected zones that follow the water. Each cell is coloured by the water standing on it NOW (current depth =
  *  final depth minus the falling threshold), so zones start in the channel and spread outwards: green (< 1 ft) turns
  *  yellow (1-3 ft) and then red (> 3 ft) as the water deepens. Dry or not-yet-reached ground stays clear, and the
  *  overlay fades at the edge of the depth grid, so there is no coloured rectangle. */
 paintZones(){if(!this.zoneCanvas||!this.zoneDepth||!this.state||this.zoneMeta.key!==this.state.scenario.raster?.key)return;
  const r=this.zoneMeta,c=this.zoneCanvas,ctx=c.getContext('2d'),st=this.state,started=st.mode&&st.mode!=='ready';
  const T=started?waterThreshold(r,sceneTime(st,this.clockAt)):Infinity;if(T===this.zoneT)return;this.zoneT=T;
  const img=this.zoneImage??=ctx.createImageData(c.width,c.height),px=img.data,D=this.zoneDepth,F=this.zoneFade,n=D.length;
  const ramp=(v,a,b)=>v<=a?0:v>=b?1:(v-a)/(b-a);
  for(let i=0,k=0;i<n;i++,k+=4){const d=D[i];if(d<0||T===Infinity){px[k+3]=0;continue;}const now=d-T;if(now<-.6){px[k+3]=0;continue;}
   let R,G,B;if(now<1){R=63;G=174;B=90;}else{const y=ramp(now,.85,1.15),rd=ramp(now,2.85,3.15);R=63+(242-63)*y+(214-242)*rd;G=174+(193-174)*y+(69-193)*rd;B=90+(46-90)*y+(65-46)*rd;}
   const a=now<0?ramp(now,-.6,0)*.4:now<1?.5:now<3?.5+.12*ramp(now,.85,1.15):(.62+.18*ramp(now,2.85,3.6))*(1-.6*ramp(now,6,14));/* stronger as it gets worse, so red reads as red over the water */px[k]=R;px[k+1]=G;px[k+2]=B;px[k+3]=a*F[i]*255;}
  ctx.putImageData(img,0,0);const source=this.map.getSource('flood-zones');if(st.mode==='running')source?.play();else source?.pause();this.map.triggerRepaint();
 }

 /** Turn the depth grid into 30 m water columns (each keeps the mean depth of its flooded cells), split into
  *  WATER_BANDS layers by depth. Every band has a fixed filter and gets plain-number height and colour each frame:
  *  a per-feature height formula would make MapLibre reload the whole source on every update. */
 async buildWater(r){
  const token=this.waterToken=r.key;this.waterReady=null;for(const id of this.waterBands||[])if(this.map.getLayer(id))this.map.removeLayer(id);this.waterBands=[];this.map.getSource('water3d')?.setData(empty());
  const cells=new Uint16Array(await fetch(r.url+'depth.bin').then(x=>x.arrayBuffer()));if(this.waterToken!==token)return;
  const [w,h]=r.size,B=WATER_BLOCK,X0=mercX(r.bounds[0][0]),Y1=mercY(r.bounds[0][1]),X1=mercX(r.bounds[2][0]),Y0=mercY(r.bounds[2][1]),dx=(X1-X0)/w,dy=(Y1-Y0)/h,features=[];let maxD=0;
  for(let by=0;by<h;by+=B)for(let bx=0;bx<w;bx+=B){
   let n=0,sum=0;for(let y=by;y<Math.min(h,by+B);y++)for(let x=bx;x<Math.min(w,bx+B);x++){const v=cells[y*w+x];if(v){n++;sum+=v-1;}}
   if(n*2<B*B)continue;
   const d=Math.round(sum/n)/10,xa=X0+bx*dx,xb=X0+Math.min(w,bx+B)*dx,ya=Y1-by*dy,yb=Y1-Math.min(h,by+B)*dy;maxD=Math.max(maxD,d);
   features.push({type:'Feature',properties:{d},geometry:{type:'Polygon',coordinates:[[unmerc(xa,ya),unmerc(xb,ya),unmerc(xb,yb),unmerc(xa,yb),unmerc(xa,ya)]]}});
  }
  this.map.getSource('water3d')?.setData(fc(features));
  const edges=Array.from({length:WATER_BANDS+1},(_,i)=>maxD*i/WATER_BANDS);edges[WATER_BANDS]=Infinity;
  this.waterBandRanges=edges.slice(0,-1).map((lo,i)=>({id:'water-band-'+i,lo,hi:edges[i+1],mid:Math.min(maxD,(lo+Math.min(maxD,edges[i+1]))/2)}));
  for(const b of this.waterBandRanges){this.map.addLayer({id:b.id,type:'fill-extrusion',source:'water3d',filter:['all',['>=',['get','d'],b.lo],['<',['get','d'],b.hi]],paint:{'fill-extrusion-color':'#4799d3','fill-extrusion-height':0,'fill-extrusion-base':0,'fill-extrusion-opacity':0,'fill-extrusion-vertical-gradient':false}},this.label);this.waterBands.push(b.id);}
  this.waterReady=r.key;this.lastT=null;
 }

 /** Smooth flood animation: estimate the simulation clock between server updates and set each band's water height. */
 animate(){
  if(this.animating)return;this.animating=true;
  const colour=depth=>{let c=DEPTH_COLORS[0];for(let i=1;i<DEPTH_COLORS.length;i+=2)if(depth>=DEPTH_COLORS[i])c=DEPTH_COLORS[i+1];return c;};
  const frame=()=>{
   {const now=performance.now();if(this.state?.scenario?.raster&&this.state.mode==='running'&&now-(this.zonePaintAt||0)>120){this.zonePaintAt=now;this.paintZones();}}
   {const now=performance.now();for(const [id,move]of this.moves){const marker=this.markers.get(id);if(!marker){this.moves.delete(id);continue;}const t=Math.min(1,(now-move.at)/250),e=t*t*(3-2*t);marker.setLngLat(move.from.map((v,i)=>v+(move.to[i]-v)*e));if(t===1)this.moves.delete(id);}}
   const st=this.state,s=st?.scenario,r=s?.raster,live=r&&this.isBandDrill(r)&&!this.compact&&this.loaded&&st.mode!=='ready'&&this.waterReady===r.key;
   let T=Infinity;
   if(live){const now=performance.now(),est=Math.min(s.duration,st.elapsed+(st.mode==='running'?(now-this.clockAt)/1000:0));this.estElapsed=Math.max(this.estElapsed??0,est);T=thresholdAt(r,this.estElapsed);}
   if(T!==this.lastT){
    const k=.3048*(r?.exaggeration??HOUSTON_EXAGGERATION);
    for(const b of this.waterBandRanges||[]){
     // Visibility changes make MapLibre rebuild every tile of the source; opacity is a plain paint value and does not.
     const on=live&&this.prefs.water&&T!==Infinity&&b.hi>T,depth=Math.max(0,b.mid-T),op=on?.84:0;if(!this.map.getLayer(b.id))continue;if(b.o!==op){this.map.setPaintProperty(b.id,'fill-extrusion-opacity',op);b.o=op;}
     if(on){const hgt=+Math.min(depth*k,r.maxHeightM??Infinity).toFixed(2);if(b.h!==hgt){this.map.setPaintProperty(b.id,'fill-extrusion-height',hgt);b.h=hgt;}const c=colour(depth);if(b.c!==c){this.map.setPaintProperty(b.id,'fill-extrusion-color',c);b.c=c;}}
    }
    this.lastT=T;
   }
   requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
 }

 setView(view){if(!['street','terrain','3d'].includes(view))return;this.view=view;if(!this.loaded)return;this.applyTerrain(this.state?.scenario);this.setVisible('buildings-3d',view==='3d'&&!this.compact&&this.prefs.buildings&&!this.vexcelOn());this.setVisible('valley-relief',view==='terrain'&&this.scenario==='rasuwa');this.setVisible('houston-relief',view==='terrain'&&!!this.scenario&&this.scenario!=='rasuwa');this.map.easeTo({pitch:view==='street'?0:58,bearing:view==='street'?0:-18,duration:650});this.waterLayer?.refresh();document.getElementById(this.container).dataset.view=view;}

 applyTerrain(s){
  if(this.compact||this.view==='street'||this.floodMode||!s){this.map.setTerrain(null);return;}
  this.map.setTerrain(s.id==='rasuwa'?{source:'valley-dem',exaggeration:1}:s.raster?(s.raster.terrain===false?null:{source:'houston-dem',exaggeration:s.raster.exaggeration??HOUSTON_EXAGGERATION}):s.terrain?{source:'houston-dem',exaggeration:s.terrain.exaggeration}:null);
 }

 update(state,{people=state.people||[],routes=true}={}){
  const prev=this.state;this.state=state;this.clockAt=performance.now();if(!prev||state.elapsed<prev.elapsed-.5||state.mode==='ready'||prev.scenario?.id!==state.scenario?.id){this.estElapsed=state.elapsed;this.lastT=null;}
  if(!this.loaded)return;this.animate();this.waterLayer?.setState(state,this.clockAt);const s=state.scenario,started=state.mode&&state.mode!=='ready';if(this.waterLayer)this.waterLayer.enabled=!this.floodMode&&this.prefs.water;
  if(this.scenario!==s.id){
   this.scenario=s.id;this.applyTerrain(s);this.limitView(s);this.waterLayer.setScenario(s).catch(error=>{document.getElementById(this.container).dataset.waterError=error.message;});
   if(!this.floodMode)this.map.flyTo({center:s.center,zoom:this.compact?s.zoom+.4:s.zoom,pitch:this.compact||this.view==='street'?0:s.pitch,bearing:this.compact?0:s.bearing,duration:600});
   for(const m of this.destinations.values())m.remove();this.destinations.clear();
   const z=state.zones||{},features=[];for(const f of z.medium?.features||[]){const hole=z.high?.features[0]?.geometry.coordinates[0];features.push({...f,properties:{zone:'yellow'},geometry:{type:'Polygon',coordinates:[f.geometry.coordinates[0],...(hole?[[...hole].reverse()]:[])]}});}features.push(...(z.high?.features||[]).map(f=>({...f,properties:{zone:'red'}})));for(const p of people.filter(p=>p.zone==='green')){const ring=Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return [p.start[0]+Math.cos(a)*150/(111195*Math.cos(p.start[1]*Math.PI/180)),p.start[1]+Math.sin(a)*150/111195];});features.push({type:'Feature',properties:{zone:'green'},geometry:{type:'Polygon',coordinates:[ring]}});}this.map.getSource('zones').setData(fc(features));
   this.map.getSource('arrows').setData(s.arrows||empty());
   if(s.raster)this.rasterLayers(s.raster).catch(()=>{});else this.clearBands();
   if(this.prefs.base==='aerial')queueMicrotask(()=>this.setPrefs());
   this.loadVexcel(s);
   this.layersControl?.sync();
   if(this.floodControl.el)this.floodControl.el.hidden=!s.id.startsWith('houston');
   if(this.floodMode&&!s.id.startsWith('houston'))this.setFloodMap(false);
  }
  this.showVexcel(started);
  for(const id of AFTER_START)this.setVisible(id,started&&(id==='flood-zones'?!!s.raster:id==='drill-zones'?false:!s.raster));
  this.map.getSource('hazard').setData(empty());this.map.getSource('warning').setData(s.raster?empty():state.warning||empty());
  if(s.raster)this.paintZones();const paths=[],activeDestinations=new Set();
  for(const p of people){
   if(routes&&p.guidance?.action==='evacuate'&&p.route?.length>1)paths.push({type:'Feature',geometry:{type:'LineString',coordinates:p.route},properties:{}});
   let marker=this.markers.get(p.id);
   if(!marker){const el=document.createElement('div');el.className='person-marker';el.title=p.name;const i=document.createElement('span');i.textContent=p.initials||p.name.split(' ').map(n=>n[0]).join('');const tag=document.createElement('span');tag.className='person-tag';el.append(i,tag);marker=new maplibre.Marker({element:el,subpixelPositioning:true}).setLngLat(p.position).addTo(this.map);this.markers.set(p.id,marker);}
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
  this.floodMode=on;if(this.waterLayer)this.waterLayer.enabled=!on&&this.prefs.water;this.depthEvent=event;this.floodControl.button?.setAttribute('aria-pressed',String(on));document.getElementById(this.container).classList.toggle('flood-map-mode',on);this.popup?.remove();
  if(on){
   for(const id of [...SCENE_LAYERS,...(this.waterBands||[])])if(this.map.getLayer(id)&&!this.hidden.has(id)){this.hidden.set(id,this.map.getLayoutProperty(id,'visibility')||'visible');this.map.setLayoutProperty(id,'visibility','none');}
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
