# Design

## Context

See `proposal.md` for motivation. This change extends the office established by
`add-ai-office-mvp`; the constraints are unchanged:

1. **No vendor terms in core, contracts, or web.** A profile is neutral data; only an
   adapter may know how to turn instructions into a harness system message.
2. **A run with no profile must equal a run from the shell.** The existing
   zero-overhead guarantee is narrowed, not discarded: the office authors nothing,
   but it may deliver the agent's own saved instructions.
3. **Everything important is testable without a browser, network, clock, or
   credentials.** Profile parsing/formatting and furniture layout are pure functions;
   the profile store and the harness are ports with fakes.
4. **The 3D UI is never the only verification surface.** The accessible list carries
   the same identity information, and environment behavior is asserted through the
   pure layout function.

## Goals / Non-Goals

**Goals:**

- A furnished office built only from procedural geometry, with placement owned by a
  pure, testable function.
- Department identity visible on the bot and in the list, resolved from data the UI
  already has.
- A per-agent instruction profile that is durable, editable live, and applied to runs
  without touching queued task instructions.
- Keep the diff to each package small and within the existing complexity budgets.

**Non-Goals:**

- Any asset pipeline, GLTF furniture pack, or external texture. No new dependency.
- Profile inheritance, templates, or agent-to-agent profile delivery.
- Reading or writing `AGENTS.md`/`CLAUDE.md` in an agent's working directory.
- Multi-user concurrent editing guarantees.

## Decisions

### D1. Profiles are markdown files in the office data directory

Each agent's profile is one markdown file at
`<dataDir>/agents/<agentId>.md`:

```markdown
## Description

Tech lead for the payments squad.

## Instructions

You are the tech lead. You own the build and the release checklist.
Run `npm test` before marking work done. Raise blockers to the orchestrator.
```

- Two `##` sections, `Description` and `Instructions`; anything outside them is
  ignored. Parsing and formatting are **pure functions in `core`**
  (`parseAgentProfile`, `formatAgentProfile`), so they are unit-tested without I/O.
- The file is the source of truth, so an operator can edit it on disk as well as in
  the UI. The UI reads and saves through the API.
- `StorePort` gains `readAgentProfile`/`writeAgentProfile`; `adapter-store-file`
  writes atomically (temp file + rename) and `adapter-fake` keeps an in-memory map.

*Alternatives considered:* plain JSON fields on the agent record (rejected: the user
asked for an editable markdown file, and a file is more pleasant to hand-edit);
YAML front-matter (rejected: needs a real parser or fragile hand-rolled YAML);
writing the agent's workspace `AGENTS.md` (rejected: invasive, not per-agent, and it
would overwrite files the user owns).

### D2. Instructions are delivered as a separate, appended system message

At run start the adapter receives the agent's instructions and adds them as a system
message distinct from the user prompt. The PI adapter renders them with
`--append-system-prompt`, preserving PI's own base coding prompt.

*Alternatives considered:* `--system-prompt` (replace) — rejected as the default
because it discards the harness's base behavior; it can be revisited as an explicit
per-agent mode later. Folding instructions into the task instruction — rejected: it
would violate "instruction reaches the harness verbatim" and pollute task history.

The observable contract is specified in `harness-adapters` (modified requirement):
verbatim instruction, a distinct system message equal to the saved instructions, and
nothing authored by the office.

### D3. The furnished office is procedural, with placement as a pure function

- `apps/web/src/office/furniture.tsx` holds small procedural pieces (`Desk`, `Chair`,
  `Monitor`, `Plant`, `Rug`, `Calendar`, `Whiteboard`). No assets, no dependency.
- `apps/web/src/office/floorplan.ts` is a pure function `planOffice(agents,
  departments)` returning deterministic positions for desks, chairs, and props,
  layered on the existing `layoutAgents`. Unit tests assert counts and positions
  without WebGL.
- The scene composes the plan; camera bounds keep the view above the floor
  (`maxPolarAngle`).

*Alternatives considered:* a GLTF furniture pack (rejected: adds an asset pipeline
and network/offline concerns for no functional gain); scattering props directly in
JSX (rejected: not testable, and the budget rules favor the pure function).

### D4. Department identity is derived, not stored twice

The bot label already renders a canvas sprite; it gains a second line with the
department name. The list's agent cell renders the name with the department beneath
it. Both read the department from the `departments` list the UI already receives; no
new data or endpoint is required. An agent with no department shows only its name.

### D5. Seams that keep this testable

| Behavior | Seam | Test double |
| --- | --- | --- |
| Profile parse/format | pure functions in `core` | none needed |
| Profile durability | `StorePort.readAgentProfile/writeAgentProfile` | in-memory store in `adapter-fake` |
| Profile endpoints | runtime HTTP with injected store | `adapter-fake` store |
| Instructions reach the harness | `StartRunRequest.instructions` + scripted harness records | `adapter-fake` scripted harness |
| Furniture layout | pure `planOffice` | none needed |
| Bot label content | pure `visualForAgent` + name/department inputs | unit test of the label data |

### Architecture invariants

The change touches no dependency edge. `core` stays pure (the profile parser is pure
string handling; the store is a port). `contracts` gains a vendor-neutral profile
payload. `apps/web` talks only through `contracts`. PI's flag name appears only in
`adapter-pi`, as required.

## Risks / Trade-offs

- **Instruction bloat.** A long profile is added to every run and raises token cost.
  Mitigation: enforce a documented maximum length on both description and
  instructions; reject over-long payloads at the API.
- **File-format drift.** Hand-editing the markdown can break section parsing.
  Mitigation: the parser tolerates missing sections (treated as empty) and ignores
  unknown content; the formatter always writes canonical output.
- **Last-write-wins.** Two editors overwrite each other. Acceptable for a
  single-user local-first tool; noted as out of scope.
- **Visual reference missing.** No "agent office v3" screenshot was found in the
  repository. The environment task is checked against the written description until a
  reference image is provided.

## Migration Plan

- New agents start with an empty profile (empty description and instructions).
- Existing agents are unaffected: no profile file means no behavior change.
- The data directory gains an `agents/` folder; the snapshot schema version is
  unchanged because profiles live in their own files.
- No public API removal; profile endpoints are additive.

## Open Questions

- Should the profile later support a mode that replaces the harness system prompt
  instead of appending? Deferred; the spec permits either as long as it is the
  agent's own text.
- Should profiles be exportable/importable as templates? Deferred (out of scope).
