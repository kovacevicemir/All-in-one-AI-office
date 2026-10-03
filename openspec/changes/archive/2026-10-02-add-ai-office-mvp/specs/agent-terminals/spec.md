# Spec Delta

## Purpose

Gives every agent a real, observable terminal session so it operates a shell the same
way a human does, and so its live prompt, output, and context usage can be followed
from the office UI.

## ADDED Requirements

### Requirement: One session per task

Each session SHALL back exactly one task run. A session SHALL be created when its run
starts and SHALL end when that run reaches a terminal outcome. A session SHALL NOT be
reused for a subsequent task unless the agent is explicitly configured for a shared,
long-lived session, which SHALL default to off.

#### Scenario: Session is created for a task

- **WHEN** a task run starts
- **THEN** a session is created for that run and bound to the agent and the task

#### Scenario: Session ends with its task

- **WHEN** a task run reaches a terminal outcome
- **THEN** its session is no longer live, its final output remains readable, and a
  later task receives a new session

#### Scenario: Shared session is off by default

- **WHEN** an agent is created without an explicit shared-session setting
- **THEN** its tasks each use a separate session

### Requirement: Transport-independent session behavior

A session SHALL be backed either by a pseudo-terminal or by a harness-provided
structured event stream. Both backings SHALL expose the same observable behavior:
ordered output, input, status, and retained scrollback. Operations that only make
sense for one backing, such as terminal resize, SHALL be reported as unsupported by
backings that cannot perform them.

#### Scenario: Structured session behaves like a terminal

- **WHEN** a session is backed by a structured event stream from the harness
- **THEN** subscribers receive ordered output, can send input, observe status, and
  read scrollback exactly as they would for a pseudo-terminal session

#### Scenario: Unsupported operation is rejected

- **WHEN** a client requests a resize for a session backed by a structured stream that
  cannot resize
- **THEN** the system returns an explicit unsupported-capability error

#### Scenario: Duplicate session rejected

- **WHEN** a session is requested for a task run that already has a live session
- **THEN** the system does not create a second session and returns an explicit
  conflict result

### Requirement: Bidirectional streaming

The system SHALL stream session output to all attached subscribers as it is produced
and SHALL write client input to the session's input stream while the session accepts
input.

#### Scenario: Output reaches subscribers

- **WHEN** activity inside a session produces output
- **THEN** every attached subscriber receives the output with its sequence number and
  timestamp

#### Scenario: Input reaches the session

- **WHEN** an attached client sends input for a session that accepts input
- **THEN** the input is delivered to the session

### Requirement: Output history and backfill

Each session SHALL retain a bounded scrollback of recent output. A subscriber that
attaches later SHALL be able to request history and receive buffered output in order,
and the system SHALL report the oldest sequence number it still retains.

#### Scenario: Late subscriber backfills

- **WHEN** a client attaches to a session that already produced output
- **THEN** the client receives the retained scrollback before live output, in
  ascending sequence order

#### Scenario: Bounded memory

- **WHEN** a session produces more output than the scrollback limit
- **THEN** the oldest retained output is discarded and the reported oldest sequence
  number advances

#### Scenario: Tool payloads appear in the transcript

- **WHEN** a harness run writes or edits a file
- **THEN** the retained transcript includes the affected path and the written or
  changed content, so a completed task's code is reviewable after the run

### Requirement: Session telemetry stream

A session SHALL publish telemetry updates to its subscribers, including context usage
and cumulative tokens and cost, whenever its backing harness provides them. When
telemetry is unavailable, the session SHALL report it as unavailable rather than as
zero.

#### Scenario: Telemetry published to subscribers

- **WHEN** the backing harness reports new context usage for a live session
- **THEN** attached subscribers receive a telemetry update for that session

#### Scenario: Telemetry unavailable

- **WHEN** the backing harness cannot report usage
- **THEN** the session reports telemetry as unavailable and subscribers continue to
  receive output normally

### Requirement: Session status

The system SHALL expose a session status of starting, running, exited, or failed,
along with the process exit code when applicable. A terminated session SHALL remain
readable so its final output stays available.

#### Scenario: Session terminates

- **WHEN** the work in a session terminates
- **THEN** the session status becomes exited or failed with its exit code and
  subscribers receive a terminal event

#### Scenario: Reading a terminated session

- **WHEN** a client reads a session that has terminated
- **THEN** the retained output is still returned and the session is reported as not
  accepting input

#### Scenario: Writing to a terminated session

- **WHEN** a client sends input to a session that has terminated
- **THEN** the system rejects the input with an explicit error

### Requirement: Session teardown

Closing a session SHALL terminate its process tree and release associated resources.
Closing a session SHALL NOT delete the agent's persistent definition, its task, or its
recorded result.

#### Scenario: Closing a live session

- **WHEN** a client closes a running session
- **THEN** the underlying process tree is terminated, subscribers receive a terminal
  event, and the agent and its task history remain

#### Scenario: Close is idempotent

- **WHEN** close is requested for a session that is already closed
- **THEN** the operation succeeds without error and without side effects
