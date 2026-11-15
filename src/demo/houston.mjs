// Houston flood scenarios for the live-response demo: one historical (Hurricane Harvey, 2017) and two
// hypothetical flash floods, each in a different part of the city and fully mapped on a depth grid
// (see scripts/houston-floods.py and src/demo/raster-flood.mjs). People, timings and assembly points
// are exercise inventions; assembly points are dry cells at least ~150 m from the mapped flood.
import {loadRasterFlood,TIMELINE} from './raster-flood.mjs';

const NAMES=['Jordan Lee','Alex Morgan','Sam Rivera'],IDS=['houston-a','houston-b','houston-c'],POINTS=['Assembly Point A','Assembly Point B','Assembly Point C'];
const ZONE_TEXT={high:'Highly affected: water over 3 ft. Leave on the first warning. Don’t shelter on the ground floor.',medium:'Moderately affected: 1–3 ft. Water gets into homes and stalls cars. Leave early, or move to an upper floor.',low:'Lightly affected: under 1 ft. Streets and yards flood. Stay off the roads and be ready to move.',note:'Zones come from the estimated depth across the whole mapped flood, not from distance to a river.'};
function view(meta){const [[w,n],,[e,s]]=meta.bounds;return {center:[+((w+e)/2).toFixed(5),+((n+s)/2).toFixed(5)],zoom:+(14.75-Math.log2(Math.max(e-w,(n-s)*1.15)/0.055)).toFixed(2)};}

// Spoken over the warning call (one per resident); the WAV files are generated from these exact strings.
export const HOUSTON_INSTRUCTIONS={
 harvey:['This is a recreation of Hurricane Harvey. Flood water from the San Jacinto River and Lake Houston is rising into your street and could be more than three feet deep. Go to Assembly Point A within three minutes on the marked route.','This is a recreation of Hurricane Harvey. Flood water from the river is rising toward your home. Go to Assembly Point B within three minutes on the marked route. Do not drive through water.','This is a recreation of Hurricane Harvey. Water is reaching the edge of your neighbourhood. Go to Assembly Point C within three minutes on the marked route, and stay off flooded roads.'],
 downtown:['A flash flood is filling Buffalo and White Oak Bayous and the water near you could be more than three feet deep. Go to Assembly Point A within three minutes on the marked route. Do not enter garages or tunnels.','A flash flood is spreading from the bayous toward you. Go to Assembly Point B within three minutes on the marked route. Do not drive through water.','Flash flood water is reaching your street. Go to Assembly Point C within three minutes on the marked route, and stay out of underpasses.'],
 brays:['A flash flood on Brays Bayou is flooding your street and could be more than three feet deep. Go to Assembly Point A within three minutes on the marked route. If water is already at your door, move to an upper floor.','A flash flood on Brays Bayou is spreading across the streets toward you. Go to Assembly Point B within three minutes on the marked route. Do not drive through water.','Brays Bayou flood water is reaching your street. Go to Assembly Point C within three minutes on the marked route, and stay off flooded roads.']
};

function scenario(key,id,extra){
 const flood=loadRasterFlood(key),meta=flood.meta,lines=HOUSTON_INSTRUCTIONS[key];
 const people=meta.people.map((p,i)=>({id:IDS[i],name:NAMES[i],start:p.start,route:[p.start,p.destination],destination:{name:POINTS[i],coordinates:p.destination},audio:`/demo/audio/houston-${key}-${'abc'[i]}.wav`,instruction:lines[i]}));
 return {id,title:'Houston',country:'Texas',hazard:'Flood',color:'#4aa8d8',...view(meta),pitch:50,bearing:-18,duration:120,warn:{lead:12,radius:0},zoneText:ZONE_TEXT,
  raster:{key,url:flood.url,bounds:meta.bounds,size:meta.size,timeline:TIMELINE,exaggeration:4,frames:flood.frames,thresholdsFt:meta.thresholdsFt,areaKm2:meta.areaKm2,areaKm2ByLevel:meta.areaKm2ByLevel,levels:meta.levels,medianDepthFt:meta.medianDepthFt,method:meta.method,extent:meta.extent},
  flood,instruction:lines[0],people,...extra};
}

export const houstonScenarios={
 houston:scenario('harvey','houston',{variant:'Hurricane Harvey · August 2017',useCase:'Replay a real flood: would automatic warning calls have reached Kingwood residents before the water did?',historical:true,place:'Kingwood · Lake Houston',onset:'Days of rain · compressed to 2 minutes',
  status:'Harvey flood water rising · historical recreation',direction:'Up from the San Jacinto River and Lake Houston into the neighbourhoods',
  source:'FEMA Hurricane Harvey inundation boundaries, Harris County (HydroShare, CC BY 4.0) · USGS 3DEP elevation',
  summary:'Recreation of Hurricane Harvey’s flooding in Kingwood, where the San Jacinto River and Lake Houston rose into neighbourhoods.',
  cause:'Harvey stalled over the Houston area in late August 2017 and dropped more than 40 inches of rain in places, the largest rainfall flood in Houston’s history. In Kingwood, the West Fork of the San Jacinto River and Lake Houston rose into homes, schools and shops. The flood outline is FEMA’s mapped Harvey boundary, built from high-water marks. Depth is estimated from that outline and ground elevation.',
  trigger:'River and lake gauges on the San Jacinto and Lake Houston, plus rainfall forecasts days ahead.',
  risks:[
   {title:'Water that keeps rising for days',detail:'The river kept rising after the heaviest rain had passed, catching people who waited.',mitigation:'Evacuate on the forecast, not on what you can see, and don’t return until the river falls.'},
   {title:'Neighbourhoods cut off',detail:'Roads in and out went under, so many rescues needed boats.',mitigation:'Pre-position boats and high-water vehicles, and register people who need help to leave.'},
   {title:'Schools and shops flooded',detail:'Kingwood High School and local businesses took on water and closed for months.',mitigation:'Protect critical buildings above the flood level, and plan for long closures.'},
   {title:'Silt and debris left behind',detail:'Sand and debris filled the river channel, raising the risk for the next flood.',mitigation:'Clear and dredge channels after big floods, and keep drains open.'}]}),
 'houston-downtown':scenario('downtown','houston-downtown',{variant:'Downtown flash flood',useCase:'Plan for a flood that hasn’t happened yet: who downtown must be warned first, and where they should go.',historical:false,place:'Buffalo & White Oak Bayous',onset:'Hours · compressed to 2 minutes',
  status:'Bayous flooding downtown · hypothetical',direction:'Out of Buffalo and White Oak Bayous into the streets beside them',
  source:'FEMA NFHL 0.2% annual-chance (500-year) area, Harris County 48201C · USGS 3DEP elevation',
  summary:'A hypothetical flash flood filling the Buffalo and White Oak Bayou floodplain around downtown.',
  cause:'A hypothetical storm drops intense rain over the Buffalo and White Oak watersheds in a few hours. Both bayous leave their banks and fill the area FEMA maps as the 0.2% annual-chance (500-year) floodplain, around downtown and the Fifth Ward. This is a planning scenario, not a past event.',
  trigger:'Rainfall intensity and the Buffalo Bayou gauge (USGS 08074000) rising quickly.',
  risks:[
   {title:'Garages, basements and tunnels',detail:'Below-ground spaces downtown fill fast once water reaches an entrance.',mitigation:'Close floodgates at entrances, and keep people and cars out of below-ground spaces.'},
   {title:'Bayou trails and parks',detail:'People walking or cycling beside the bayous are the first to be cut off.',mitigation:'Close trails and parks early, and move people uphill.'},
   {title:'Underpasses and bridges',detail:'Low roads under the freeways flood quickly, and cars stall in them.',mitigation:'Turn Around, Don’t Drown: barricade underpasses and route people around them.'},
   {title:'Street-level power',detail:'Flooded electrical rooms cut power, lifts and pumps.',mitigation:'Raise critical equipment and shut power off safely before water arrives.'}]}),
 'houston-brays':scenario('brays','houston-brays',{variant:'Brays Bayou flash flood',useCase:'Rehearse a wide, shallow flood: most homes get under a foot of water, but flooded streets cut people off.',historical:false,place:'Meyerland',onset:'Hours · compressed to 2 minutes',
  status:'Brays Bayou flooding Meyerland · hypothetical',direction:'Out of Brays Bayou and across the flat streets of Meyerland',
  source:'FEMA NFHL 1% annual-chance (100-year) area, Harris County 48201C · USGS 3DEP elevation',
  summary:'A hypothetical flash flood spreading from Brays Bayou across the flat streets of Meyerland.',
  cause:'A hypothetical cloudburst over the Brays Bayou watershed fills the area FEMA maps as the 1% annual-chance (100-year) floodplain in Meyerland. The ground is flat and low, so water spreads street by street and into homes even where it’s shallow. Meyerland has flooded in real storms, but this event is a planning scenario.',
  trigger:'Rainfall intensity over the Brays watershed and the Brays Bayou gauges rising quickly.',
  risks:[
   {title:'Shallow water everywhere',detail:'Most of the area floods under 1 ft, which is still enough to enter slab-on-grade homes and stall cars.',mitigation:'Raise homes above the flood level, and move cars and valuables up early.'},
   {title:'Streets that become channels',detail:'The streets carry the deepest water and cut neighbourhoods off.',mitigation:'Tell people to leave before streets fill, and never drive through moving water.'},
   {title:'Repeat flooding',detail:'The same homes flood in storm after storm.',mitigation:'Detention basins and channel widening along Brays, plus buyouts or elevation for repeat-loss homes.'},
   {title:'People who can’t leave quickly',detail:'Older residents and people with limited mobility need more time.',mitigation:'Register people who need help in advance, and call them first.'}]})
};
