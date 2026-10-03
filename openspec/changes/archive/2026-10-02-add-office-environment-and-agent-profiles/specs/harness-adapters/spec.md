# Spec Delta

## Purpose

Amends the execution-fidelity guarantee so an agent's own saved instructions can be
delivered to the harness, while keeping the office itself from authoring any prompt
content. Without a profile, behavior is unchanged.

## MODIFIED Requirements

### Requirement: Faithful, zero-overhead execution

A harness adapter SHALL pass a task's instruction to the harness as the user prompt
without modification. When the agent has saved instructions, the adapter SHALL deliver
those instructions as a distinct system message, separate from the user prompt, and
SHALL NOT weave them into the task instruction. When the agent has no saved
instructions, the adapter SHALL add no system prompt content. In all cases the
adapter SHALL NOT add prompt text, system prompt content, or model calls of its own
beyond the agent's saved instructions and any explicitly requested dependency input.
With no agent instructions, a run through the office SHALL produce the same model
interaction, and the same prompt-token cost, as invoking the harness directly with
the same instruction in the same working directory; with instructions, the only
difference SHALL be the agent's saved instruction text.

#### Scenario: Instruction reaches the harness verbatim

- **WHEN** a task with no dependency results is run
- **THEN** the user prompt recorded in the harness session is byte-identical to the
  task instruction, with no added prefix, suffix, or wrapper

#### Scenario: Agent instructions are a distinct system message

- **WHEN** an agent with saved instructions is run
- **THEN** the user prompt is byte-identical to the task instruction and the system
  message equals the agent's saved instructions

#### Scenario: No profile adds no system prompt

- **WHEN** an agent with no saved instructions is run
- **THEN** the session records no system message authored by the office

#### Scenario: Dependency context is delimited, not woven in

- **WHEN** a task that has dependency results is run
- **THEN** the prompt contains a clearly delimited dependency block followed by the
  task instruction, and the instruction bytes are unchanged as the final segment

#### Scenario: No office-authored model calls

- **WHEN** a run completes
- **THEN** the session records no prompt or system message authored by the office
  beyond the task instruction, the agent's own saved instructions, and any explicitly
  requested dependency input

#### Scenario: Dependency input is separate, not merged

- **WHEN** a task runs with dependency results
- **THEN** those results are delivered as their own clearly labelled input and the
  task instruction itself is unchanged
