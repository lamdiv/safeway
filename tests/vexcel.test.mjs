import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {vexcelRequest,createVexcel} from '../src/demo/vexcel.mjs';

test('Vexcel photo requests: obliques use the urban layer, bare colours and a polygon marker; ortho uses every layer',()=>{
 const o=vexcelRequest({lon:-95.4476,lat:29.6975,view:'west'});assert.equal(o.path,'oriented/extract');assert.equal(o.body['product-type'],'oblique-west');assert.equal(o.body.layer,'urban');assert.match(o.body.wkt,/^POINT\(-95\.4476/);
 assert.match(o.body.drawing[0].wkt,/^POLYGON/);assert.equal(o.body.drawing[0]['outline-color'],'214,69,65');assert.equal(o.body.drawing[0].transparency,0);
 const t=vexcelRequest({lon:-95.4476,lat:29.6975,view:'ortho'});assert.equal(t.path,'ortho/extract');assert.equal(t.body.layer,'urban,urban-r,wide-area,urban-g');
});
test('Vexcel photos stay inside Houston and reject bad input',()=>{
 assert.throws(()=>vexcelRequest({lon:-74.67,lat:40.34,view:'north'}),e=>e.status===403);
 assert.throws(()=>vexcelRequest({lon:-95.4,lat:29.7,view:'up'}),e=>e.status===400);
 assert.throws(()=>vexcelRequest({lat:29.7}),e=>e.status===400);
});
test('Vexcel client sends the key as a header, caches photos and needs a key',async()=>{
 let calls=0,seen;const fetchImpl=async(url,init)=>{calls++;seen={url,init};return new Response(new Uint8Array([0xff,0xd8,1]),{status:200});};
 const v=createVexcel({key:'test-key',cacheDir:mkdtempSync(join(tmpdir(),'vx-')),fetchImpl});
 const a=await v.photo({lon:-95.4476,lat:29.6975,view:'north'}),b=await v.photo({lon:-95.4476,lat:29.6975,view:'north'});
 assert.equal(calls,1,'second request served from the cache');assert.deepEqual([...a],[...b]);assert.equal(seen.init.headers['X-API-KEY'],'test-key');assert.ok(!seen.url.includes('test-key'),'key never in the URL');
 await assert.rejects(createVexcel({key:''}).photo({lon:-95.4,lat:29.7}),e=>e.status===503);
});
import {vexcelTileRequest} from '../src/demo/vexcel.mjs';
test('Aerial tiles: Vexcel ortho in Web Mercator for the Houston and Princeton drills only',()=>{
 const t=vexcelTileRequest(17,30784,54204);assert.equal(t.path,'ortho/extract');assert.equal(t.body.srid,3857);assert.equal(t.body.zoom,18);assert.equal(t.body['destination-dimensions'],'512,512');assert.match(t.body.wkt,/^POLYGON\(\(-1062/);
 assert.ok(vexcelTileRequest(17,38355,49454),'Princeton');
 assert.throws(()=>vexcelTileRequest(14,12075,6854),e=>e.status===404,'Rasuwa has no Vexcel imagery');
 assert.throws(()=>vexcelTileRequest(8,60,105),e=>e.status===400,'too far out');assert.throws(()=>vexcelTileRequest(17,-1,2),e=>e.status===400);
});
