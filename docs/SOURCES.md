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
