# Headwater — submission draft

## Tagline

Trace the hazard. Coordinate the response.

## Problem

Disaster evidence, exposed-asset assessments, assistance requests and resource plans usually arrive separately. When access changes, a response proposal must be revisited, and contact acknowledgement must not be confused with a completed rescue. Analysts and exercise coordinators need a shared, inspectable decision trail.

## What we built

Headwater is a geospatial disaster-intelligence and response exercise workspace using the 2026 Rasuwa flood as its first historical case. It combines real Copernicus assessment points, mapped impact and road geometry, cached 3D terrain and a dated satellite catalogue. Users can screen explicit exposure assumptions, inspect requests, match resource capabilities and capacities, review candidate mapped access, assign exercise teams and track mission progress.

Injecting a road closure invalidates an affected access plan. The contact desk keeps exercise acknowledgement separate from assistance completion. A configured adapter supports approved, allowlisted Photon SIP / ElevenLabs test calls; no actual call has been verified during this build.

A local Node server integrates Amazon Nova 2 Lite on AWS Bedrock through LangChain deepagents. Evidence, exposure and response specialists use read-only tools with a shared eight-call budget. Provider-reported token counts appear in the trace when returned. The key-free workflow is labelled and does not impersonate a model response. No live Bedrock request has been verified without configured credentials.

## Technical implementation

MapLibre 3D terrain, a shared ESM analytical engine, priority-flood drainage proxy, geometric intersection, temporal evidence gating, GeoPackage extraction and STAC catalogue ingestion. A mapped-road graph supports constrained candidate routing. Versioned operations state, atomic local persistence, resource eligibility, access-review gates and an audit log support the exercise lifecycle. Tests cover numerical invariants, chronology, missing/disconnected data, concurrent updates, call controls and actual SDK tool execution with a scripted model.

## Scope

The prototype is retrospective scenario screening and a response exercise, not a calibrated early-warning or operational dispatch service. Rescue requests, team positions and closure injections are synthetic and visibly labelled. The asset sample is damage-selected and incomplete. Coarse historical terrain does not support building-specific hydraulic forecasts. Routes are mapped candidates with unverified passability and no arrival-time guarantee.

## Track entries

Main: Science & Discovery (one main category).

Additional: Amazon Practical AI. LangChain requires a verified real provider/deepagent demonstration. Photon remains conditional on a real configured sponsor integration and eligibility review. No CoStar integration, hardware or qualifying FDE consultation is claimed.

## Before submitting

- Confirm https://github.com/lamdiv/Headwater is public and was created during the allowed November 13–15 window.
- Add team member names and Discord handles.
- Configure Bedrock locally and record one actual tool-using investigation.
- Review attribution, source qualifications and sponsor requirements.
- Prepare the mandatory in-person demo of at most two minutes.
- Submit by November 15, 2026, 8:00 a.m. America/New_York.

Source repository: https://github.com/lamdiv/Headwater. No Devpost submission or organizational outreach has been performed here.
