# Spec Delta

## Purpose

Exposes each agent's instruction profile over the API so the UI can read, edit, and
save it without restarting the office.

## ADDED Requirements

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
