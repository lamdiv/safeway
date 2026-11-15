import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync,readdirSync} from 'node:fs';
const root=new URL('../public/data/county-flood/',import.meta.url),meta=JSON.parse(readFileSync(new URL('meta.json',root)));
test('County flood map covers Harris County with seven ordered depth levels for the 100- and 500-year floods',()=>{
 const [w,s,e,n]=meta.bounds;assert.ok(w<-95.9&&e>-94.95&&s<29.55&&n>30.1,'bounds cover Harris County');
 assert.deepEqual(meta.levels.map(l=>l.level),[1,2,3,4,5,6,7]);for(let i=1;i<7;i++)assert.equal(meta.levels[i].minFt,meta.levels[i-1].maxFt);
 assert.deepEqual(Object.keys(meta.events),['100','500']);assert.ok(meta.events['500'].floodedKm2>meta.events['100'].floodedKm2,'the 500-year floodplain is larger');
 assert.ok(meta.events['100'].floodedKm2>300,'county-wide, not a single river');assert.match(meta.method,/FwDET/);assert.ok(meta.sources.some(x=>/FEMA/.test(x))&&meta.sources.some(x=>/3DEP/.test(x)));
});
test('Every zoom level has tiles, and z13 has a matching depth data tile for each picture tile',()=>{
 for(const ev of Object.keys(meta.events)){for(let z=meta.minzoom;z<=meta.maxzoom;z++)assert.ok(existsSync(new URL(`${ev}/${z}/`,root)),`${ev} z${z}`);
  const z=meta.maxzoom,cols=readdirSync(new URL(`${ev}/${z}/`,root));for(const x of cols)for(const y of readdirSync(new URL(`${ev}/${z}/${x}/`,root)))assert.ok(existsSync(new URL(`${ev}-data/${z}/${x}/${y}`,root)),`${ev}-data ${x}/${y}`);}
});
