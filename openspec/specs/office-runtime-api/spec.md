# office-runtime-api Specification

## Purpose
Defines the single versioned contract between the office runtime and every client, so
the 2D office UI, tests, and future clients all read and drive the office the same way and
can evolve independently.

## Requirements

### Requirement: Read and write endpoints

The runtime SHALL expose HTTP endpoints to list, create, read, update, and delete
agents and departments, to manage an agent's task queue, and to read sessions, runs,
and adapter capabilities. Requests and responses SHALL use a single documented
serialization format for the whole API.

#### Scenario: Managing the workforce

- **WHEN** a client creates a department, creates an agent in it, and appends a task
- **THEN** each call returns the created resource with its identifier and the changes
  are visible to subsequent reads

#### Scenario: Unknown resource

- **WHEN** a client reads an identifier that does not exist
- **THEN** the runtime returns a not-found result and does not create an empty record

#### Scenario: Invalid payload

- **WHEN** a client sends a request that violates the documented shape
- **THEN** the runtime returns a validation error that names the offending fields and
  applies no partial change

### Requirement: Command semantics follow the domain

Runtime commands that change agent runtime, such as starting or cancelling a run,
closing a session, or writing input, SHALL be expressed as explicit commands rather
than by writing to state directly, and each command SHALL report the resulting agent
runtime state.

#### Scenario: Starting a run over the API

- **WHEN** a client issues a start-run command for an agent with a next task
- **THEN** the response reports the affected task, run, and session identifiers and
  the agent's resulting runtime state

#### Scenario: Conflicting command

- **WHEN** a client starts a run for an agent that is already running
- **THEN** the runtime returns a conflict result and does not start a second run

#### Scenario: Re-queueing a finished task

- **WHEN** a client re-queues a task that has finished
- **THEN** the response reports the task back in the queue with no result and the
  agent can be started on it again

### Requirement: Live session prompting

A client SHALL be able to send an additional prompt to a live session over the API,
and the system SHALL deliver it with the harness's steering or follow-up semantics,
reporting which was applied. The prompt text SHALL be delivered unmodified.

#### Scenario: Prompting a running session

- **WHEN** a client sends a prompt to a running session
- **THEN** the response reports the delivery semantics used and the run continues

#### Scenario: Prompting without the capability

- **WHEN** a client sends a prompt to a session whose adapter cannot accept mid-run
  input
- **THEN** the runtime returns an unsupported-capability error and the run is
  unaffected

#### Scenario: Prompt rejected on an ended session

- **WHEN** a client sends a prompt to a session that has already reached a terminal
  outcome
- **THEN** the runtime returns an explicit error and creates no new run

### Requirement: Runtime telemetry exposure

Agent and session payloads SHALL include current context usage as tokens used,
context window, and percent complete, together with cumulative session tokens and
cost, when the harness provides them, and SHALL include the derived context-pressure
level for the agent. Unavailable telemetry SHALL be marked as unavailable rather than
reported as zero.

#### Scenario: Snapshot carries telemetry and pressure

- **WHEN** a client reads an agent whose session reports usage
- **THEN** the response includes context usage and the agent's context-pressure level

#### Scenario: Unavailable telemetry is marked

- **WHEN** a client reads an agent whose session provides no usage information
- **THEN** telemetry fields are marked unavailable and pressure is reported as
  unknown

#### Scenario: Telemetry stays in sync

- **WHEN** new usage is reported for a live session
- **THEN** subscribed clients receive an updated telemetry event for that session and
  a pressure event for its agent when the level changes

### Requirement: Dependency and result visibility

Task payloads SHALL include their dependency identifiers, whether they are currently
blocked and by which tasks, and, once recorded, their result. The API SHALL reject a
dependency that would create a cycle.

#### Scenario: Blocked task is explained

- **WHEN** a client reads a task whose dependencies are unfinished
- **THEN** the response reports it as blocked and lists the unfinished dependency
  identifiers

#### Scenario: Result is readable

- **WHEN** a client reads a completed task
- **THEN** the response includes the recorded result with its final output and status

### Requirement: Realtime event stream

The runtime SHALL expose a realtime stream over which clients receive every change to
agents, tasks, sessions, and runs as it happens. Each message SHALL carry a schema
version, an event type, a timestamp, a sequence number, and a payload that identifies
the affected resource.

#### Scenario: Live updates

- **WHEN** a client is subscribed and an agent's task status or terminal output
  changes
- **THEN** the client receives a corresponding event without polling

#### Scenario: Snapshot then deltas

- **WHEN** a client connects to the stream
- **THEN** it first receives an initial snapshot of the current state and then only
  subsequent events, so no state change is missed between snapshot and subscription

#### Scenario: Filtered subscription

- **WHEN** a client subscribes with a filter such as a single agent or a department
- **THEN** it receives only events matching that filter plus the corresponding initial
  snapshot

### Requirement: Contract versioning

Realtime messages and HTTP responses SHALL declare a contract version. Additive
changes SHALL be made without increasing the major version, and a client SHALL be
able to ignore event types it does not recognize without breaking.

#### Scenario: Unknown event type ignored

- **WHEN** a client receives an event whose type it does not recognize
- **THEN** the client continues processing subsequent events

#### Scenario: Version is discoverable

- **WHEN** a client connects or reads the API root
- **THEN** it can determine the contract version in use

### Requirement: Consistent errors

Every failure SHALL be reported with a stable machine-readable error code and a
human-readable message, using the same shape across HTTP responses and realtime
command results.

#### Scenario: Uniform error shape

- **WHEN** two different failures occur, such as validation and conflict
- **THEN** both are reported with the same error shape and distinct codes

### Requirement: Local-first access by default

The runtime SHALL bind to the local machine by default and SHALL NOT require
authentication for the MVP, while exposing authorization as an explicit extension
point so it can be added without changing resource contracts.

#### Scenario: Default local binding

- **WHEN** the runtime starts with default configuration
- **THEN** it is reachable only from the local machine

#### Scenario: Extension point for auth

- **WHEN** an authorization mechanism is later introduced
- **THEN** resource payloads and event types do not need to change to accommodate it

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

### Requirement: Agent profile endpoints

The API SHALL expose an agent's description and instructions for reading and
updating. Reading SHALL return the saved profile, using empty strings when a field
has never been set and never fabricating content. Updating SHALL validate the payload,
apply it atomically, and return the stored profile; an invalid payload or an unknown
agent SHALL return the uniform error shape and leave the stored profile unchanged.

#### Scenario: Read profile

- **WHEN** a client reads an agent's profile
- **THEN** the response reports the agent's description and instructions, or empty
  strings when unset

#### Scenario: Update profile

- **WHEN** a client saves a description and instructions for an agent
- **THEN** the response reports the stored values and a later read returns the same

#### Scenario: Invalid profile payload

- **WHEN** a client sends a profile field that is not a string, or an over-long value
- **THEN** the request is rejected with the uniform error shape and the stored
  profile is unchanged

#### Scenario: Unknown agent

- **WHEN** a client reads or updates the profile of an unknown agent
- **THEN** the API returns a not-found error using the uniform error shape
