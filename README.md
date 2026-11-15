# SafeWay

A local disaster-response demo with two scenarios: **Rasuwa flood** and **Houston flood**. Houston has three fully mapped floods in different parts of the city: **Hurricane Harvey (August 2017)** in Kingwood and Lake Houston (historical), a **downtown flash flood** on Buffalo and White Oak Bayous, and a **Brays Bayou flash flood** in Meyerland (both hypothetical). Each shows water rising by estimated depth, highly, moderately and lightly affected zones (over 3 ft, 1–3 ft, under 1 ft), and risks with mitigations. Nothing about the flood is drawn until you press Start. The wave button by the map controls opens a county-wide Harris County flood depth map (levels 1–7, 100-year or 500-year floodplain).

Start the simulation. The hazard expands across the 3D map, people inside its warning area are identified, and connected warning phones ring automatically. Answering establishes an actual WebRTC audio connection carrying a spoken destination and a three-minute drill instruction. The resident can acknowledge, share simulated route progress, send SOS, and stop sharing. A separate responder device follows progress and acknowledges SOS requests. Real device GPS is optional, separately consented, and labelled separately from simulated movement.

## Run

```sh
npm ci
npm run dev
```

Open `http://localhost:4173/` on the host computer. The launcher also starts a local HTTPS service on port 8443 for other devices. It creates a private, short-lived local certificate and saves the exact phone/responder URLs in `.sites-runtime/response-demo-links.json`. These files are ignored by Git. Device links are deliberately absent from the dashboard.

On each device, open its private URL, accept the local certificate warning, and tap **Connect** once. Keep the pages open. Use the same reachable Wi-Fi or personal hotspot. The dashboard must remain open: it is the WebRTC voice caller. No microphone is requested; the message is streamed as audio into the peer connection. This is an in-browser ringing call, not a background/native phone-network call. A network that isolates clients or blocks peer traffic needs a different LAN/hotspot or a TURN relay; no external relay is configured.

Then choose **Rasuwa / Flood** or **Houston / Flood** and press **Start simulation**. There is one Start/Pause/Resume control and one Reset control. No public feed loading, sponsor setup, water sliders or second workflow is needed for this demo.

## Device API

- `POST /api/demo/connect` — exchange a private device link key and explicit consent for a role-scoped session.
- `GET /api/demo/state` — operator, own-phone or responder view, according to authorization.
- `POST /api/demo/trigger` — start an exercise (`{"scenario":"rasuwa"}` or `{"scenario":"houston"}`), with dashboard authorization or the private trigger key from the generated endpoint. The trigger key only starts demo scenarios; it cannot read tracking or control calls.
- `POST /api/demo/control` — start/pause/reset/switch scenario, operator only.
- `GET/POST /api/demo/signals` — session-isolated WebRTC SDP/ICE signaling.
- `POST /api/demo/call/claim` — dashboard-only caller lease; one owner per negotiation.
- `POST /api/demo/call` — call lifecycle, restricted to the owning phone/operator.
- `POST /api/demo/action` — acknowledge movement, SOS or stop sharing.
- `POST /api/demo/location` — real GPS upload, only when explicitly enabled.
- `POST /api/demo/sos/ack` — responder or operator acknowledgement.

Locations, sessions, calls and SOS are held in memory. Reset invalidates previous calls/actions; Stop Sharing removes GPS, withdraws responder tracking, and rejects later GPS uploads. Live phone positions stop being labelled online after ten seconds without a heartbeat. Restart clears resident data. Private connection keys are persisted locally for stable demo URLs.

## Scope

Both hazards, people, destinations, time-to-leave and route movement are authored **simulations**, not current disasters, calibrated forecasts or verified public evacuation instructions. The flood front follows the cached Rasuwa terrain drainage path; the Houston floods come from mapped flood outlines (FEMA’s Harvey inundation boundary; FEMA flood zones for the two hypothetical floods) with depth estimated from USGS elevation (`scripts/houston-floods.py`). The warning zone includes an exercise lead time and buffer. OSM streets and derived building extrusions provide geographic context; missing building heights use a display fallback. Nepal relief uses cached Mapzen/SRTM tiles at actual scale. Real GPS is not substituted for the resident's scenario position.

Warnings are actual WebRTC voice messages, generated locally from authored drill text. No real phone-number calls, SMS, public emergency dispatch, external AI request or hosted deployment is needed. Previous monitoring/sponsor functionality remains in the repository for reference, outside the new default experience. Main is preserved; changes are on `safeway`.

## Verify

```sh
npm test
npm run check
npm run build
npx playwright install chromium
npm run qa:response
```

The response browser test uses three independent browser contexts and checks real inbound RTP audio bytes and decoded audio energy/waveform for **both** scenarios, automatic ringing, answering, complete spoken calls, movement, consented GPS, SOS acknowledgement, stop sharing, reset and mobile layout. See `outputs/response-browser-qa.json` and `outputs/response-*.png` after running. The transport test isolates map rendering to avoid software-GPU contention. `node scripts/response-visual-qa.mjs` separately verifies actual full-height 3D maps and both hazard layers. Same-host browser verification does not certify a particular guest Wi-Fi or phone browser.

## Call reliability

A phone can answer before an offer exists. Only an audio-enabled dashboard may claim the caller lease; another dashboard cannot send competing SDP. Each connection attempt carries a generation, and stale candidates/statuses cannot affect its replacement. Transient signaling requests retry idempotently. A failed peer reconnects automatically, up to three attempts, with a specific failure reason when exhausted.

`npm run qa:calls` verifies eight repeated real voice calls across both scenarios, including early answers, two dashboards, a lost offer response, a temporary signaling error, peer recovery and caller takeover. Each new attempt must receive its own nonzero decoded audio; old call statistics cannot satisfy the test.
