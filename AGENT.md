# AGENT.md

## Purpose

This file is the working handbook for coding agents operating in `Echo_web`.

`Echo_web` combines:

- a React + Vite client
- a Node/Express backend
- Prisma persistence
- Zustand runtime state
- an AI orchestration layer
- prompt assets under `skills/`
- several user-facing modules that all depend on the same `Task` lifecycle

Small local edits can easily create product-level regressions. Agents must therefore use this file as an execution contract, not as optional guidance.

## Memory Activation (Must be executed for each new conversation)

Follow **Injection Types** and **Recall Protocol** in `MEMORY.md`. At minimum:

### Step 1: Instruction + global memory
1. This file (`AGENT.md`) — instruction memory (already in scope when injected).
2. `MEMORY.md` — index, knowledge routing, injection/recall/write-back rules.
3. `memory/metadata/memory-policy.md` and `memory/metadata/project-profile.md` — behavior and snapshot (load once per conversation; cache unless edited).
4. `memory/main.md` — roadmap, active branch pointer, memory taxonomy.

### Step 2: Task memory
1. Read the active branch file (default `memory/branch/active-default.md` unless `memory/main.md` points elsewhere).
2. If it links to **`memory/tasks/<task>.md`**, open that file for full goal, plan, progress, working context, and decision log.
3. For **iteration-level** scope (goals, blockers, release boundaries), use `doc/iterations/current/README.md` — do not duplicate long execution notes there; keep drill-down in `memory/tasks/`.

### Step 3: Log memory (as needed)
Skim recent entries in `memory/commit.md` for continuity on long or resumed threads. Open `memory/log.md` only when verbatim history or timeline reconstruction is needed.

### Step 4: Knowledge memory (on demand)
Pull **minimal** paths from `doc/` using the **Knowledge routing** table in `MEMORY.md`—not the whole tree.

### Step 5: Confirm readiness (optional)
When useful, one line: which files were read and the current task goal from the active branch.

## Write-back rules (must be executed before the end of each conversation)
See `MEMORY.md` § Write-back Protocol, then § Forgetting & archive **post-write check** (load `memory/metadata/forget-policy.md` only if triggers T1–T3 apply).


## Environment Context

### Product Snapshot

Echo is an AI-assisted planning product for users who feel overloaded by too many tasks, fragmented time, and weak day-to-day execution follow-through.

The product has four critical modules:

- `Focus Funnel`
  - turns a brain dump into structured tasks
  - uses AI to decompose, classify, and prioritize work
  - triggers a four-question decision flow when the user has too many candidate tasks

- `Fluid Timeline`
  - converts decisions into a schedule
  - supports drag, resize, edit, drawer, and icebox flows
  - is the main execution surface for daily tasks

- `Commute Pod`
  - supports short focused sessions for production, growth, or recovery
  - is designed for fragmented time blocks such as commuting or micro-breaks

- `Echo Compass`
  - shows quarterly themes, task forest growth, synergy links, and AI review output
  - helps the user see long-term value accumulation instead of only daily completion

### Core Product Loop

1. The user inputs messy thoughts into the Funnel.
2. AI converts them into structured tasks and workflow notes.
3. The user confirms, edits, and schedules work in the Timeline.
4. Completion updates the Forest and quarterly review layer.
5. Authenticated state is synchronized with the backend.

### Shared Domain Object

The product is centered around `Task`.

If a change affects how a task is created, classified, scheduled, completed, frozen, revived, or persisted, assume the change may impact:

- Funnel
- Timeline
- Compass
- backend sync
- AI prompts

## Documentation Navigation

Use the documentation set first before making structural changes.

| What you want to do | Where to look |
|-----------|---------|
| Understand the system architecture | `doc/architecture/overview.md` |
| Understand module boundaries and dependency rules | `doc/architecture/boundaries.md` |
| Review high-risk components (Funnel, Timeline, App shell) | `doc/architecture/component-notes.md` |
| Check coding standards | `doc/conventions/coding-standards.md` |
| Understand testing rules | `doc/conventions/testing.md` |
| **Current iteration**: active goals, scope, blockers, release notes, deferred work | `doc/iterations/current/README.md` |
| **Iterations folder**: how `current/` relates to evergreen change routing | `doc/iterations/README.md` |
| **Route a code change** by area (where to start, what to verify) | `doc/iterations/change-routing.md` |
| Understand API contracts | `doc/reference/api-spec.yaml` |
| Understand error meanings and recovery guidance | `doc/reference/error-codes.md` |
| Local commands and environment variables | `doc/reference/local-development.md` |
| Known caveats (legacy naming, task save semantics, etc.) | `doc/reference/sharp-edges.md` |
| **Project memory** (index, recall/write rules) | `MEMORY.md` |
| **Memory store** (Git-like context, branches, milestones, log) | `memory/` — start with `memory/main.md` and `memory/metadata/memory-policy.md` |

If a requested document does not exist yet, inspect the implementation directly and keep the new doc aligned with the code after your change.

## Source Of Truth

Use these ownership rules before editing code.

### Shared Type Contracts

- `types.ts` is the canonical source for:
  - `Task`
  - `FocusTheme`
  - `LeafNode`
  - enums
  - shared app concepts

If task semantics change, update `types.ts` first.

### Client Runtime State

- `store/useUserStore.ts` is the source of truth for runtime task/theme state.
- `App.tsx` decides when that state is loaded from or saved to the server.

### Auth State

- `store/useAuthStore.ts` is the source of truth for session handling.
- `services/userDataApi.ts` is the correct place for authenticated data fetch logic.

### AI Behavior

- prompt content belongs in `skills/`
- prompt assembly and parsing belong in `services/geminiService.ts`
- UI components must not embed prompt logic directly

### Persistence Contracts

- request/response behavior belongs in `server/routes/` and `services/userDataApi.ts`
- if a new field must persist, verify typing, serialization, defaults, and route compatibility

## Hard Rules

These rules are mandatory.

### 1. Use Structured Logging

Do not add free-form ad hoc logs for new functionality.

When adding or updating logs:

- prefer structured logs over plain narrative strings
- include stable event names
- include relevant identifiers and state fields
- avoid logging secrets, tokens, or sensitive personal data

Recommended pattern:

```ts
console.info('[echo.event]', {
  event: 'task_saved',
  taskId,
  userId,
  source: 'timeline',
});
```

Bad pattern:

```ts
console.log('Task saved successfully and everything looks fine');
```

### 2. Multi-Agent Collaboration Workflow Is Fixed

When new functionality or code modification is performed through multi-agent collaboration, the workflow must follow this order and role split:

1. `Agent1` implements the core feature.
2. `echo-test-case-agent` writes or updates tests.
3. `Agent3` updates documentation.
4. `code-reviewer` performs code review.

This workflow is mandatory whenever multi-agent collaboration is used.

Do not invent a different role split unless the user explicitly overrides this rule.

### 3. Preserve Product Vocabulary

Use the existing product language consistently:

- Funnel
- Anchor
- Icebreaker
- Drawer
- Icebox
- Compass
- Forest
- Quarterly Themes

Do not introduce competing names for the same concept.

### 4. Preserve User Editability

AI-generated fields such as title, duration, intent, workflow notes, and schedule metadata must remain user-editable unless the feature explicitly requires a lock.

### 5. Keep Prompt Changes Narrow

When editing `skills/`:

- preserve placeholders expected by `fillTemplate`
- preserve strict JSON output instructions where downstream parsing expects JSON
- do not casually mix prompt changes with unrelated parser changes

### 6. Avoid Silent Cross-Layer Drift

If you change task shape or lifecycle semantics, check all of the following before finishing:

- `types.ts`
- affected component
- affected store
- AI service if relevant
- API route if persistence is involved

## Product Invariants

Do not break these unless the change is intentional and documented.

### Task Lifecycle

- AI-generated tasks begin as `CANDIDATE`.
- Funnel decisions promote tasks into `ANCHOR`, `ICEBREAKER`, `PENDING`, or `DRAWER`.
- `startTime`, `dateStr`, `status`, and `isAnchor` must stay coherent.
- frozen tasks are represented by `isFrozen`.
- completed tasks can feed Forest growth and quarterly review behavior.

### Auth And Sync

- unauthenticated users must not behave like authenticated users
- refresh-token-based access recovery must remain intact
- initial hydration and later save sync must not race in a way that drops state

### AI Resilience

- AI-dependent flows must fail safely
- fallback behavior must still produce usable output for the user
- machine-readable prompt outputs must remain machine-readable

### Daily Reset

- daily reset behavior in `store/useUserStore.ts` is product logic
- unfinished anchors must transition according to current reset rules

## Definition Of Done

A change is done only when:

- the affected flow still works end-to-end
- shared task semantics remain coherent
- persistence and hydration behavior still make sense
- AI-dependent paths still fail safely
- required docs and verification updates are complete for the scope of the change
