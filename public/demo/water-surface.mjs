import * as maplibre from '/vendor/maplibre-gl.mjs';
const mercY=lat=>Math.log(Math.tan((90+lat)*Math.PI/360))*6378137;
const inverseY=y=>Math.atan(Math.exp(y/6378137))*360/Math.PI-90;
export function sceneTime(state,receivedAt,now=performance.now()){
 return Math.min(state.scenario.duration,(state.modelTime??state.elapsed)+(state.mode==='running'?Math.min(.75,Math.max(0,(now-receivedAt)/1000))*(state.speed||1):0));
}
export function waterThreshold(r,time){const {start,step}=r.timeline,a=r.thresholdsFt;if(time<start)return a[0]+1;const u=(time-start)/step,i=Math.floor(u);return i>=a.length-1?a.at(-1):a[i]+(a[i+1]-a[i])*(u-i);}
const vertex=`#version 300 es
precision highp float;
in vec3 a_position;in vec3 a_data;
uniform mat4 u_matrix;uniform float u_meter,u_threshold,u_kind,u_progress,u_exaggeration;
out vec3 v_data;
void main(){v_data=a_data;float height=u_kind<.5?max(0.,a_data.x-u_threshold)*.3048:1.4;gl_Position=u_matrix*vec4(a_position.xy,a_position.z+(height*u_exaggeration+1.8)*u_meter,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec3 v_data;uniform float u_threshold,u_kind,u_progress,u_time;
out vec4 color;
void main(){float wet,depth;
 if(u_kind<.5){depth=v_data.x-u_threshold;wet=smoothstep(-.12,.55,depth)*step(0.,v_data.x);}
 else{depth=2.;float width=(28.+52.*u_progress)/80.;wet=(1.-smoothstep(width-.04,width,abs(v_data.y)))*(1.-smoothstep(u_progress-.008,u_progress+.003,v_data.z));}
 if(u_kind<.5)wet*=smoothstep(0.,.05,v_data.y)*smoothstep(1.,.95,v_data.y)*smoothstep(0.,.05,v_data.z)*smoothstep(1.,.95,v_data.z);  // fade out at the edge of the depth grid: no hard rectangle
 if(wet<.015)discard;
 float waves=sin(v_data.y*190.+v_data.z*235.-u_time*3.2)+.5*sin(v_data.y*337.-v_data.z*170.+u_time*2.1);
 vec3 shallow=vec3(.16,.62,.76),deep=vec3(.06,.33,.56);vec3 base=mix(shallow,deep,clamp(depth/7.,0.,1.));
 base+=vec3(.06,.11,.12)*pow(max(0.,waves*.65),5.);float alpha=wet*(u_kind<.5?mix(.34,.8,clamp(depth/4.,0.,1.)):.72);color=vec4(base*alpha,alpha);}`;
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
export class WaterSurface{
 constructor(){this.id='smooth-water';this.type='custom';this.renderingMode='3d';this.enabled=true;this.vertices=[];this.frames=0;}
 onAdd(map,gl){this.map=map;this.gl=gl;this.program=gl.createProgram();const vs=shader(gl,gl.VERTEX_SHADER,vertex),fs=shader(gl,gl.FRAGMENT_SHADER,fragment);gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));gl.deleteShader(vs);gl.deleteShader(fs);this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();this.indexBuffer=gl.createBuffer();this.uniforms=Object.fromEntries(['matrix','meter','threshold','kind','progress','exaggeration','time'].map(k=>[k,gl.getUniformLocation(this.program,'u_'+k)]));this.refresh=()=>{clearTimeout(this.terrainTimer);this.terrainTimer=setTimeout(()=>this.elevate(),180);};map.on('moveend',this.refresh);map.on('sourcedata',e=>{if(e.sourceId===this.map.getTerrain()?.source&&this.map.isSourceLoaded(e.sourceId))this.refresh();});}
 async setScenario(s){const key=this.key=s.id;this.ready=false;this.scenario=s;const vertices=[],indices=[];
  if(s.raster){const r=s.raster,cells=new Uint16Array(await fetch(r.url+'depth.bin').then(x=>{if(!x.ok)throw new Error('Flood surface unavailable');return x.arrayBuffer();}));if(this.key!==key)return;this.cells=cells;
   const [w,h]=r.size,nx=Math.min(384,w),ny=Math.min(384,Math.max(2,Math.round(nx*h/w))),[west,north]=r.bounds[0],[east,south]=r.bounds[2],yn=mercY(north),ys=mercY(south);
   const value=(x,y)=>{const ix=Math.min(w-1,Math.max(0,x)),iy=Math.min(h-1,Math.max(0,y)),v=cells[iy*w+ix];return v?(v-1)/10:-1;};
   for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const u=x/(nx-1),v=y/(ny-1),px=u*(w-1),py=v*(h-1),ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,depth=value(ix,iy)*(1-fx)*(1-fy)+value(ix+1,iy)*fx*(1-fy)+value(ix,iy+1)*(1-fx)*fy+value(ix+1,iy+1)*fx*fy;vertices.push({p:[west+u*(east-west),inverseY(yn+v*(ys-yn))],data:[depth,u,v]});}
   this.gridIndices(nx,ny,indices);this.kind=0;
  }else{const original=s.flow;if(!original?.length)return;const path=[original[0]];for(let i=1;i<original.length;i++){const a=original[i-1],b=original[i],metres=Math.hypot((b[0]-a[0])*Math.cos(b[1]*Math.PI/180),b[1]-a[1])*111195,steps=Math.max(1,Math.ceil(metres/7));for(let j=1;j<=steps;j++)path.push(a.map((v,k)=>v+(b[k]-v)*j/steps));}let total=0;const travel=[0];for(let i=1;i<path.length;i++){total+=Math.hypot((path[i][0]-path[i-1][0])*Math.cos(path[i][1]*Math.PI/180),path[i][1]-path[i-1][1]);travel.push(total);}
   const nx=25;for(let y=0;y<path.length;y++){const p=path[y],a=path[Math.max(0,y-1)],b=path[Math.min(path.length-1,y+1)],dx=(b[0]-a[0])*Math.cos(p[1]*Math.PI/180),dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;for(let x=0;x<nx;x++){const side=x/(nx-1)*2-1;vertices.push({p:[p[0]-dy/d*80*side/(111195*Math.cos(p[1]*Math.PI/180)),p[1]+dx/d*80*side/111195],data:[2,side,travel[y]/total]});}}
   this.gridIndices(nx,path.length,indices);this.kind=1;
  }
  if(this.key!==key)return;this.vertices=vertices;this.indices=new Uint32Array(indices);const origin=maplibre.MercatorCoordinate.fromLngLat(s.center);this.origin=origin;this.meter=origin.meterInMercatorCoordinateUnits();this.elevate();this.ready=true;this.map.triggerRepaint();
 }
 gridIndices(w,h,out){for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){const a=y*w+x;out.push(a,a+w,a+1,a+1,a+w,a+w+1);}}
 elevate(){if(!this.vertices.length||!this.gl)return;const gl=this.gl,data=new Float32Array(this.vertices.length*6);let sampled=0;for(let i=0;i<this.vertices.length;i++){const v=this.vertices[i],m=maplibre.MercatorCoordinate.fromLngLat(v.p),height=this.map.queryTerrainElevation(v.p);if(height!==null)sampled++;data.set([m.x-this.origin.x,m.y-this.origin.y,(height||0)*this.meter,...v.data],i*6);}this.sampledTerrain=sampled;const previous=gl.getParameter(gl.VERTEX_ARRAY_BINDING),arrayBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(const [name,offset]of [['a_position',0],['a_data',12]]){const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.indices,gl.STATIC_DRAW);gl.bindVertexArray(previous);gl.bindBuffer(gl.ARRAY_BUFFER,arrayBuffer);this.map.triggerRepaint();}
 setState(state,clockAt){this.state=state;this.clockAt=clockAt;}
 render(gl,args){if(!this.ready||!this.enabled||!this.state||this.state.mode==='ready')return;const state=this.state,time=sceneTime(state,this.clockAt);if(time<.01)return;const matrix=args.defaultProjectionData?.mainMatrix||args.modelViewProjectionMatrix;if(!matrix)return;
  const localMatrix=new Float32Array(matrix);for(let row=0;row<4;row++)localMatrix[12+row]=matrix[row]*this.origin.x+matrix[4+row]*this.origin.y+matrix[12+row];
  const vao=gl.getParameter(gl.VERTEX_ARRAY_BINDING),program=gl.getParameter(gl.CURRENT_PROGRAM),depthMask=gl.getParameter(gl.DEPTH_WRITEMASK),cull=gl.isEnabled(gl.CULL_FACE);gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);
  gl.uniformMatrix4fv(this.uniforms.matrix,false,localMatrix);gl.uniform1f(this.uniforms.meter,this.meter);gl.uniform1f(this.uniforms.threshold,this.scenario.raster?waterThreshold(this.scenario.raster,time):0);gl.uniform1f(this.uniforms.kind,this.kind);gl.uniform1f(this.uniforms.progress,Math.min(1,time/65));gl.uniform1f(this.uniforms.exaggeration,this.map.getTerrain()?.exaggeration||1);gl.uniform1f(this.uniforms.time,time*.3);gl.drawElements(gl.TRIANGLES,this.indices.length,gl.UNSIGNED_INT,0);gl.bindVertexArray(vao);gl.useProgram(program);gl.depthMask(depthMask);if(cull)gl.enable(gl.CULL_FACE);this.frames++;if(state.mode==='running')this.map.triggerRepaint();}
 onRemove(map,gl){clearTimeout(this.terrainTimer);map.off('moveend',this.refresh);gl.deleteBuffer(this.buffer);gl.deleteBuffer(this.indexBuffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program);}
}
