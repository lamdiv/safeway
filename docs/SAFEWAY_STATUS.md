# SafeWay implementation and evidence status

## Implemented and tested

Phase 0: Headwater main preserved; safeway branch created. Baseline 43 tests passed with the working Node runtime; no NVM trust setting was changed.

Phase 1: shared contract/sample responses; synthetic Houston fixture; line/polygon intersection; deterministic evidence policy; isolated replay IDs; immediate withdrawal; generation/safety-version checks; duplicate controls/actions; operator and resident APIs. The six core acceptance outcomes are covered by tests.

Phase 2: separate operator and mobile resident pages; two independently enrolled browser profiles; one-second resident polling; current revision checks; acknowledgement, self-reported check-in/safety, SOS, operator SOS acknowledgement and Stop Sharing. Offline guidance expires after five seconds. End clears active/SOS coordinates and refuses further location uploads.

Phase 4 code: read-only Deep Agents evidence supervisor with bounded calls; actual scripted-model tool execution; de-identified local event persistence; presentation/submission documents; source and asset build tooling. The source-monitoring default now uses actual public observations/alerts rather than animated playback.

## Actual sponsor verification

Matterport Model API: verified with the supplied account; Houston query reported 5,922 matches. Individual addresses/geolocations were fetched privately. Matterport web component 0.1.47 / three 0.184.0: actual SDK connected to an authorized Houston model in the browser on localhost. API secret stays server-side; SDK key is runtime domain-restricted configuration. Actual scan connection is not proof of a reviewed indoor route or an open door.

Vexcel: exact key was extracted locally from the supplied screenshot. Standard documented REST and MCP calls returned HTTP 401. No successful imagery observation is claimed. CoStar: private download target URL is not available from the screenshot's link label. No fabricated property ID/join or sponsor-data match is used.

Phase 3 therefore remains incomplete pending the actual sponsor kit/quickstart links and a useful, permitted property/exterior/interior match. The private manifest intake validates property joins, timestamps, coverage, rights and credential-free references, and does not automatically publish guidance from imported metadata.

## Scientific scope

Source monitoring is not calibrated hazard prediction. NWS point alerts are official alert records; USGS values are provisional gauge height relative to the station datum; Sentinel-2 records are acquisition metadata. None directly establishes house-level water depth, landslide timing, route passability or failure probability. Nepal stage screening uses a historical damage-selected assessed sample, not a complete or current household inventory.

Optional Nepal playback now uses a smooth connected priority-flood terrain path from the published upstream source, with separate debris/channel display. Slope changes display pacing only. It is not a r.avaflow/hydraulic simulation or reconstruction of actual motion.

## Unverified/optional integrations

Live Bedrock, actual Photon SafeWay delivery, verified inbound provider callbacks, approved real shelter/entrance paths, Tiger Data, QR/voice SOS, push and Vultr deployment are not claimed. The core is a local operator-supervised exercise. No real safety outcomes, public alerting or emergency dispatch is implied.

## Houston OSM 3D and water screening

Houston monitoring and the operator map now use OSM vector streets through OpenFreeMap, with actual OSM-derived building extrusions and a 6 m display fallback. Houston relief is not exaggerated. Monitoring retains all current NWS weather alert types, while no active alert remains an unknown site-specific condition.

The optional scenario samples a bounded public Terrarium DEM, constrains the source to the nearest mapped river sample, computes minimax connected elevations and clips/stitches triangular cells into continuous polygons. A rise slider changes the assumed static water surface; only connected terrain below that level is included. Visible OSM footprint-centre intersections are highlighted separately from observed hazard status. No hydraulic flow, rainfall, drainage, levees, property-floor elevations, current flood depth, arrival time or safety conclusion is inferred.

73 unit/API tests pass, including disconnected depressions, saddle overtopping, continuous shoreline stitching and non-flood alert retention. Browser verification covers the 3D city, adjustable scenario, region isolation and report flow. The local backup exercise recording measures 58.96 seconds. The live Bedrock smoke request returned ThrottlingException; no successful live model run is claimed.
