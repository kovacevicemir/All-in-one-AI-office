# Spec Delta

## Purpose

Exposes inter-agent communications through the contract the UI already consumes: the
snapshot, the realtime stream, and a read endpoint.

## ADDED Requirements

### Requirement: Communication event exposure

The API SHALL include communication events in the snapshot and SHALL emit a realtime
event when a communication is created or its lifecycle changes. It SHALL expose a read
endpoint that returns the retained communications, optionally filtered by agent. The
payload SHALL identify both agents, the kind, the status, the summary, and the related
task(s), and SHALL use the uniform error shape for unknown filters or agents.

#### Scenario: Snapshot carries communications

- **WHEN** a client receives the initial snapshot after agents have exchanged work
- **THEN** the snapshot includes the retained communication events alongside agents,
  tasks, and sessions

#### Scenario: Realtime update

- **WHEN** a communication is created or its status changes
- **THEN** a `communication.updated` event is delivered to subscribers with the same
  ordering guarantees as other realtime events

#### Scenario: Read endpoint

- **WHEN** a client reads communications, optionally filtered to one agent
- **THEN** it receives the matching retained events with the fields needed to render a
  summary

#### Scenario: Unknown filter

- **WHEN** a client filters by an unknown agent
- **THEN** the API returns a not-found error using the uniform error shape
