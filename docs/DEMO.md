# SafeWay flood-response judging demo

Connect the red, yellow and green phones plus the responder using the private device URLs. `person=houston-a`, `houston-b`, and `houston-c` select the three Houston demo residents; the Rasuwa equivalents use `rasuwa-a`, `rasuwa-b`, and `rasuwa-c`. Keep the dashboard open for WebRTC audio.

1. Select Houston / Hurricane Harvey and press Start. Show red, yellow and green cohorts, per-person simulated arrival times, and immediate written guidance. Every connected group rings, including green monitoring updates.
2. Show the continuous water surface. Switch Street → Terrain → 3D; all views follow the same authored flood clock. The county depth map remains separate reference data.
3. Early in the drill, select 4× progression. The unsafe red route is withdrawn before a replacement can be issued. Its old voice call stops; the phone receives current refuge guidance and a replacement call. A rescue task appears on the responder automatically, with no resident SOS press.
4. Acknowledge the rescue task from the responder. The phone shows that acknowledgement. Shelter acknowledgement does not count as evacuation arrival, and stale route acknowledgements are rejected.
5. Green remains a monitoring cohort, not a safety guarantee. Yellow gets updated time and movement guidance. Stop Sharing removes real GPS and rejects new uploads.

Response agent (LangChain Deep Agents): in Houston, press **Plan the response** in the sidebar during a drill. The agent plans with a to-do list, reads the live drill through read-only tools, hands work to a risk-analyst and a route-checker subagent, and returns a short plan with the steps it took and the tokens it used. It needs a working model provider (AWS Bedrock by default).

Princeton drill (the differentiator): choose **Princeton / Drill**. You are in a room in Rabinowitz Hall (Princeton University). Open the `princetonPhone` link (and `princetonTeammatePhone` for a second person) from `.sites-runtime/response-demo-links.json` and tap Connect. Press **Start simulation**: the warning call rings immediately, without waiting for the water. An artificial flood then rises out of Lake Carnegie and Stony Brook (connected-bathtub model on USGS 3DEP elevation), spreads up the valley and reaches the building at about 93 s. This is deliberately not realistic: the hall is ~47 m above the lake, so the forced water floods most of the area. Answer: the call says the flood is coming to your room and to leave now, and the phone shows the building's Matterport 3D tour (public model P3S6VUTP3qB) and the route to the drill assembly point on high ground to the west. Red, yellow and green zones (over 3 ft, 1–3 ft, under 1 ft) come from the same depth grid as the water. The flood, timing and assembly point are exercise inventions.

Matterport SDK (Princeton, dashboard on localhost): the building panel runs the Matterport SDK instead of the plain tour. It places a live drill tag inside Rabinowitz Hall that tracks the rising water ("River water is N ft below this building…", then "Flood water is here"), and adds Ground floor, Floor plan and Walk inside buttons. The SDK key is restricted to localhost, so phones and other hosts keep the embedded tour. Run `node scripts/matterport-setup.mjs` once after `npm ci` to build the SDK bundle.

Map layers: the layers button under the flood-map button switches the base map between Streets and Aerial (USGS National Map imagery in the US, Esri World Imagery for Rasuwa) and toggles flood water, affected zones, 3D buildings and evacuation routes in every scenario. Choices are remembered in the browser.

Arrival times, routes, movement speeds and refuge viability are exercise assumptions. The historical Houston footprint and estimated-depth data do not establish a calibrated flood forecast or an approved real-world refuge.

Vexcel buildings (Houston): open Map layers → tick "Vexcel buildings (Houston)". After Start, real Vexcel footprints show coloured by flood depth. Click one to see its depth and ground elevation, plus bird's-eye photos from the north, east, south and west, or from straight down (Top). To rebuild the footprints: `set -a; . ./.env; set +a; python3 -I scripts/vexcel-houston.py`.

## Two-way voice agent (ElevenLabs)

The warning call is one-way, so the phone also offers **Talk to SafeWay**: a two-way voice conversation with an ElevenLabs agent ("SafeWay Flood Responder"). It appears on the phone for the whole drill, and as **Talk back to SafeWay** on the incoming-call screen.

- **Flood questions:** the `get_flood_status` tool returns the caller's live zone, when the water arrives, what to do, where to go, and (at Princeton) how far below the building the water is.
- **Getting out:** the `get_evacuation_route` tool.
  - **Princeton:** the agent first asks for the floor and the room or sign the caller can see. It then gives the way out one step at a time: the hallway, Stairway 7 (with the walking distance from the Matterport scan), stairs not the elevator, the Shapiro Walk entrance, then west to the assembly point.
  - **When the route changes:** if the stair is blocked or the water has reached the building, it switches to "go up to Level 3, don't go down" and tells the caller to report being trapped.
  - **Houston:** it gives the route to the assembly point, or shelter-in-place advice if the route was withdrawn.
- **Trapped:** the `report_trapped` tool sends the floor, location, number of people, injuries, water level and whether they can move. This becomes a rescue request: the responder sees **TRAPPED · VOICE REPORT** with the details, and the dashboard flags it.

The tools run in the phone's browser as ElevenLabs client tools and call this server (`/api/demo/voice/tool`), so the drill can stay on localhost. The phone gets a short-lived signed session URL from `/api/demo/voice/session`; the ElevenLabs key never reaches a browser. The agent requires sign-in, so only our server can start sessions. The phone needs HTTPS for the microphone (use the `https://…:8443/phone` links).

Setup, once:

    node scripts/voice-setup.mjs                                        # bundle the ElevenLabs browser client
    node --env-file=.env scripts/rabinowitz-building.mjs                # building guide from the Matterport scan
    node --env-file=.env scripts/elevenlabs-agent.mjs                   # create/update the agent, saves HEADWATER_VOICE_AGENT_ID

`.env` needs `ELEVENLABS_API_KEY` and the Matterport token. The team's existing "Evacuation Guide" agent is not changed. Its "Julis Romo Rabinowitz Building" document is attached to the SafeWay agent for search (RAG), alongside a generated "SafeWay flood drill guide" document.
