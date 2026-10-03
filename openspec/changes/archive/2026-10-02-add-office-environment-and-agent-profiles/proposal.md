# Proposal

## Why

The MVP proved the office works but reads as a diagram, not a workplace. Three gaps
make it hard to use day to day:

1. **The 3D office is an empty room.** A floor and one desk per agent is enough to
   prove the scene renders, but it gives no sense of place and no visual cues to
   navigate.
2. **An agent's identity is incomplete.** A bot shows its name but not the department
   it belongs to, so "who is this and where do they sit" can only be answered by
   opening the inspector.
3. **Agents have no way to be told who they are or how to work.** Today every run is
   the bare task instruction. A tech lead, a tester, and a reviewer all behave the
   same and cannot be given standing instructions such as "you own the build", "run
   the test suite this way", or "raise blockers to the tech lead".

This change adds a furnished office, department identity on every agent, and a
per-agent instruction profile that is authored in the UI and applied to that agent's
runs.

## What Changes

- **Furnish the 3D office** with a procedural kit: desks with chairs and monitors,
  plants, a rug, and wall decor such as a calendar and a whiteboard, arranged on a
  floor plan around department zones. No new external assets.
- **Show department under the agent name** in both the 3D bot label and the
  accessible list, so identity is readable without opening the inspector.
- **Give every agent an instruction profile**: a short description (operator-facing)
  and free-form instructions (delivered to the harness). The profile is stored as a
  per-agent markdown file in the office data directory and is editable from the
  inspector without restarting the office.
- **Deliver the agent's instructions to the harness** as a distinct system message,
  separate from the task instruction, preserving the promise that the office itself
  authors no prompt content.

## Capabilities

### New Capabilities

- None. Every behavior lands in an existing capability so the baseline stays small.

### Modified Capabilities

- `office-3d-ui`: adds a furnished environment requirement, an agent-identity
  requirement (name + department in both views), and an agent-profile editor
  requirement.
- `agent-orchestration`: adds the agent instruction profile as durable, editable
  agent state that is applied to runs.
- `harness-adapters`: modifies *Faithful, zero-overhead execution* so an agent's own
  saved instructions may be delivered as a system message while the office still
  authors nothing.
- `office-runtime-api`: adds read/update endpoints for an agent's profile.

## Assumptions

- No "agent office v3" reference screenshot was found anywhere in this repository.
  The visual requirements below describe the target in words (an open-plan office:
  desks, chairs, monitors, plants, a rug, wall calendar and whiteboard). If a
  reference image is added later, it becomes the visual acceptance reference and the
  environment task is checked against it.
- This change modifies a requirement introduced by the in-flight change
  `add-ai-office-mvp`. It assumes that change is archived (or lands first) so the
  modified requirement has a baseline. If both are applied together, the
  `harness-adapters` delta here is applied on top of the MVP delta.

## Impact

- **New local data:** one markdown profile file per agent under the office data
  directory. It is part of the office's own state, not written into an agent's
  working directory, so no user repository is modified.
- **Prompt cost changes only when a profile is set.** With no instructions an agent
  runs exactly as before. With instructions, the added cost is exactly the saved
  instruction text.
- **New dependency:** none. The profile parser and the furniture layout are pure
  TypeScript; the office already ships Three.js.
- **Architecture:** unchanged. Profiles are vendor-neutral data; only
  `adapter-pi` knows how to render a system message for PI.

Explicitly out of scope: sharing profiles between agents or as templates, importing
profiles from the workspace (`AGENTS.md`), profile versioning/history, and any
agent-to-agent delivery of profiles at runtime.
