# SafeWay contract v1

All geometry is WGS84 GeoJSON; all persisted timestamps are UTC ISO 8601. The Houston demo fixture is synthetic. No CoStar/Vexcel/Matterport payload or identifier is represented as real sponsor evidence.

Entities: Incident {id,status,elapsed,safetyVersion}; Event {id,runId,sequence,at,type,summary}; Property {id,approvalUntil,checkInId,entrances}; Approach {id,propertyId,entranceId,geometry,preapproved,evidenceId}; Entrance {id,state,observedAt,validUntil,interiorVerified}; Evidence {id,propertyId,reference,source,observedAt,validUntil,simulated,finding,coverage,rights}; Guidance {revision,status,reason,missingFacts,route,entrance,checkInId,validUntil}; Participant {id,consentUntil,sharing,position,positionSource}; Delivery {id,revision,preparedAt,fetchedAt,openedAt,acknowledgedAt}; SOS {id,participantId,position,createdAt,acknowledgedAt}.

## API

- GET /api/operator/state → redacted operator snapshot, never resident/session/invite tokens.
- POST /api/operator/control {action:start|pause|resume|step|reset|end,actionId,runId?}. A stale supplied runId is rejected. Reset ends/scrubs the prior run and creates a new ID.
- POST /api/operator/invites → two enrollment links; privileged operator action, not included in state/export.
- POST /api/operator/sos/ack {sosId,actionId,runId}.
- GET /api/operator/export → de-identified event history only.
- POST /api/resident/join {invite,consent:true,shareLocation:boolean,actionId} → session token, participant ID, exercise position. Invite is one-use; repeating the same join action is idempotent.
- GET /api/resident/state with Authorization: Bearer session → only that resident's state. Fetched is distinct from opened and acknowledged.
- POST /api/resident/position {coordinates,actionId} → rejects stopped/expired sharing and ended runs.
- POST /api/resident/action {type:open|acknowledge|check_in|safe|sos|stop_sharing,revision?,actionId}. Guidance-dependent actions require the current active revision. SOS needs no position. Duplicate action IDs with identical bodies are idempotent; changed bodies conflict.

Resident guidance expires after five seconds without a fresh response; the client removes directions while offline. Polling is one second. Server consent is 15 minutes. Property/exterior/interior/staff evidence has explicit expiry. Unknown/stale/mismatched evidence withholds guidance. Geometry touches count as hazard intersection, including a line crossing a polygon with both endpoints outside.

Policy: affected enrolled resident + shared current location + preapproved approach + no closure + no hazard intersection + current property approval + matched, permitted exterior evidence + current explicitly open entrance + verified indoor/check-in coverage. Eligibility is code, never an LLM decision.

Safety changes synchronously withdraw route/entrance/check-in and increment revisions before deferred evidence evaluation. Workers are leased to runId, safetyVersion and participant generation; stale or ended completions are discarded. End revokes sharing and clears active/SOS coordinates. History stores no coordinates, tokens, or resident identifiers.
