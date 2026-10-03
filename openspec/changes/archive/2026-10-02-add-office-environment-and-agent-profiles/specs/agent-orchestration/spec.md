# Spec Delta

## Purpose

Gives each agent a durable, human-authored identity beyond its name: a short
description for operators and free-form instructions that shape how the agent works.
The profile is edited in the office UI and applied to every run the agent starts,
without rewriting the task instructions already queued.

## ADDED Requirements

### Requirement: Agent instruction profile

The system SHALL store, per agent, a human-authored profile made of a short
**description** and free-form **instructions**. The profile SHALL be durable across
restarts, SHALL be editable at any time without restarting the office, and SHALL be
applied to every run that agent starts after the edit. The instructions SHALL be
delivered to the harness for the run; the description SHALL be shown to operators and
SHALL NOT be added to the model prompt. Applying a profile SHALL NOT alter the stored
instruction of any queued or running task.

#### Scenario: Profile survives a restart

- **WHEN** an agent's description and instructions are saved and the office restarts
- **THEN** the agent still reports the saved description and instructions

#### Scenario: Profile is applied to the next run

- **WHEN** an agent with saved instructions starts a run
- **THEN** the harness receives those instructions as the agent's system guidance,
  distinct from the task instruction

#### Scenario: Description is operator-facing only

- **WHEN** an agent has a description
- **THEN** the description is available to the UI and is not included in the model
  prompt

#### Scenario: Editing does not rewrite queued work

- **WHEN** an agent's profile is edited while tasks are queued
- **THEN** each task's stored instruction is unchanged, and the new profile applies
  only to runs started after the edit

#### Scenario: No profile runs unchanged

- **WHEN** an agent has neither description nor instructions
- **THEN** the run is started exactly as it would be without this feature, with no
  system guidance added
