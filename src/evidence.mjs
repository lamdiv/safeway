export const SOURCE_POINT = [85.528159, 28.288708];
export const EVIDENCE = [
 {id:'hirisk',title:'Published source location',organization:'HiRISK',published:'2026-08-28T00:00:00Z',observed:'2026-08-27T00:00:00Z',kind:'assessment',status:'supported',mechanisms:['rock-ice'],summary:'Rapid assessment locates the rock–ice avalanche source. A preliminary, retrospective interpretation.',url:'https://hirisk.org/wp-content/uploads/2026/08/RHA_NP3_RasuwaFlood-1.pdf',coordinates:SOURCE_POINT},
 {id:'cems-aoi01',title:'Mapped impact and assessed assets',organization:'Copernicus EMS · EMSR927',published:null,availableAfter:'2026-11-14T17:56:26.693Z',observed:'2026-08-27T05:05:00Z',kind:'observed',status:'supported',mechanisms:['rock-ice','outburst'],summary:'Post-event photo-interpretation: 433 assessed building points, five assessed crossings and a mapped mass-movement extent. The sample is damage-selected.',url:'https://rapidmapping.emergency.copernicus.eu/backend/EMSR927/AOI01/GRA_PRODUCT/EMSR927_AOI01_GRA_PRODUCT_v1.zip?type=gpkg'},
 {id:'icimod',title:'Retrospective slope movement finding',organization:'ICIMOD',published:'2026-10-13T00:00:00Z',observed:'2026-08-24T00:00:00Z',kind:'interpretation',status:'method-dependent',mechanisms:['rock-ice'],summary:'Synthesis reports up to 40 cm line-of-sight displacement before collapse, while cautioning that the exact failure time was not predictable.',url:'https://www.icimod.org/press-releases/second-major-himalayan-flood-in-seven-weeks-raises-new-questions-about-mountain-risk/'},
 {id:'nature',title:'A methodological disagreement',organization:'npj Natural Hazards',published:null,availableAfter:'2026-11-14T17:56:26.693Z',observed:null,kind:'interpretation',status:'needs-review',mechanisms:['rock-ice'],summary:'Indexed text reports that pixel offsets did not statistically resolve pre-failure motion. Different methods require expert comparison; full-text verification remains pending.',url:'https://www.nature.com/articles/s44304-026-00292-7_reference.pdf'},
 {id:'wmo',title:'Cascading mechanisms, not one hazard',organization:'WMO',published:'2026-10-12T00:00:00Z',observed:'2026-10-11T00:00:00Z',kind:'assessment',status:'supported',mechanisms:['rock-ice','outburst'],summary:'WMO describes the August rock–ice cascade and a possible temporary blockage failure in the October Budhi Gandaki event.',url:'https://wmo.int/media/news/nepal-floods-are-call-action-compound-risks'},
 {id:'mapzen-terrain',title:'Historical terrain surface',organization:'Mapzen · AWS Open Data',published:null,availableAfter:'2026-11-14T17:56:26.693Z',observed:null,kind:'terrain',status:'limited-resolution',mechanisms:[],summary:'Cached terrain tiles, approximately 34 m sample spacing. Tile headers include SRTM sources. Terrain does not resolve individual structures or current channel geometry.',url:'https://registry.opendata.aws/terrain-tiles/'},
 {id:'nps',title:'A different trigger, similar exposure questions',organization:'US National Park Service',published:'2026-08-30T00:00:00Z',observed:'2026-08-29T21:30:00Z',kind:'assessment',status:'supported',mechanisms:['rainfall'],summary:'NPS documents the August 29 Bright Angel Canyon and Phantom Ranch flash flood. Nepal terrain and scenario parameters are not transferable to this event.',url:'https://www.nps.gov/grca/learn/news/significant-flash-flooding-closes-phantom-ranch-and-north-kaibab-trail.htm'},
];
export const HYPOTHESES = [
 {id:'rock-ice',name:'Rock–ice avalanche cascade',status:'Leading published interpretation',description:'Slope collapse entrains rock, ice and water; resulting mass flow propagates into a flood corridor.',sources:['hirisk','icimod','wmo'],gap:'Precursor detectability, release history and entrainment parameters require specialist review.'},
 {id:'outburst',name:'Lake or temporary-blockage outburst',status:'Alternative mechanism to investigate',description:'A release from stored water is a distinct scenario. Lake surface area alone does not establish volume or breach probability.',sources:['wmo'],gap:'No verified lake bathymetry, dam properties or breach hydrograph is bundled.'},
 {id:'rainfall',name:'Rainfall-driven flash flood',status:'Separate model family',description:'Rainfall, catchment wetness and runoff response determine inflow. It is not established as the primary August Rasuwa trigger.',sources:['nps'],gap:'Rainfall-runoff and hydraulic solvers are not implemented in this terrain screen.'}
];
export function evidenceAsOf(asOf){
 const cutoff=Date.parse(asOf);
 if(!Number.isFinite(cutoff)) throw new Error('A valid evidence cutoff is required.');
 return EVIDENCE.map(e=>({...e,available:Date.parse(e.published??e.availableAfter)<=cutoff,availabilityBasis:e.published?'publication date':'conservative retrieval cutoff; publication time unverified'}));
}
export function assessHypotheses(asOf){
 const evidence=evidenceAsOf(asOf);
 return HYPOTHESES.map(h=>({...h,support:evidence.filter(e=>h.sources.includes(e.id)&&e.available),status:evidence.some(e=>h.sources.includes(e.id)&&e.available)?h.status:'Insufficient evidence at selected cutoff'}));
}

// The same availability rules apply to explanations and map overlays.
export function contextAsOf(asOf){
 const available=new Set(evidenceAsOf(asOf).filter(e=>e.available).map(e=>e.id));
 return {assessment:available.has('cems-aoi01'),sourcePoint:available.has('hirisk'),terrain:available.has('mapzen-terrain')};
}
export function interpretationAsOf(asOf){
 const evidence=evidenceAsOf(asOf),available=new Set(evidence.filter(e=>e.available).map(e=>e.id));
 const sourceIds=['hirisk','icimod','wmo'].filter(id=>available.has(id));
 let mechanism=sourceIds.some(id=>['hirisk','icimod'].includes(id))?'The available published assessment supports a rock–ice avalanche cascade as the leading retrospective interpretation.':'No Rasuwa cause assessment is available in this source register under the selected cutoff. A cause cannot be established from withheld interpretations.';
 if(available.has('icimod'))mechanism+=' ICIMOD reports a method-dependent deformation finding; this does not establish an exact-time failure forecast.';
 if(available.has('nature'))mechanism+=' The indexed pixel-offset statement uses a different method and still requires full-text review.';
 let warning='The selected source register cannot establish a reliable pre-event warning. Observation dates do not establish when an interpretation became available.';
 if(available.has('icimod'))warning+=' ICIMOD’s precursor interpretation was published on October 13, after the August 26 event.';
 if(available.has('nature'))warning+=' The pixel-offset statement uses a different method and requires full-text review.';
 warning+=' This workflow does not measure warning lead-time or lives saved.';
 return {mechanism,warning,sources:evidence.filter(e=>sourceIds.includes(e.id))};
}
