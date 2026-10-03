# Spec Delta

## Purpose

Lets the office drive agents through different CLI harnesses and model vendors
without changing core behavior, so PI and DeepSeek today do not become permanent
architectural commitments. Also guarantees that an agent run through the office is
the same run you would get from the command line, with no added tokens.

## ADDED Requirements

### Requirement: Vendor-neutral ports

The system SHALL define two independent extension points: a harness adapter (how an
agent process is started, driven, and observed) and a model provider (which model and
credentials a run uses). Core orchestration SHALL depend only on these contracts and
SHALL NOT reference a vendor by name.

#### Scenario: Core stays vendor-agnostic

- **WHEN** a harness adapter or model provider is added or removed from the build
- **THEN** no file outside that adapter's own package and the registry entry requires
  modification

#### Scenario: Harness and model compose freely

- **WHEN** an agent is configured with any registered harness adapter and any
  registered model reference
- **THEN** the system starts the run without requiring a vendor-specific pairing

### Requirement: Adapter registry

The system SHALL expose a registry that maps a stable adapter identifier to its
implementation and reports each adapter's declared capabilities. Resolving an unknown
identifier SHALL fail with a typed, user-visible error rather than a fallback.

#### Scenario: Listing available adapters

- **WHEN** a client requests the available harness adapters and model providers
- **THEN** the system returns each identifier with a human-readable label and its
  declared capabilities

#### Scenario: Unknown adapter requested

- **WHEN** an agent references an adapter identifier that is not registered
- **THEN** starting that agent fails with an error naming the unknown identifier and
  the agent is left in a non-running state

### Requirement: Harness adapter contract

A harness adapter SHALL declare its capabilities and SHALL support starting a run in
a given working directory with a given instruction, writing input to a running
session, cancelling a run, and emitting a stream of normalized events for the
lifetime of the run.

#### Scenario: Starting a run

- **WHEN** the orchestrator starts a run with a working directory, instruction, and
  model reference
- **THEN** the adapter launches the underlying process and emits a run-started event
  carrying a run identifier

#### Scenario: Cancelling a run

- **WHEN** the orchestrator cancels a run that is in progress
- **THEN** the adapter terminates the underlying process and emits a terminal event
  indicating cancellation

### Requirement: Faithful, zero-overhead execution

A harness adapter SHALL pass a task's instruction to the harness as the user prompt
without modification and SHALL NOT add, prepend, or append prompt text, system prompt
content, or model calls of its own. A run started through the office SHALL produce the
same model interaction, and the same prompt-token cost, as invoking the harness
directly with the same instruction in the same working directory.

#### Scenario: Instruction reaches the harness verbatim

- **WHEN** a task with no dependency results is run
- **THEN** the user prompt recorded in the harness session is byte-identical to the
  task instruction, with no added prefix, suffix, or wrapper

#### Scenario: Dependency context is delimited, not woven in

- **WHEN** a task that has dependency results is run
- **THEN** the prompt contains a clearly delimited dependency block followed by the
  task instruction, and the instruction bytes are unchanged as the final segment

#### Scenario: No office-authored model calls

- **WHEN** a run completes
- **THEN** the session records no prompt or system message authored by the office
  beyond the task instruction and any explicitly requested dependency input

#### Scenario: Dependency input is separate, not merged

- **WHEN** a task runs with dependency results
- **THEN** those results are delivered as their own clearly labelled input and the
  task instruction itself is unchanged

### Requirement: Session telemetry

A harness adapter SHALL report, while a session is live, the current context usage as
tokens used, context window size, and percent complete when the harness provides it,
together with cumulative session tokens and cost. The adapter SHALL declare this as a
capability so consumers can distinguish unavailable telemetry from zero usage.

#### Scenario: Telemetry is reported during a run

- **WHEN** a run is in progress and the harness provides usage information
- **THEN** the adapter reports context tokens, context window, and percent complete
  for that session

#### Scenario: Unavailable telemetry is not reported as zero

- **WHEN** the harness cannot provide usage information
- **THEN** telemetry is reported as unavailable and dependent features degrade
  without error or a misleading zero

#### Scenario: Telemetry unknown after compaction

- **WHEN** the harness reports that it summarized context and has no fresh usage yet
- **THEN** percent complete is reported as unknown until new usage arrives rather
  than as a stale or reset value

### Requirement: Interactive prompting

A harness adapter SHALL, when it declares the capability, accept additional user
prompts on a live session and deliver them with the semantics the harness uses
interactively: adjusting the work in progress, or queueing work to follow it. The
adapter SHALL report which semantics were used.

#### Scenario: Prompt during a run

- **WHEN** a client sends a prompt to a session whose run is in progress
- **THEN** the adapter delivers it using the harness's steering or follow-up
  semantics and reports which was applied

#### Scenario: Prompt content is unmodified

- **WHEN** a client sends a prompt to a live session
- **THEN** the harness receives exactly that text

#### Scenario: Mid-run prompting not supported

- **WHEN** a client sends a prompt to a session whose adapter has not declared the
  interaction capability
- **THEN** the system returns an unsupported-capability error and the run is
  unaffected

### Requirement: Model provider contract

A model provider SHALL resolve a model reference into the launch-time configuration a
harness adapter needs (model identifier, provider selection, and non-secret options)
and SHALL report which model references it can resolve. Credentials SHALL be read from
the host environment or harness configuration and SHALL NOT be persisted in office
data or returned over the API.

#### Scenario: Resolving a model reference

- **WHEN** an agent references a model that the provider supports
- **THEN** the provider returns launch-time configuration for that model and the
  secret material is applied only at process launch

#### Scenario: Credential never leaves the runtime

- **WHEN** a client reads an agent, a run, or a session
- **THEN** no API response contains an API key, token, or password

### Requirement: Normalized run event stream

All adapter output SHALL be expressed as vendor-neutral events, each carrying a
monotonic sequence number, a timestamp, a run identifier, and a type from a closed set
covering output chunks, state changes, telemetry updates, and terminal outcomes
(completed, failed, cancelled). A consumer SHALL NOT need vendor-specific parsing.

#### Scenario: Uniform events across vendors

- **WHEN** two different harness adapters each execute a run
- **THEN** a consumer receives events of the same shape and types from both

#### Scenario: Ordered delivery

- **WHEN** a consumer receives run events
- **THEN** sequence numbers for a given run are strictly increasing and gaps are
  detectable

### Requirement: PI harness adapter

The system SHALL provide a harness adapter that runs the PI CLI in its machine-readable
RPC mode inside the agent's working directory, honors the selected model reference,
normalizes PI session events into the run event stream, and exposes PI's session
statistics as session telemetry.

#### Scenario: Run executes through PI

- **WHEN** an agent configured with the PI harness is started
- **THEN** a PI process is launched in the agent's working directory with the resolved
  model and the task instruction, and its activity appears as normalized events

#### Scenario: Project trust follows PI

- **WHEN** the office starts a run without an explicit trust override
- **THEN** PI applies the same project-trust decision it would for an interactive run
  in that directory

#### Scenario: Extension status is not agent activity

- **WHEN** a PI extension reports harness status such as an MCP server connecting or
  being blocked through a notification
- **THEN** that status is not surfaced as the agent's current activity, because the
  office mirrors the agent's work from PI's own session events

#### Scenario: PI context statistics are available

- **WHEN** a PI session has produced at least one assistant response
- **THEN** context tokens, context window, and percent complete are reported for that
  session

#### Scenario: PI unavailable

- **WHEN** the PI executable cannot be found or started
- **THEN** the system reports a capability error identifying PI as unavailable and
  does not leave the run marked as running

### Requirement: DeepSeek model provider

The system SHALL provide a model provider that resolves DeepSeek model references,
including the reasoning and non-reasoning chat models used by PI, to launch-time
configuration for the PI harness.

#### Scenario: Selecting a DeepSeek model

- **WHEN** an agent references a supported DeepSeek model identifier
- **THEN** the provider reports it as resolvable and supplies the corresponding
  configuration when the run starts

#### Scenario: Unsupported model reference

- **WHEN** an agent references a model the provider cannot resolve
- **THEN** starting the agent fails with an error listing the identifiers the provider
  does support

### Requirement: Capability negotiation

When an adapter does not support an optional operation, the system SHALL report that
capability as unsupported and SHALL reject the operation with an explicit error
instead of failing silently or degrading unpredictably.

#### Scenario: Unsupported operation rejected

- **WHEN** a client requests an operation an adapter has not declared
- **THEN** the system returns an explicit unsupported-capability error and no state
  change occurs

### Requirement: Adding a vendor

Adding a harness or model vendor SHALL require only a new adapter package that
implements the relevant contract plus one registry entry, and SHALL NOT require changes
to core, the runtime, the API contract, or the UI.

#### Scenario: New vendor is additive

- **WHEN** a second harness adapter is added and registered
- **THEN** it appears in the capabilities listing and its agents run without any
  change outside its own package and the registry entry
