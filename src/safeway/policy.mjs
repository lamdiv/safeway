import {lineIntersects,pointInside} from './geometry.mjs';
export function assessApproach(fixture,approach,closures,now=Date.now()){
 const missing=[],property=fixture.property,entrance=fixture.entrances.find(e=>e.id===approach.entranceId),exterior=fixture.evidence.find(e=>e.id===approach.evidenceId),interior=fixture.evidence.find(e=>e.id==='INT-LOBBY');
 const current=e=>e&&Number.isFinite(Date.parse(e.observedAt))&&Date.parse(e.observedAt)<=now&&Date.parse(e.validUntil)>now;
 if(!approach.preapproved)missing.push('Approach is not preapproved');
 if(approach.propertyId!==property.id)missing.push('Property join does not match');
 if(!(Date.parse(property.approvalUntil)>now))missing.push('Property approval is stale');
 if(closures.includes(approach.id))missing.push(approach.name+' has a known closure');
 let intersects=false;try{intersects=fixture.hazards.some(p=>lineIntersects(approach.geometry,p));if(intersects)missing.push(approach.name+' intersects staged flood');}catch{missing.push('Approach or staged hazard geometry is missing or invalid');}
 if(!current(exterior)||exterior.propertyId!==property.id||!exterior.rights||![approach.id,approach.entranceId].every(x=>exterior.coverage.includes(x)))missing.push('Matched current exterior approach evidence is missing');
 if(!entrance||entrance.state!=='open')missing.push(approach.entranceId+' is not explicitly open');
 if(!current(entrance))missing.push(approach.entranceId+' current staff observation is stale or missing');
 if(!entrance?.interiorVerified)missing.push(approach.entranceId+' indoor connection is unverified');
 if(!current(interior)||interior.propertyId!==property.id||![approach.entranceId,property.checkInId].every(x=>interior.coverage.includes(x))||!interior.rights)missing.push('Verified entrance-to-check-in evidence is missing');
 return {id:approach.id,eligible:missing.length===0,missingFacts:missing,intersects};
}
export function decide(fixture,participant,closures,now=Date.now()){
 if(!participant.sharing||!participant.position)return {status:'withheld',reason:'Sharing stopped or current location unavailable',missingFacts:['Current consented location'],route:null,entrance:null,checkInId:null};
 if(!pointInside(participant.position,fixture.warning))return {status:'outside',reason:'Outside the exercise warning boundary',missingFacts:[],route:null,entrance:null,checkInId:null};
 const assessments=fixture.approaches.map(a=>assessApproach(fixture,a,closures,now)),eligible=assessments.find(a=>a.eligible);
 if(!eligible)return {status:'withheld',reason:'No approach qualifies under current evidence',missingFacts:[...new Set(assessments.flatMap(a=>a.missingFacts))],route:null,entrance:null,checkInId:null};
 const a=fixture.approaches.find(a=>a.id===eligible.id),entrance=fixture.entrances.find(e=>e.id===a.entranceId);
 return {status:'active',reason:'Preapproved exercise approach and current entrance evidence qualify',missingFacts:[],route:{approachId:a.id,name:a.name,geometry:structuredClone(a.geometry)},entrance:{id:entrance.id,name:entrance.name,coordinates:entrance.coordinates},checkInId:fixture.property.checkInId};
}
