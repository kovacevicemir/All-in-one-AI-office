# Spec Delta

## Purpose

Defines the office's workforce model: agents and departments, the ordered work each
agent owns, dependencies and parallel execution across agents, the loop that turns a
task into a real session run, the runtime and context-pressure state the UI
visualizes, and durable persistence across restarts.

## ADDED Requirements

### Requirement: Agent definition

The system SHALL let a client create, read, update, list, and delete agents. An agent
SHALL have a name, an optional role, an optional department, a working directory, a
harness adapter reference, a model reference, and an optional system prompt. Agent
names SHALL be unique and non-empty.

#### Scenario: Creating an agent

- **WHEN** a client creates an agent with a name, working directory, harness adapter,
  and model reference
- **THEN** the system persists the agent in an idle state and returns it with a
  stable identifier

#### Scenario: Duplicate name rejected

- **WHEN** a client creates two agents with the same name
- **THEN** the second creation fails with a validation error and no agent is created

#### Scenario: Invalid working directory rejected

- **WHEN** a client creates an agent whose working directory does not exist
- **THEN** the system rejects the creation with an error naming the missing path

### Requirement: Departments

The system SHALL let a client create, list, rename, and delete departments and SHALL
let agents be assigned to and removed from a department. Deleting a department SHALL
NOT delete its agents; those agents SHALL become unassigned.

#### Scenario: Grouping agents

- **WHEN** agents are assigned to a department
- **THEN** listing that department returns those agents and listing an agent reports
  its department

#### Scenario: Deleting a populated department

- **WHEN** a department containing agents is deleted
- **THEN** the department is removed and each of its agents is retained and reported
  as unassigned

### Requirement: Task queue

Each agent SHALL own an ordered queue of tasks. A task SHALL have a title, an
instruction, a status of queued, blocked, running, done, failed, or cancelled, and a
creation time. The system SHALL define an agent's next task as its earliest runnable
task in queue order.

#### Scenario: Appending and ordering

- **WHEN** a client appends tasks to an agent
- **THEN** the tasks are returned in queue order and the first runnable task is
  reported as the agent's next task

#### Scenario: Next task advances

- **WHEN** the running task reaches a terminal status
- **THEN** the agent's next task becomes the earliest remaining runnable task, or
  none if no task is runnable

#### Scenario: Reordering pending work

- **WHEN** a client moves a queued task ahead of other queued tasks
- **THEN** subsequent next-task reports reflect the new order and a running task is
  not displaced

#### Scenario: Finished task is re-queued

- **WHEN** a client re-queues a task that reached a terminal status
- **THEN** the task returns to the queue with its original instruction, its previous
  result is cleared, and it becomes the agent's next task; a task that has not
  finished is rejected

### Requirement: Task dependencies

A task SHALL be able to declare dependencies on other tasks by identifier, including
tasks owned by other agents. A task with unmet dependencies SHALL be reported as
blocked and SHALL NOT start. A task SHALL become runnable when every dependency has
completed successfully. A dependency cycle SHALL be rejected at creation or update
time.

#### Scenario: Dependent task waits

- **WHEN** a task depends on a task that has not completed
- **THEN** the dependent task is reported as blocked and is not started

#### Scenario: Dependent task unblocks

- **WHEN** the last unfinished dependency of a blocked task completes successfully
- **THEN** the dependent task becomes runnable and is eligible as its agent's next
  task

#### Scenario: Failed dependency blocks dependents

- **WHEN** a dependency fails or is cancelled
- **THEN** its dependents remain blocked and are reported as blocked by a failed
  dependency rather than being failed or started

#### Scenario: Cycle rejected

- **WHEN** a client creates a dependency that would form a cycle
- **THEN** the system rejects the change with an error and the dependency graph is
  unchanged

### Requirement: Parallel execution with one run per agent

The system SHALL execute runnable tasks of different agents concurrently and SHALL
execute at most one task per agent at a time. Starting a run when an agent is already
running SHALL fail with an explicit conflict rather than queueing silently.

#### Scenario: Independent agents run at the same time

- **WHEN** two agents each have a runnable task and both are instructed to run
- **THEN** both runs are in progress simultaneously

#### Scenario: Same agent cannot double-run

- **WHEN** a start is requested for an agent that already has a run in progress
- **THEN** the system returns a conflict result and starts no second run

### Requirement: Run loop

The system SHALL execute an agent's next runnable task by creating a session and
starting a run through the agent's harness adapter, and SHALL correlate the run, the
task, and the session. When a run reaches a terminal outcome, the system SHALL update
the task status and record the task result, and SHALL NOT automatically start a
further task without an explicit instruction.

#### Scenario: Task becomes a run

- **WHEN** an agent with a runnable task is instructed to run
- **THEN** the task becomes running, a session is created, a run is started with the
  task's instruction, and the task, run, and session identifiers are linked

#### Scenario: Successful completion

- **WHEN** a run completes successfully
- **THEN** its task becomes done and the run's result is retrievable

#### Scenario: Failed run

- **WHEN** a run fails or is cancelled
- **THEN** its task becomes failed or cancelled with the recorded reason and the
  queue is otherwise unchanged

### Requirement: Task results and reporting

Each completed run SHALL record a task result containing the final assistant output,
the terminal status, and the usage reported by the harness. A dependent task SHALL
receive the results of its dependencies as input that is explicitly labelled as
dependency output and kept separate from the dependent task's own instruction.

#### Scenario: Result is retrievable

- **WHEN** a task completes
- **THEN** its result, including the final assistant output, is readable through the
  API and is retained after the session closes

#### Scenario: Dependent task receives dependency results

- **WHEN** a task with dependencies starts
- **THEN** the results of its completed dependencies are delivered as labelled input
  that is distinguishable from the task instruction

#### Scenario: Instruction is not rewritten

- **WHEN** dependency results are delivered
- **THEN** the dependent task's own instruction is passed to the harness unchanged

#### Scenario: Failure reason is retained

- **WHEN** a task fails
- **THEN** its result records a failure reason and any partial final output

### Requirement: Observable agent runtime state

The system SHALL expose, for every agent, a runtime state of idle, thinking, working,
blocked, error, done, or waiting, a short human-readable current-activity summary, the
current task if any, the identifiers of the tasks the agent is waiting on if any, and
the identifier of the agent's live session if any. The runtime state SHALL change only
in response to an observable event or an explicit client command.

#### Scenario: State reflects activity

- **WHEN** an agent has a run in progress
- **THEN** its reported state is a running state and its current-activity summary
  describes the work in progress

#### Scenario: Waiting on a dependency is visible

- **WHEN** an agent's only remaining tasks are blocked by unfinished dependencies
- **THEN** its reported state is waiting and the blocking dependency identifiers are
  reported

#### Scenario: Terminal state after failure

- **WHEN** an agent's run fails
- **THEN** its reported state is error until a new run or an explicit reset occurs

### Requirement: Context pressure

The system SHALL derive a context-pressure level for each agent from the most recent
context usage percent reported for its session: nominal below the warning threshold,
warning at or above it, and critical at or above the critical threshold. The default
warning threshold SHALL be 30 percent and the default critical threshold SHALL be 50
percent, and both SHALL be configurable. Pressure SHALL be reported as unknown when
telemetry is unavailable. Changing pressure SHALL NOT change a task's outcome or stop
a run on its own.

#### Scenario: Pressure below the warning threshold

- **WHEN** an agent's session reports 12 percent context usage
- **THEN** the agent's context pressure is reported as nominal

#### Scenario: Pressure reaches the warning threshold

- **WHEN** an agent's session reports 30 percent context usage
- **THEN** the agent's context pressure is reported as warning

#### Scenario: Pressure reaches the critical threshold

- **WHEN** an agent's session reports 50 percent context usage
- **THEN** the agent's context pressure is reported as critical

#### Scenario: Pressure does not flap around a threshold

- **WHEN** context usage oscillates just above and below a threshold
- **THEN** the reported pressure level does not change more than once per direction
  within the configured hysteresis margin

#### Scenario: Pressure unknown without telemetry

- **WHEN** a session reports no context usage
- **THEN** the agent's context pressure is reported as unknown and no warning is
  implied

#### Scenario: Pressure alone does not stop work

- **WHEN** an agent reaches critical pressure
- **THEN** its run continues and its task outcome is unaffected

### Requirement: Delegation between agents

An agent SHALL be able to have a task appended to another agent's queue, and the
system SHALL record which agent or client created each task. A delegated task SHALL
follow the same lifecycle, dependency, and ordering rules as any other task. Deeper
agent-to-agent interaction is out of scope for this change but the task record SHALL
carry an origin field so richer hand-off can be added later.

#### Scenario: Delegating work

- **WHEN** an agent delegates a task to another agent
- **THEN** the task appears in the target agent's queue with the originating agent
  recorded as its creator

#### Scenario: Delegation target must exist

- **WHEN** a delegation request names no existing target agent
- **THEN** the system rejects it with an error and appends no task

### Requirement: Durable persistence and recovery

Agent, department, task, and run records SHALL be persisted so they survive a process
restart. On startup the system SHALL restore all definitions and SHALL mark any run
that was in progress when the process stopped as interrupted rather than running.

#### Scenario: Definitions survive restart

- **WHEN** the runtime is restarted
- **THEN** previously created departments, agents, and queued tasks are still present
  with the same identifiers

#### Scenario: Interrupted run is not reported as live

- **WHEN** the runtime starts and finds a run that never reached a terminal outcome
- **THEN** that run is reported as interrupted and its agent is not reported as
  currently running
