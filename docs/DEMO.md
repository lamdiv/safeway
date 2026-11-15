# SafeWay response demo

Before judging: run `npm run dev`. Use the private URLs in `.sites-runtime/response-demo-links.json` to connect a warning phone for the selected scenario and a responder device. Tap Connect on each. Use the same reachable network and keep the dashboard and both device pages open. Enable real GPS on the warning phone only if you want to demonstrate consented device location alongside the labelled scenario route.

1. Choose Rasuwa / Flood. Press Start simulation. A continuous flood front follows the valley; the dashed warning zone approaches the demo residents.
2. The warning phone rings automatically when its resident is inside the warning zone (roughly 13 seconds into the Rasuwa exercise). Answer. The spoken destination and three-minute drill instruction arrive over an actual WebRTC audio track.
3. After the call, tap I'm on my way. Show the moving resident on the dashboard and responder map, with route progress clearly labelled simulated.
4. Send SOS from the phone. Acknowledge it on the responder device. The acknowledgement appears on the phone.
5. Stop Sharing. GPS disappears from responder tracking and new uploads are refused.
6. Switch to Houston / Flood and connect the Houston warning-phone URL. Pick Hurricane Harvey (historical), the downtown flash flood or the Brays Bayou flash flood, and press Start simulation. The flood and its affected zones appear only after Start. Water rises from the deepest areas first, so Jordan Lee (highly affected) is warned first, then Alex Morgan (moderately), then Sam Rivera (lightly): about 33/49/73 s for Harvey, 9/65/81 s downtown and 33/57/73 s on Brays. Repeat the same call/response loop.

The dashboard contains no device URLs or extra setup workflows. It has only scenario selection, Start/Pause/Resume and Reset. No observed-current disaster or real-world evacuation claim should be made. Keep the dashboard open because it originates WebRTC voice audio.

Flood depth map: in Houston, the wave button under the map’s zoom and compass controls opens a county-wide map of estimated flood depth for all of Harris County, in seven levels (level 1 is under 1 ft, level 7 is 6 ft or more), for FEMA’s 100-year or 500-year floodplain. Zoom anywhere in the county and click for the depth at that point. Close it to return to the simulation.

Map view: Houston floods are drawn in 3D on terrain, as 30 m water columns that rise smoothly (the browser animates the same water-level curve the server uses for warnings). Terrain and water heights are exaggerated 4× because Houston is flat; the map says so. The card on the map states what each drill tests and tracks four steps live: water rises, people in danger found, warning calls go out, people reach safety. Each resident on the map carries a status tag. The sidebar button at the top left hides or shows the sidebar and is remembered in this browser.

