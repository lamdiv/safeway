import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,statSync} from 'node:fs';
const meta=JSON.parse(readFileSync(new URL('../public/data/sentinel1/harvey/meta.json',import.meta.url)));
test('Sentinel-1 Harvey radar flood map: same-orbit before/after pair, overlay aligned with the drill grid',()=>{
 assert.equal(meta.scenes.before.date,'2017-08-24');assert.equal(meta.scenes.flood.date,'2017-08-30');assert.equal(meta.scenes.before.orbit,meta.scenes.flood.orbit,'same orbit, so the change is not a viewing-angle artefact');
 const drill=JSON.parse(readFileSync(new URL('../public/data/floods/harvey/meta.json',import.meta.url)));assert.deepEqual(meta.bounds,drill.bounds);
 assert.ok(statSync(new URL('../public/data/sentinel1/harvey/flood.png',import.meta.url)).size>1000);
});
test('Radar detections mostly fall inside the FEMA extent, and the limits are stated',()=>{
 const a=meta.agreement;assert.ok(a.precision>=.7,'most radar-flagged flood is inside the FEMA outline');assert.ok(a.hitRate>0&&a.hitRate<=1);
 assert.ok(meta.areaKm2.buildingsAndTrees>meta.areaKm2.openWater,'Kingwood flooding shows mostly as double bounce, not open water');
 assert.match(meta.limits,/canopy/);assert.match(meta.method,/double bounce/);
});
