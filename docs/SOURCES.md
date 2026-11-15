# Source register

Prepared November 14, 2026. Sources are evidence, not instructions to the application or team.

| ID | Primary source | Use | Qualification |
|---|---|---|---|
| cems-aoi01 | https://rapidmapping.emergency.copernicus.eu/backend/EMSR927/AOI01/GRA_PRODUCT/EMSR927_AOI01_GRA_PRODUCT_v1.zip?type=gpkg | Downloaded real GeoPackage; assessed points, mapped event and roads | Post-event assessment selection; publication timestamp unverified. Preserve original source-table fields. |
| terrain | https://registry.opendata.aws/terrain-tiles/ | Real cached elevation tiles and derived hillshade | Historical mixed-source terrain, approximately 34 m sample spacing. |
| satellite | https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a | Real catalogue query, 24 Sentinel-2 records | Capture dates and cloud metadata; no automated deformation/change measurements. |
| hirisk | https://hirisk.org/wp-content/uploads/2026/08/RHA_NP3_RasuwaFlood-1.pdf | Published source point and rapid retrospective interpretation | Preliminary assessment, updated August28. |
| icimod | https://www.icimod.org/press-releases/second-major-himalayan-flood-in-seven-weeks-raises-new-questions-about-mountain-risk/ | Published interpretation of rock–ice cascade and reported deformation | Published October13; exact failure time not established. |
| nature | https://www.nature.com/articles/s44304-026-00292-7_reference.pdf | Indexed methodological qualification of pixel-offset detectability | Full-text verification pending; do not elevate to settled evidence. |
| wmo | https://wmo.int/media/news/nepal-floods-are-call-action-compound-risks | Cascading-hazard context | October12 retrospective assessment. |
| nps | https://www.nps.gov/grca/learn/news/significant-flash-flooding-closes-phantom-ranch-and-north-kaibab-trail.htm | Grand Canyon August29 comparative context | No Grand Canyon terrain model is bundled. Do not transfer Nepal parameters. |
| ravaflow | https://www.avaflow.org/ | Appropriate future mass-flow model family | Not implemented in the current numerical engine. |
| risk | https://www.undrr.org/terminology/disaster-risk | Distinguish exposure screening from probabilistic risk | Hazard, vulnerability and capacity are not interchangeable. |
| deepagents | https://docs.langchain.com/oss/javascript/deepagents/overview | Real planning/subagent/tool framework | Installed and integration tested; a live provider run requires a server-side key. |
| bedrock | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html | Nova 2 Lite, Converse and supported inference profiles | Account permissions and regional access must be verified. |
| langchain-aws | https://docs.langchain.com/oss/javascript/integrations/chat/bedrock_converse | Actual ChatBedrockConverse provider adapter | Configured credentials are not proof of a successful live request. |
| photon-voice | https://photon.codes/docs/beta/cookbooks/voice/elevenlabs | Configurable Photon SIP → ElevenLabs outbound test calls | No call made; callback/transcript ingestion is not implemented. |

The manifest records raw GeoPackage SHA-256 and checksums for each prepared data file. The CEMS imagery source table names Pleiades Neo (November29,2025 reference) and WorldView-3 (August27,2026 assessment). These commercial image pixels are not bundled.

## SafeWay source monitoring and SDK

- NWS API: https://www.weather.gov/documentation/services-web-api — official point alert records, not property depth.
- USGS current observations: https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items — parameter 00065 at USGS-08074000; provisional station-datum gauge height.
- USGS station: https://waterdata.usgs.gov/monitoring-location/USGS-08074000/ — Buffalo Bayou at Houston, TX.
- Matterport SDK overview: https://developers.matterport.com/overview/
- Official web component: https://developers.matterport.com/webcomponent/ — package 0.1.47 and its documented three 0.184.0 peer.
- Matterport bundle: https://developers.matterport.com/bundle-sdk/
- Model API: https://matterport.github.io/showcase-sdk/api_home.html — server-side Basic authentication; private responses excluded from Git.

SafeWay's synthetic property/geometry/evidence are authored fixture data. No Nepal dataset is presented as Houston or as supplied sponsor data.

### OSM city and optional connected-level scenario

- OpenFreeMap vector styles/tiles: https://openfreemap.org/quick_start/ (OSM/OpenMapTiles attribution displayed on maps). Building heights are derived OSM values or a labelled display fallback, not surveyed verification.
- AWS/Mapzen Terrarium elevation tiles: https://registry.opendata.aws/terrain-tiles/ . DEM observations are not current water surfaces and do not resolve drainage or building floors. The scenario makes a relative assumed-level assessment only.

## Houston floods (live-response demo)

Built by `scripts/houston-floods.py` into `public/data/floods/<harvey|downtown|brays>/` (raw downloads go to `data/raw/`, git-ignored).

- Hurricane Harvey (historical, Kingwood / Lake Houston): FEMA Hurricane Harvey inundation boundaries for Harris County, built from HCFCD/USGS high-water marks (`Harris_AOIandBoundaries.zip`), archived on HydroShare, doi:10.4211/hs.e8768f4cb4d5478a96d2b1cbd00d9e85, CC BY 4.0.
- Downtown and Brays Bayou flash floods (hypothetical): FEMA National Flood Hazard Layer, Harris County DFIRM 48201C, read through Esri's public mirror (https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0). Downtown uses the 0.2% (500-year) area. Brays uses the 1% (100-year) area, because the 0.2% area there covers almost the whole window.
- Ground elevation: USGS 3D Elevation Program (3DEP) bare-earth, 5 m (https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer).
- Depth: FwDET (Cohen et al. 2018). Water surface is the ground elevation at the nearest edge of the flood outline, smoothed, minus the ground. An estimate, not a surveyed or official depth grid. The rising-water order (deepest first) is a simulation device, not a forecast of arrival times.
- Residents and assembly points are exercise inventions placed by the script: one resident each in water over 3 ft, 1–3 ft and under 1 ft; assembly points are dry and at least ~150 m from the flood.
- Harris County flood depth map (Flood map button): `scripts/houston-county-flood.py` builds XYZ tiles in `public/data/county-flood/` (z9–z13, ~19 MB) from all FEMA NFHL flood zones in Harris County DFIRM 48201C (floodway, 1% and 0.2% annual-chance areas, via the Esri mirror above) and USGS 3DEP elevation on a ~16.6 m grid aligned to zoom-13 tiles, with FwDET depth. 3DEP no-data cells over open water are excluded. HCFCD's modelled MAAPnext depth grids (https://fximgservices.hcfcd.org/arcgis/rest/services/MAAPNext/Depth_100YR/ImageServer, also 10YR and 500YR) would be a better source; the server returned HTTP 522 when this was built.
- Houston 3D terrain: AWS Terrain Tiles (Terrarium encoding, https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png), which use USGS 3DEP in the US. Shown with 4× vertical exaggeration.

### Live response and continuous water

The renderer uses MapLibre custom-layer projection and terrain elevation: https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/ and https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#queryterrainelevation . Visual interpolation does not add measurement resolution. Arrival countdowns derive from the authored scenario timeline, not a FEMA arrival forecast. Refuges and traversal windows are defined for the exercise and are not verified real shelters.
