/** Static connected-level screening. No velocity, rainfall, drainage or travel-time model. */
export function connectedLevels(elevations,width,height,seed){
 if(width<2||height<2||elevations.length!==width*height||!Number.isInteger(seed)||seed<0||seed>=elevations.length||!Array.from(elevations).every(Number.isFinite))throw new Error('Valid finite terrain and in-grid source are required');
 const levels=new Float64Array(elevations.length).fill(Infinity),heap=[];
 const push=(v,i)=>{let n=heap.length;heap.push([v,i]);while(n){const p=(n-1)>>1;if(heap[p][0]<=v)break;heap[n]=heap[p];n=p;}heap[n]=[v,i];};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
 levels[seed]=elevations[seed];push(levels[seed],seed);
 while(heap.length){const [level,i]=pop();if(level!==levels[i])continue;const x=i%width,y=Math.floor(i/width);for(const n of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1]){if(n<0)continue;const v=Math.max(level,elevations[n]);if(v<levels[n]){levels[n]=v;push(v,n);}}}
 return levels;
}
const key=p=>p.map(v=>v.toFixed(8)).join(',');
const signedArea=r=>r.slice(1).reduce((s,p,i)=>s+r[i][0]*p[1]-p[0]*r[i][1],0)/2;
function inside(p,r){let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
/** Clip triangular terrain cells, cancel shared edges, stitch continuous outer/hole rings. */
export function inundationFootprint({levels,width,height,bounds},stage){
 if(!Number.isFinite(stage)||levels.length!==width*height)throw new Error('Invalid inundation input');
 const edges=new Map(),[west,south,east,north]=bounds,point=i=>[west+(i%width)/(width-1)*(east-west),south+Math.floor(i/width)/(height-1)*(north-south),levels[i]];
 const clip=tri=>{const out=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],ai=a[2]<=stage,bi=b[2]<=stage;if(ai)out.push(a.slice(0,2));if(ai!==bi){const t=(stage-a[2])/(b[2]-a[2]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}return out;};
 for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){const i=y*width+x;for(const tri of [[i,i+1,i+width+1],[i,i+width+1,i+width]]){const poly=clip(tri.map(point));if(poly.length<3)continue;for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],ka=key(a),kb=key(b);if(ka===kb)continue;const reverse=kb+'>'+ka;if(edges.has(reverse))edges.delete(reverse);else edges.set(ka+'>'+kb,{a,b,ka,kb});}}}
 const outgoing=new Map();for(const [id,e] of edges){if(!outgoing.has(e.ka))outgoing.set(e.ka,[]);outgoing.get(e.ka).push(id);}
 const rings=[];while(edges.size){const [id,start]=edges.entries().next().value,ring=[start.a];let e=start,current=id;for(let guard=0;guard<width*height*12;guard++){edges.delete(current);ring.push(e.b);if(e.kb===start.ka)break;current=outgoing.get(e.kb)?.find(k=>edges.has(k));if(!current)break;e=edges.get(current);}if(ring.length>=4&&key(ring[0])===key(ring.at(-1))&&Math.abs(signedArea(ring))>1e-14)rings.push(ring);}
 const outer=rings.filter(r=>signedArea(r)>0).map(r=>[r]);for(const hole of rings.filter(r=>signedArea(r)<0)){const owner=outer.filter(p=>inside(hole[0],p[0])).sort((a,b)=>signedArea(a[0])-signedArea(b[0]))[0];if(owner)owner.push(hole);}
 const areaM2=outer.reduce((s,poly)=>s+poly.reduce((a,r)=>a+signedArea(r),0),0)*111195**2*Math.cos((south+north)/2*Math.PI/180);
 return {type:'FeatureCollection',features:outer.length?[{type:'Feature',properties:{stage,areaM2,model:'connected-level screening',forecast:false},geometry:{type:'MultiPolygon',coordinates:outer}}]:[]};
}
export function levelAt({levels,width,height,bounds},coordinate){const [w,s,e,n]=bounds,x=(coordinate[0]-w)/(e-w)*(width-1),y=(coordinate[1]-s)/(n-s)*(height-1);if(x<0||y<0||x>width-1||y>height-1)return null;return levels[Math.round(y)*width+Math.round(x)];}
