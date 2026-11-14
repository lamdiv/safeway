# Calling and request intake

The exercise workspace supports contact scripts, synthetic call outcomes and rescue requests without a phone integration. These actions are labelled exercise records; they are not proof that anyone was contacted.

## Real opt-in test calls

Photon Beta2.0 voice uses SIP, not the messaging HTTP endpoint. Connect an eligible Photon SMS/dedicated line to an ElevenLabs voice agent, following:

- https://photon.codes/docs/beta/get-started/voice
- https://photon.codes/docs/beta/cookbooks/voice/elevenlabs
- https://elevenlabs.io/docs/api-reference/sip-trunk/outbound-call

Configure the server variables in `.env.example` (the start/dev scripts load `.env`). The API key stays server-side. The SIP server, username/password and phone IDs must be copied from the actual provider accounts, not invented. The route used by `src/voice.mjs` is the documented ElevenLabs outbound SIP API. A successful response means the provider accepted the request, not that a call connected or a person acknowledged it.

Only a recipient on HEADWATER_TEST_RECIPIENTS can be called, and the operator must type CALL TEST PARTICIPANT. No call was placed during the build. No Nepal reachability or Nepali voice quality is claimed without provider and native-speaker testing.

Suggested voice-agent first message: “This is a Headwater test exercise. Are you participating in the drill? Please tell me your exercise location and what assistance you are simulating.”

The voice agent should confirm the location, number of people and assistance request, summarize uncertainty and refer real emergency situations to the appropriate local emergency channels. It must not invent safe routes, diagnose medical conditions or promise a team is coming. A real provider-to-Headwater intake webhook, verified transcript processing and provider callback verification are future integrations; manually entered exercise outcomes remain the implemented path.

## Submission distinction

A configurable adapter is not a verified sponsor integration. Claim the Photon track only after a real configured Photon SIP test call has been demonstrated and the sponsor's detailed guidelines reviewed.
