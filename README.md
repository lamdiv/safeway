# Headwater

**Trace the hazard. Map the impact.**

Headwater is a geospatial disaster-intelligence and response exercise workspace: inspect a hazard in 3D, screen exposed assets, record assistance needs, review mapped access, and coordinate rescue resources. The first case is the 26 August 2026 Rasuwa cascading flood, with a real Syabrubesi assessment window.

This repository is a working **research screening prototype**, not an operational early-warning system. The implemented numerical method is relative-terrain screening; it is not a hydrodynamic or multiphase mass-flow solver.

## Run

Node.js 22.13 or newer:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Source data is bundled, so map, calculations, publication filtering, source register and exports work without external credentials. Satellite thumbnails and Google Fonts require internet; the analytical case does not.

### Enable AWS Bedrock investigations

Use **Amazon Nova 2 Lite** through Bedrock Converse. Copy `.env.example` to `.env` and configure one credential method locally:

```dotenv
HEADWATER_PROVIDER=bedrock
AWS_REGION=us-east-1
HEADWATER_MODEL=us.amazon.nova-2-lite-v1:0
AWS_BEARER_TOKEN_BEDROCK=your-local-bedrock-api-key
```

Alternatively, leave the bearer key blank, set `AWS_PROFILE=your-profile`, and authenticate that profile with AWS (for example, `aws sso login --profile your-profile`). Existing standard AWS environment credentials also work. For implicit default-profile or deployed role credentials, set `HEADWATER_AWS_ENABLED=true`. Restart `npm run dev`; the start/dev scripts load `.env`. Model access and IAM permissions must allow Bedrock invocation and the selected cross-region inference profile. Configuration presence does not establish successful access.

The US profile routes within its supported US destinations; use an inference profile allowed by your account. See [Bedrock setup and cost controls](docs/BEDROCK.md). Never put keys in browser JavaScript, source control, a URL or chat.

Live mode uses the actual `deepagents` package and `ChatBedrockConverse`, read-only analytical tools, and evidence/exposure/response specialists. All model roles share a maximum of **eight calls per investigation**, each limited to **1,200 output tokens**. Extended reasoning is left off, provider retries are disabled, and only one investigation can run at a time. The trace records provider-reported input/output token counts when available. These controls limit use; they are not an exact dollar spending cap.

The local server binds to loopback. Set `HEADWATER_API_TOKEN` before exposing it beyond your device; the interface reads a bearer token from session storage under `headwater-api-token`.

**No live Bedrock request has been verified without configured credentials.** Tests exercise actual deepagent tools using a scripted model without a provider call. The browser labels key-free calculations as a local workflow. An explicit OpenAI fallback remains available in `.env.example`; it is never selected automatically.

## What works

- Interactive MapLibre 3D terrain with orbit, pan, 2D/3D controls, upstream context and selectable layers, using real cached elevation tiles.
- Exercise assistance requests, resource capabilities/capacities, assignment and mission progress with an audit log.
- Candidate access along actual mapped roads, closure injection and review gates; no invented paths, safe-route guarantee or arrival estimates.
- Exercise contact desk and a configurable Photon SIP / ElevenLabs opt-in test-call adapter. No call has been placed.
- Versioned local-server persistence, with labelled browser-local persistence in the static preview.
- **433 assessed building locations + 5 assessed crossings**, derived from Copernicus EMSR927 AOI01.
- Relative-terrain screen using a priority-flood drainage proxy and three assumed channel stages.
- Retrospective intersection with a mapped post-event mass-movement extent, including boundary sensitivity.
- Before/after changes between scenario runs; asset selection and explanations.
- Publication-date evidence gating, with conservative retrieval cutoffs where availability is unknown.
- Competing mechanism register, including a method-dependent precursor interpretation.
- **24 real Sentinel-2 STAC scene records**, with capture timestamps, cloud cover and provider links.
- AWS Bedrock/deepagents backend integration, actual tool execution events, and a labelled offline workflow.
- Point-asset GeoJSON import, explicit unknowns outside the terrain window, and JSON/GeoJSON export with provenance.
- Responsive desktop/mobile interface and a keyboard-driven guided demonstration.

The asset sample was selected for post-event damage assessment. It is **not all buildings in the valley**, a representative population, or an independent pre-event prediction dataset. Asset geometry is a point, not a footprint. Damage grades are stored in a separate source layer and excluded from screening inputs.

## Demo

Click **Run guided demo**, then press **N** to advance:

1. Explore the real 3D terrain, assessed assets and exercise assistance requests.
2. Change the assumed stage from 10 to 20 m and inspect the exposure bands.
3. Review a resource proposal, assign an exercise team and inspect access constraints.
4. Inject a mapped-road closure and show the affected mission returning to review.
5. Record an exercise contact outcome; acknowledgement is separate from rescue completion.
6. Audit the evidence chronology and run a labelled investigation.

**P** toggles presentation layout. Export the assessment to retain assumptions, source hashes, geometry and limitations. See [the two-minute script](docs/DEMO.md).

## Checks

```sh
npm test
npm run check
npm run build
```

The data checksum test validates the bundled analytical files against `public/data/manifest.json`. Numerical checks cover drainage termination, depression handling, no-data propagation, coordinate alignment, monotonic stage sensitivity, polygon holes, source-time cutoffs and input validation. Browser QA covers interactions, exports and responsive layout; see `scripts/browser-qa.mjs` and the local `outputs/` results.

For browser checks, start the local server, install Chromium once with `npx playwright install chromium`, then run `node scripts/browser-qa.mjs` and `node scripts/operations-browser-qa.mjs`. Both use a disposable browser exercise and force key-free mode; they do not send paid model requests or place calls, even when real credentials are configured.

To reproduce public-data preparation, install Python 3.12+, NumPy and Pillow. Obtain the public CEMS GeoPackage through the source URL in the manifest and save it as `data/raw/cems-aoi01.zip` (the endpoint returns SQLite GeoPackage bytes despite the `.zip` URL). Run:

```sh
python scripts/prepare_data.py
```

The preparer verifies geometry types, derives GeoJSON, downloads public terrain tiles, fetches public STAC metadata and writes checksums. The raw files are ignored in Git. The prepared data is included for a reliable event demo.

## Architecture

- `src/analysis.mjs`: pure, shared geospatial screening functions.
- `src/evidence.mjs`: dated source register and competing mechanisms.
- `src/agent.mjs`: LangChain deepagents, analytical tools and a shared model-call budget.
- `src/models.mjs`: server-only Bedrock authentication/model configuration.
- `src/operations.mjs`: mapped-road routing, resource matching and exercise lifecycle.
- `src/operations-store.mjs`: atomic local-server persistence with version checks.
- `src/voice.mjs`: approved, allowlisted Photon SIP / ElevenLabs test-call adapter.
- `public/`: buildless interface, MapLibre 3D terrain, 2D canvas analysis and prepared data.
- `server.mjs`: local HTTP/API server; API credentials stay server-side.
- `scripts/build.mjs`: reproducible static demo build; excludes the server agent module from browser distribution.
- `docs/`: scientific scope, source register, submission draft, track requirements, demo script and remaining integrations.

The optional static build runs the same analytical functions and saves exercise operations in that browser. Live model calls, test calls and shared operations persistence require the local Node server. Rescue records and resource positions are synthetic exercise data, distinct from the real historical hazard layers.

## Sources and attribution

© European Union, 2026. Copernicus Emergency Management Service, EMSR927 AOI01 GRA PRODUCT v1. Only derived assessment vectors are bundled. The underlying commercial Pleiades Neo and WorldView-3 imagery is not redistributed. [Copernicus terms](https://emergency.copernicus.eu/mapping/ems/terms-and-conditions).

Terrain: Mapzen Terrain Tiles on AWS, including SRTM/GMTED sources identified in downloaded tile metadata. [Attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

Sentinel-2 catalogue: Element 84 Earth Search / Copernicus. Image previews are provider-hosted and not an automated change-detection product. Original source URLs and file checksums are in the manifest and source register.

## Delivery

The application runs **locally**. Source repository: [lamdiv/Headwater](https://github.com/lamdiv/Headwater). Publishing the code does not deploy a hosted app. No Devpost submission has been performed. See [the completion audit](docs/COMPLETION_AUDIT.md) for the verified scope and the provider-dependent features that still require your account configuration.

## Event readiness

Choose **Science & Discovery** as the sole main track. Amazon Practical AI is a coherent additional target. LangChain requires a demonstrated real deepagent run. Peri requires an actual qualifying consultation during the event; no consultation has been performed by this project. CoStar and hardware integrations are not implemented. The Photon SIP adapter is configurable but unverified; follow [calling setup](docs/VOICE.md) and demonstrate a real eligible integration before claiming that sponsor track.

The supplied packet requires a public GitHub repository created November 13–15, 2026, submission by **November 15, 8:00 a.m. Eastern**, and an in-person demonstration of at most two minutes. Confirm the repository visibility and creation date meet those requirements before submitting. No Devpost submission has been performed here.
