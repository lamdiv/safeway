# Current SafeWay demo status

The default is Rasuwa flood response plus three Houston flood scenarios: historical Hurricane Harvey, hypothetical downtown flooding, and hypothetical Brays Bayou flooding. Houston retains the existing estimated-depth grids and county flood-depth reference map.

## Current behavior

- Continuous GPU water replaces the 30 m columns. Scene-relative coordinates remove terrain precision artifacts; shorelines and ripples interpolate continuously. Street, Terrain and 3D views use the same scenario clock.
- Red, yellow and green cohorts get immediate written guidance and automatic WebRTC voice calls. The green demonstration resident is deliberately outside the modeled footprint, not a flooded resident relabelled safe.
- Per-person arrival countdowns derive from authored progression with six scenario seconds per playback second. Dry or unmodeled locations do not get invented arrival times.
- Changing progression to 2× or 4× re-evaluates route viability. Unsafe routes are removed, old calls canceled, and stale acknowledgements refused before replacement guidance is issued.
- Shelter guidance requires a defined viable exercise refuge near the resident. Otherwise the system withholds the unsafe route and requests rescue without inventing a refuge. A slowdown does not silently restore a withdrawn route.
- Rescue tasks are created automatically. A resident does not need to press SOS or wait for a voice call. Responder acknowledgement, refuge acknowledgement and evacuation arrival are distinct states.
- Role-scoped SSE pushes current guidance. Independent heartbeat polling preserves truthful online status. Stop Sharing removes GPS, stops notifications and rejects subsequent uploads.
- Existing caller leases, generation isolation, idempotent signaling and bounded WebRTC retries remain. Dynamic speech uses local macOS Samantha and private cache files; it does not invoke a cloud model or real phone-number network.

## Verification

103 unit/API tests pass; syntax and production build checks pass. A five-context integration test verified actual decoded speech for initial and updated red/yellow/green calls, route withdrawal, stale-ack rejection, automatic rescue and responder acknowledgement. Its local urgent-update measurement was 118 ms. Separate visual browser checks verified real GPU water, terrain and mobile layout for both regions.

These are local demo checks, not certification of physical-device Wi-Fi connectivity, rendering frame rate, calibrated arrival accuracy or real-world evacuation outcomes. Hazards, timings, demo residents, route traversal assumptions and refuges remain authored exercise data. No real emergency service is dispatched.
