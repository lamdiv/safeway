/** Sponsor lookups stay server-side; reference metadata is not shelter approval. */
export async function matterportHouston({env=process.env,fetchImpl=fetch}={}){
 if(!env.MATTERPORT_TOKEN_ID||!env.MATTERPORT_TOKEN_SECRET)throw new Error('Matterport credentials are not configured');
 const r=await fetchImpl('https://api.matterport.com/api/models/graph',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(env.MATTERPORT_TOKEN_ID+':'+env.MATTERPORT_TOKEN_SECRET).toString('base64')},body:JSON.stringify({query:'query Models($search: String) { models(query: $search, pageSize: 100) { totalResults nextOffset results { id name address { address locality administrativeArea postalCode } geolocation { lat long } } } }',variables:{search:'address.locality:"Houston" AND address.administrativeArea:"TX"'}}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('Matterport access could not be verified');const data=await r.json();if(data.errors||!data.data?.models)throw new Error('Matterport query did not return model metadata');
 return {verifiedAt:new Date().toISOString(),totalResults:data.data.models.totalResults,scope:'First 100 matched metadata records, not a complete inventory or inspected indoor connection',candidates:data.data.models.results.filter(m=>m.geolocation&&m.address?.locality==='Houston').map(m=>({modelId:m.id,name:m.name,address:m.address.address,coordinates:[Number(m.geolocation.long),Number(m.geolocation.lat)],scanReference:'https://my.matterport.com/show/?m='+encodeURIComponent(m.id)})).filter(m=>m.coordinates.every(Number.isFinite))};
}
export function validateEvidenceManifest(manifest){
 if(!manifest||typeof manifest.property?.id!=='string'||!Array.isArray(manifest.evidence))throw new Error('Property and evidence records required');
 const required=['source','reference','observedAt','finding','coverage','rights'];
 for(const e of manifest.evidence){if(required.some(k=>!e[k])||e.propertyId!==manifest.property.id||!Array.isArray(e.coverage)||typeof e.simulated!=='boolean'||!Number.isFinite(Date.parse(e.observedAt)))throw new Error('Evidence metadata is incomplete or not matched to this property');if(typeof e.reference!=='string'||/api[_-]?key=|token=|password=|signature=/i.test(e.reference))throw new Error('Use canonical references without credentials or signed access parameters');}
 const ids=new Set(manifest.evidence.map(e=>e.id));if(ids.size!==manifest.evidence.length)throw new Error('Evidence IDs must be unique');
 return structuredClone(manifest);
}
export function sponsorGaps(manifest){const records=manifest?.evidence||[];return ['CoStar','Vexcel','Matterport'].filter(source=>!records.some(e=>e.source===source&&!e.simulated));}
