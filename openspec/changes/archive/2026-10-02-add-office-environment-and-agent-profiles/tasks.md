# Tasks

## 1. Shared contracts

- [x] 1.1 Add an `AgentProfile` schema (description, instructions) with documented maximum lengths, plus read/update request-response shapes, and export the inferred types — verify: unit tests round-trip the schema, accept empty strings, and reject a non-string field and an over-long value with a field-naming error
- [x] 1.2 Confirm no vendor term appears in the new contract and that the additive-change rule is followed — verify: the existing contracts test asserting no credential-shaped or vendor-specific fields still passes

## 2. Core: profile model and ports

- [x] 2.1 Implement `parseAgentProfile(markdown)` and `formatAgentProfile(profile)` as pure functions over the `## Description` / `## Instructions` sections: missing sections parse as empty, unknown content is ignored, and formatting is canonical — verify: unit tests cover a full document, either section missing, both missing, empty sections, and a round-trip that is byte-stable
- [x] 2.2 Extend `StorePort` with `readAgentProfile`/`writeAgentProfile` and wire an agent's instructions into `StartRunRequest` at run start (description is not sent) — verify: unit tests with the fake store assert a saved profile reaches the run request as instructions only, and an agent with no profile sends no instructions
- [x] 2.3 Enforce the profile length limits and reject invalid input in the domain with the uniform error shape — verify: unit tests assert an over-long description or instructions is rejected and the stored profile is unchanged

## 3. Store adapter: profile files

- [x] 3.1 Implement profile persistence in `adapter-store-file` as one markdown file per agent under `<dataDir>/agents/<agentId>.md`, written atomically (temp file + rename) and read on demand; add the in-memory implementation to `adapter-fake` — verify: unit tests assert a write is visible on read, a recreated store reads the same profile, an absent file reads as an empty profile, and no partial file is ever observed
- [x] 3.2 Recover cleanly when a profile file is missing or malformed — verify: unit tests with an empty file and with prose that has no recognized sections both yield an empty profile without throwing

## 4. Harness: deliver instructions as a system message

- [x] 4.1 Update `adapter-pi` to render agent instructions with `--append-system-prompt` when present, and to add no system flag when absent; keep the task instruction untouched — verify: unit tests assert the flag value equals the saved instructions, no `--append-system-prompt` appears without instructions, and the recorded user prompt is byte-identical to the task instruction in both cases
- [x] 4.2 Update the faithful-execution tests to the amended contract (verbatim instruction; system message equals the agent's saved instructions; nothing office-authored) — verify: the modified `harness-adapters` scenarios are covered by tests, including an agent with no profile producing no system message

## 5. Runtime API: profile endpoints

- [x] 5.1 Add read and update endpoints for an agent's profile that validate the payload, apply it atomically, and return the stored profile using the uniform error shape — verify: API tests assert read-when-unset returns empty strings, update-then-read round-trips, an invalid payload is rejected without changing stored state, and an unknown agent returns not-found
- [x] 5.2 Expose the profile in the client transport and the store, and surface save success and failure to the UI — verify: client and store tests assert the request shape and that a rejected save leaves the editor content intact

## 6. Web: department identity

- [x] 6.1 Show the agent's department under its name in the accessible list and in the 3D bot label, resolved from the departments the UI already has, and show only the name when unassigned — verify: component tests assert the department renders under the name in the list, the bot label data includes it, and an unassigned agent shows no department

## 7. Web: agent profile editor

- [x] 7.1 Add a profile editor to the inspector with description and instructions fields, a save action, and success/error feedback — verify: component tests assert editing and saving calls the store, a success confirmation appears, a rejected save shows the error and keeps the text, and switching agents loads that agent's saved profile

## 8. Web: furnished office environment

- [x] 8.1 Implement the procedural furniture kit (desk, chair, monitor, plant, rug, calendar, whiteboard) with no assets — verify: the scene renders without any new network request for models or textures, and no new dependency is added
- [x] 8.2 Implement `planOffice(agents, departments)` as a pure layout function producing deterministic positions for a desk, chair, and monitor per agent, shared props per department zone, plants, rug, and wall decor — verify: unit tests assert counts and stable positions for zero, one, and several agents across two departments
- [x] 8.3 Compose the plan in the scene and clamp the camera above the floor — verify: a browser smoke check shows a furnished office and confirms the camera cannot orbit below the floor plane; the layout unit test stands in for CI

## 9. Documentation and archive

- [x] 9.1 Document the agent profile (where the markdown files live, the section format, the length limits, that the description is operator-facing and the instructions are appended to the harness system prompt) in the README and `docs/engineering-guidelines.md` — verify: a reviewer can find and edit a profile file by hand following the docs, and the docs match the parser's behavior
- [x] 9.2 Run `openspec validate add-office-environment-and-agent-profiles --strict` and archive the change so the modified `harness-adapters` requirement and the new requirements become the baseline — verify: validation passes with no warnings and the archived specs contain the agent-profile, furnished-environment, agent-identity, and profile-endpoint requirements
