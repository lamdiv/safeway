# Local demonstration audit

The deliverable is a working local HackPrinceton research and response-exercise demo. The app runs locally; its source repository is https://github.com/lamdiv/Headwater. Source publication does not deploy a hosted application.

## Requirements and evidence

| Requirement | Current implementation and verification |
|---|---|
| Upstream hazard evidence | Dated HiRISK, ICIMOD, WMO and qualified Nature entries in `src/evidence.mjs`. Observation and publication times are separate. Early cutoffs withhold later interpretations. Unit and browser chronology checks pass. Nature full-text verification remains pending and visible. |
| Real downstream geography | Bundled Copernicus EMSR927 assessment: 433 building points, five crossing points, mapped impact and road geometry. Historical Mapzen terrain and 24 real Sentinel-2 STAC metadata records are cached. SHA-256 tests validate all prepared files against the manifest. |
| Explainable per-asset scenario screening | Shared terrain-stage screen and retrospective geometric intersection in `src/analysis.mjs`. A 10 m assumed stage yields 54 higher-band records; 20 m yields 101. These are selected assessed assets and ordinal scenario bands, not regional population risk or probabilities. Numerical and missing-data tests pass. |
| Interactive 3D intelligence workspace | MapLibre real terrain, pan/orbit, 2D/3D switching, upstream context, layers, request selection and stage recomputation. Chromium exercises actual WebGL terrain. Historical source/impact layers respect the selected availability cutoff. |
| Disaster management and rescue workflow | Synthetic requests, capability/capacity matching, mapped-edge candidate access, human assignment, access review, mission progress and closure-driven replanning. Tests cover eligibility, disconnected roads, double allocation and invalidation after closure. Browser checks exercise the connected workflow. |
| Calling and contact intake | Exercise scripts and contact outcomes are implemented. A Photon SIP / ElevenLabs outbound adapter requires an allowlisted opt-in test recipient and explicit operator approval. Mocked provider tests preserve accepted/acknowledged/rescued distinctions. No real call or verified transcript ingestion has occurred. |
| AI integration and low-cost model choice | Bedrock Converse / Nova 2 Lite through the installed LangChain AWS adapter and actual deepagents. A scripted model executes real evidence and exposure tools; eight shared model calls, bounded output and context checks are tested. No live Bedrock request is verified without credentials. |
| State and auditability | Versioned operations, atomic local-server persistence, conflict handling and event history. Tests verify concurrent updates and reloading persisted state. The standalone static build uses labelled browser-local storage. |
| Reproducible export | Browser downloads a report containing assumptions, source manifest, evidence, screening results, GeoJSON and exercise operations. Unknown physical metrics and non-forecast claims remain explicit. |
| Clear presentation | `docs/DEMO.md` provides the two-minute pitch. The six-step keyboard-guided demo and presentation shortcut are checked in Chromium. `docs/SUBMISSION.md` and `docs/TRACKS_AND_NEXT_STEPS.md` document the submission framing and eligibility limits. |

## Validation

- `npm test`: 37 passing tests.
- `npm run check`: JavaScript syntax and document checks pass.
- `npm run build`: produces the standalone static demo; excludes server-only model, persistence and voice modules.
- `scripts/browser-qa.mjs`: scenario changes, evidence dates, historical map-layer gating, cutoff-safe explanations, export, guided presentation and mobile layout.
- `scripts/operations-browser-qa.mjs`: actual WebGL 3D, resource assignment, access gate, mission progress, closure invalidation, exercise contact, call configuration gate, request intake and mobile layout.
- Browser outputs and screenshots are stored locally in `outputs/`; test operations use disposable browser state and do not mutate the operator's server exercise.

## Limits and account-dependent checks

Depth, velocity, arrival time, structural force, lake failure timing and calibrated disaster probabilities are not implemented. The numerical engine is coarse relative-terrain screening. Satellite scenes are retrieved catalogue metadata, not a live precursor detector. The selected asset sample does not establish regional accuracy. Exercise teams and people are not real rescue records, and mapped paths do not establish passability.

To demonstrate live AI, configure AWS credentials locally and verify an actual Nova 2 Lite investigation. To demonstrate a Photon integration, configure an eligible line and voice agent and perform an approved opt-in test. Neither external integration has been represented as verified.

The supplied event packet requires one main category, a public repository created during the permitted November 13–15 window, a submission by November 15 at 8 a.m., Discord handles, and an in-person demo of at most two minutes. Those are participant submission actions. Confirm GitHub repository visibility and creation time before submitting. No Devpost submission, qualifying FDE consultation or organizational outreach has been performed.
