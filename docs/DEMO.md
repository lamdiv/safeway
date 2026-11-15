# SafeWay response demo

Before judging: run `npm run dev`. Use the private URLs in `.sites-runtime/response-demo-links.json` to connect a warning phone for the selected scenario and a responder device. Tap Connect on each. Use the same reachable network and keep the dashboard and both device pages open. Enable real GPS on the warning phone only if you want to demonstrate consented device location alongside the labelled scenario route.

1. Choose Rasuwa / Flood. Press Start simulation. A continuous flood front follows the valley; the dashed warning zone approaches the demo residents.
2. The warning phone rings automatically when its resident is inside the warning zone (roughly 13 seconds into the Rasuwa exercise). Answer. The spoken destination and three-minute drill instruction arrive over an actual WebRTC audio track.
3. After the call, tap I'm on my way. Show the moving resident on the dashboard and responder map, with route progress clearly labelled simulated.
4. Send SOS from the phone. Acknowledge it on the responder device. The acknowledgement appears on the phone.
5. Stop Sharing. GPS disappears from responder tracking and new uploads are refused.
6. Switch to Houston / Fire and connect the Houston warning-phone URL. Press Start simulation. The wind-driven fire warning reaches the lead demo resident almost immediately; repeat the same call/response loop.

The dashboard contains no device URLs or extra setup workflows. It has only scenario selection, Start/Pause/Resume and Reset. No observed-current disaster or real-world evacuation claim should be made. Keep the dashboard open because it originates WebRTC voice audio.
