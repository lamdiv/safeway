# Current demo status

The default experience is now the focused Rasuwa flood / Houston flood response simulation requested by the user. It replaces the source-loading and scenario-slider dashboard.

Implemented: 3D OSM map, terrain-following valley corridor display, three fully mapped Houston floods (Hurricane Harvey 2017 plus two hypothetical flash floods) with affected zones and mitigation guidance, flood overlays hidden until Start, pre-impact warning zones, deterministic person exposure, automatic per-device warning calls, actual WebRTC voice transmission, in-browser ring/answer/end, destination and three-minute drill instruction, acknowledgement, simulated route movement, opt-in live device GPS, responder tracking, SOS and acknowledgement, Stop Sharing, pause/reset and stale-call isolation. Device URLs are private local files and are not shown in the dashboard.

The launcher provides localhost HTTP plus LAN HTTPS over shared application state, with a locally generated certificate. Phone pages need a Connect tap and must stay open. Native background calling and blocked/isolated guest-network traversal are not claimed; no TURN relay or real telephony provider is configured.

All hazard progression, people, routes, destinations and timing are authored exercises. The Rasuwa corridor follows the cached terrain profile; Houston floods use mapped flood outlines with estimated depth (FwDET on USGS elevation). Neither is a calibrated hydraulic solver or a public emergency instruction.

Real GPS is separately consented and labelled, never moved into Nepal/Houston or used as an exercise resident's physical location. Stop Sharing removes it and rejects further uploads. Active resident data is in memory and is cleared on restart.

Earlier source-monitoring, AI and sponsor functionality is retained outside the default demo and is not required for this workflow. CoStar/Vexcel matched-property verification and successful live Bedrock inference remain unclaimed. Main is preserved; development uses the safeway branch.

## Verification

83 unit/API tests pass. Both scenarios pass three-context browser transport checks with nonzero incoming RTP bytes, decoded audio energy and remote waveform amplitude, complete spoken calls, consented GPS, simulated route movement, responder SOS acknowledgement, arrival and Stop Sharing. The transport test isolates the maps to avoid software-rendering contention; the separate visual test uses the actual OSM renderer and verifies full-height 3D flood/fire layers, Nepal terrain, and desktop/mobile layout. Syntax and production build checks pass. These checks do not certify connectivity between physical phones on an isolated guest network.

The generated private LAN HTTPS trigger and warning-phone URL were also verified against the running service: localhost dashboard caller → private HTTPS trigger → automatic HTTPS-phone ring → nonzero decoded WebRTC speech. The browser accepted the local certificate for this check. Physical-device connectivity still depends on the Wi-Fi/hotspot allowing peers.

## Intermittent call fix

Fixed early-answer offer preparation, a blocking silent-playback unlock, competing dashboard callers, stale SDP/ICE/status updates and dropped signaling requests. A caller lease and attempt generation now isolate each connection. Connection failures retry automatically up to three attempts, while intentional end/reset/sharing revocation cannot restart audio. An unarmed dashboard cannot steal a call from an armed caller.

88 unit/API tests pass. Eight consecutive browser calls passed with real decoded speech under fast answering, two dashboards, signaling failures, a forced peer loss and a closed caller tab. The existing full flood/fire workflow also passed. Run `npm run qa:calls` for the reliability checks.
