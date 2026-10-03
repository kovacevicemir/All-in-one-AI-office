<div align="center">

# 🏢 AI Office

**A local-first 3D office where every agent worker is a bot that drives a real
terminal.**

[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r186-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522.6-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-198%20passing-3fb950?logo=vitest&logoColor=white)](#-development)
[![Spec-driven](https://img.shields.io/badge/spec--driven-OpenSpec-8b5cf6)](openspec)
[![Vendor neutral](https://img.shields.io/badge/vendors-PI%20%2B%20DeepSeek%20today%2C%20pluggable-0ea5e9)](#-why-it-is-vendor-neutral)
[![Private](https://img.shields.io/badge/license-private-lightgrey)](#-license)

</div>

---

```
   ┌──────────────────────────── 3D OFFICE ─────────────────────────────┐
   │  Engineering                    Operations                         │
   │  ┌────┐ ┌────┐ ┌────┐           ┌────┐                             │
   │  │ 🤖 │ │ 🤖 │ │ 😰 │           │ 🤖 │     😰 = context critical   │
   │  └────┘ └────┘ └────┘           └────┘     😣 = context warning    │
   │    Ada   Grace   Alan            Lin                              │
   └────────────────────────────────────────────────────────────────────┘
                              │ click a bot
                              ▼
   ┌────────────────────────── INSPECTOR ───────────────────────────────┐
   │ Doing        Working on: Ship the auth refactor                    │
   │ Next task    Add integration tests                                 │
   │ Context      52% of 1.0M tokens          [ stressed ]              │
   │ Waiting on   —                                                     │
   │ $ pi --mode rpc …                                                  │
   │ $ pnpm test                                                        │
   │   ✔ 198 passing                                                    │
   └────────────────────────────────────────────────────────────────────┘
```

## 🎯 What this is

You have several coding agents. Today that means several terminals, no idea which one
is stuck, which is about to run out of context, and which finished the thing the next
one depends on.

**AI Office turns that into something you can look at.** Each agent is a bot in a 3D
office. Click one and you see exactly what it is doing, what it will do next, how much
context it has burned, what it is waiting on, and the live terminal it is driving.
You can type into that session from the UI and steer a working agent.

It is **local-first** (binds to `127.0.0.1`, no accounts, no cloud), **vendor-neutral**
(the harness and the model are pluggable ports), and **spec-first** (every behaviour
traces back to a requirement in [`openspec/`](openspec)).

## ✨ Features

| | |
|---|---|
| 🤖 **One bot per agent** | Departments become zones in the office. Parallel work is visible at a glance. |
| 🖱️ **Click to inspect** | Current activity, next task, context usage, dependency status, last report, live terminal tail. |
| 😣 **Context pressure moods** | Bots *complain* at 30% context and *stress* at 50% (configurable). Advisory only — it never kills a run. |
| 💻 **Real terminal sessions** | One session per task, PTY-backed for generic harnesses and PI's RPC stream for PI. Streaming output, input, scrollback backfill, exit codes. |
| 📨 **Prompt a working agent** | Type into the inspector and the prompt is delivered with the harness's own steering semantics. |
| 🔗 **Dependencies + parallelism** | Tasks can depend on tasks across agents. Independent work runs concurrently; dependents unblock automatically. |
| 🧩 **Vendor-neutral** | Harness and model are two independent ports. Adding a vendor is one package and one registry line — core, API, and UI do not change. |
| 🪄 **Replaceable bot model** | Drop a glTF in and point `avatars/manifest.json` at it. No assets? A built-in procedural bot renders instead. |
| ♿ **Accessible list view** | The same information without WebGL, fully keyboard-navigable. This is also how CI verifies the UI. |
| 🏢 **Furnished office** | A procedural kit — desks, chairs, monitors, plants, a rug, a calendar, a whiteboard — laid out by a pure function. No external assets. |
| 🪪 **Agent profiles** | Give each agent a description and standing instructions, saved to a markdown file and applied to every run. |
| 🔒 **No prompt overhead** | The task instruction reaches the harness byte-for-byte. With no profile, no system prompt and no extra model calls are added; with a profile, the only difference is the agent's own saved instructions. |

## 🧰 Technology

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript 7** (strict, ESM, `verbatimModuleSyntax`) | One language across runtime and UI, one shared contract. |
| UI | **React 19** + **Vite 8** | Smallest path to a real app with fast HMR. |
| 3D | **Three.js** via **@react-three/fiber** + **drei** | Declarative scene graph; the scene is just components. |
| State | **Zustand** | No provider pyramid, no boilerplate, trivially testable reducer. |
| Server | **node:http** + **ws** | No framework needed for fourteen endpoints. |
| Runtime | **tsx** | Runs TypeScript directly; no build step for the server. |
| Terminal | **node-pty** (optional) | Real TTY semantics where a TTY is what the harness speaks. |
| Validation | **Zod 4** | One schema set shared by runtime and UI — they cannot drift. |
| Tests | **Vitest 5** + **@testing-library/react** + **jsdom** | Fast, no browser required. |
| Specs | **OpenSpec** | Spec-driven development with a Pi-native workflow. |

## 📋 Requirements

- **Node.js ≥ 22.6** (uses `process.loadEnvFile`)
- **PI CLI** on your `PATH` for real agent runs — `npm i -g @earendil-works/pi-coding-agent`
- **A DeepSeek API key** for real model calls ([platform.deepseek.com](https://platform.deepseek.com/))
- Optional: a C++ toolchain if you want the `node-pty` native module (it is an
  *optional* dependency — everything still works without it)

> The whole app runs **without** PI or a DeepSeek key: use the scripted test harness to
> explore the UI and the run lifecycle offline.

## 🚀 Install and run

```bash
# 1. Install
git clone <your-repo-url> "All in one AI office"
cd "All in one AI office"
npm install

# 2. Configure secrets (see the next section)
cp .env.example .env      # .env already exists in a fresh checkout; edit it
#   → set DEEPSEEK_API_KEY=sk-...

# 3. Run runtime (:4317) + web UI (:5173)
npm run dev
```

Open **http://localhost:5173**.

Then, in the **Staff the office** panel:

1. Add a department (e.g. `Engineering`).
2. Add an agent: name, a real working directory, harness `PI`, model
   `deepseek-flash`.
3. Create tasks for it, pick the bot (or the list row), and hit **Start next task**.
4. Watch the terminal tail fill in, and the bot go from 🤖 → 😣 → 😰 as context fills.

**Other commands**

```bash
npm run dev:runtime    # runtime only
npm run dev:web        # web only
npm start              # runtime only, no watch
npm test               # unit + architecture + code-health gates
npm run typecheck      # tsc --noEmit, whole repo
npm run e2e            # Playwright browser suite (fake adapter, no WebGL/creds)
npm run build          # production build of the web app
```

## 🔐 Configuration (.env)

`.env` is **git-ignored** and is where all secrets live. `.env.example` is committed
and documents every variable. The runtime loads `.env` at startup via
`process.loadEnvFile`.

```dotenv
# Required for real runs
DEEPSEEK_API_KEY=

# PI harness
#PI_COMMAND=pi
#AI_OFFICE_APPROVE_PROJECT=              # force PI project trust (unset = inherit PI)
#AI_OFFICE_TELEMETRY_INTERVAL_MS=2000

# Runtime
#AI_OFFICE_HOST=127.0.0.1
#AI_OFFICE_PORT=4317
#AI_OFFICE_DATA_DIR=.ai-office

# Context pressure thresholds, in percent. Tune per model: a 1M-token model wants
# very different numbers to a 128K one.
#AI_OFFICE_PRESSURE_WARNING=30
#AI_OFFICE_PRESSURE_CRITICAL=50
#AI_OFFICE_PRESSURE_HYSTERESIS=5
```

Credentials are read from the environment at process launch and are **never** written
to the data directory or returned over the API — a test asserts that.

## 🏗️ How it works

```
┌──────────────┐   HTTP + WebSocket (packages/contracts)   ┌────────────────────┐
│   apps/web   │ ◄────────────────────────────────────────► │   apps/runtime     │
│  React + R3F │        snapshot, then deltas                │  composition root  │
└──────────────┘                                            └─────────┬──────────┘
                                                                      │ ports
                        ┌─────────────────────────────────────────────┼──────────────┐
                        ▼                        ▼                    ▼              ▼
              packages/core              adapter-pi          adapter-session  adapter-store-file
              domain + rules +     PI harness (RPC) +        pipe + pty       write-behind
              ports + pressure     DeepSeek provider         backings         JSON snapshots
```

**Two independent ports** keep vendors optional:

- `HarnessAdapter` — *how* an agent process is started, driven and observed
  (`capabilities()`, `startRun()`, `prompt()`, `cancel()`).
- `ModelProvider` — *which* model and credentials a run uses (`resolve()`).

So **PI is the harness and DeepSeek is the model** — not the same thing. Swapping
either is a new package plus one line in `apps/runtime/src/index.ts`. Nothing in
`core`, the API contract, or the UI knows a vendor name, and
`test/architecture.test.ts` fails the build if that changes.

**Why PI's RPC mode rather than scraping the TUI:** `pi --mode rpc` streams structured
events and answers `get_session_stats`, which returns
`contextUsage: { tokens, contextWindow, percent }` — that is where the 30% / 50%
pressure signal comes from, with no screen-scraping. It runs the same agent, same
system prompt, same tools, and makes no extra model calls, so results and token cost
match a terminal run. A raw PTY backing is available for harnesses that only speak a
terminal.

## 🪪 Agent profiles

Each agent can carry a small, human-authored identity that shapes how it works. It is
stored as one markdown file per agent, so you can edit it on disk or from the agent's
inspector in the UI; either way the next run picks it up without restarting the office.

```text
<AI_OFFICE_DATA_DIR>/agents/<agentId>.md
```

The file has two `##` sections. Anything else is ignored, and a missing section reads
as empty, so a hand edit cannot break the parser.

```markdown
## Description

Tech lead for the payments squad.

## Instructions

You are the tech lead. You own the build and the release checklist.
Run `npm test` before marking work done. Raise blockers to the orchestrator.
```

- **Description** is operator-facing only: the UI shows it, the model never sees it.
  Maximum 500 characters.
- **Instructions** are delivered to the harness as a distinct system message
  (`--append-system-prompt` for PI), separate from the task instruction. Maximum
  20,000 characters.

The office still authors no prompt content: a run's instruction is byte-identical to
the task, and with no saved instructions a run is exactly a shell run. The limits are
enforced by the contract and again in the domain, so an over-long profile is rejected
before anything is written.

## 📁 Repository layout

```
openspec/                      # ← the source of truth (specs, changes, config)
  specs/                       #   baseline capabilities (populated on archive)
  changes/add-ai-office-mvp/   #   proposal + design + tasks + 5 delta specs
packages/
  contracts/                   # zod schemas, event envelope, error shape, version
  core/                        # domain rules, state machine, pressure, ports (pure)
  adapter-pi/                  # PI harness (RPC) + DeepSeek model provider
  adapter-session/             # pipe + pty process backings
  adapter-store-file/          # write-behind atomic JSON snapshots
  adapter-fake/                # scripted harness, memory store/session (test doubles)
apps/
  runtime/                     # composition root: HTTP + WebSocket + hub
  web/                         # React + Three.js office
docs/engineering-guidelines.md # the rules (complexity, testability, layering)
AGENTS.md                      # short instructions for AI agents
test/                          # architecture + code-health gates
```

## 📐 The capabilities

Each is a spec under [`openspec/specs/`](openspec/specs) (the baseline; in-flight
changes live under [`openspec/changes/`](openspec/changes) until archived).

| Capability | Covers |
|---|---|
| [`harness-adapters`](openspec/specs/harness-adapters/spec.md) | The two ports, the registry, normalized events, zero-overhead execution, session telemetry, interactive prompting, PI + DeepSeek. |
| [`agent-terminals`](openspec/specs/agent-terminals/spec.md) | One session per task, PTY *or* structured backing, streaming, scrollback backfill, telemetry, teardown. |
| [`agent-orchestration`](openspec/specs/agent-orchestration/spec.md) | Agents, departments, task queues, dependencies, parallel runs, task results, context pressure, delegation, persistence. |
| [`office-runtime-api`](openspec/specs/office-runtime-api/spec.md) | Versioned HTTP + realtime contract, snapshots, filters, telemetry exposure, error shape, local-first binding. |
| [`office-3d-ui`](openspec/specs/office-3d-ui/spec.md) | Scene, swappable avatar, state- and pressure-driven visuals, click-to-inspect, live updates, accessible list fallback. |
| `inter-agent-communication` | Derived communication events, the dashed markers, and their summaries. |

## 📨 Inter-agent communication

Two agents exchanging work are drawn as a communication, but the office **derives**
this from interactions it already performs — it is **not a chat protocol**, and no
message is sent between harnesses.

A communication event is created when:

- **Delegation** — a task is created for one agent with another agent as its origin
  (`originAgentId` in the API). The event is a `request` from the creator to the
  assignee.
- **Hand-off** — a dependent task starts and receives another agent's results. The
  event is a `handoff` from the producing agent to the consuming agent, and is
  `answered` on delivery.

Where it shows up:

- **3D office** — a dashed line between the two bots with an envelope at its midpoint.
  The colour follows the lifecycle (`open`, `answered`, `failed`, `cancelled`).
- **Transcript** — a dashed separator with an envelope interleaved into the retained
  session output at the point the communication was recorded.
- **Inspector** — a **Communications** list, so every event is reachable without the
  3D view.

**Hover or keyboard-focus** a marker to see the summary: the direction (`Ada → Grace`),
what is being asked or delivered, the related task, the status, and the time. The text
comes from one shared pure function (`describeCommunication`), so the 3D marker, the
transcript marker, and the inspector list can never disagree. Events are retained in a
bounded ring with the office state and survive a restart.

## 🛠️ Development

**The rules are written down and mostly enforced:**

- 📏 [`docs/engineering-guidelines.md`](docs/engineering-guidelines.md) — complexity
  budgets, testability rule of thumb, architecture invariants, style.
- 🤖 [`AGENTS.md`](AGENTS.md) — the short version for AI agents.
- ✅ `npm test` enforces the numbers: `test/code-health.test.ts` (file length, nesting
  depth, no `any`, every workspace must ship tests) and `test/architecture.test.ts`
  (dependency direction, no vendor names in shared layers). Exceptions are documented
  and shrink-only.

**Spec-driven workflow** — behaviour changes start as a spec change:

```bash
/opsx-propose "add a shared long-lived session option"   # proposal + delta specs + design + tasks
/opsx-apply                                              # implement against tasks.md
/opsx-archive                                            # merge into openspec/specs/
openspec validate add-ai-office-mvp --strict             # must be clean before archiving
```

Hard rule: **no behaviour change without a spec change.** If the code and the spec
disagree, the spec wins — or the spec is updated deliberately in the same change.

## 🗺️ Status and roadmap

This is an **MVP**: the specs above are implemented and verified, with these gaps
recorded in [`tasks.md`](openspec/changes/add-ai-office-mvp/tasks.md#notes-and-deviations):

- [x] Browser-level Playwright e2e (`npm run e2e`): boots the runtime with the
      fake adapter and drives the real UI in Chromium with no PI, no credentials,
      and no WebGL
- [ ] Opt-in smoke test against a real PI install + DeepSeek credentials
- [ ] Split `packages/core/src/office.ts` (documented size exception, shrink-only)
- [ ] ESLint + `sonarjs/cognitive-complexity` once `typescript-eslint` supports the
      TypeScript 7 toolchain
- [ ] A UI toggle to pick the PTY backing for PI instead of RPC
- [ ] Authorization hook, multi-user, remote execution
- [ ] Deeper agent-to-agent coordination (today: task delegation + dependency hand-off)

## ⚠️ A note on bot assets

No third-party character models are shipped. The default bot is built from primitives
(capsule, visor, status light) and needs no assets. `avatars/manifest.json` is the
extension point for your own glTF models — please respect the licences of anything you
add. ("Astro Bot" is a Sony Interactive Entertainment property and is not included or
affiliated with this project.)

## 📄 License

Private project. No license granted for redistribution.
