# Echo Memory Entry

This file is the entry point for the project memory system.

## Purpose

- Provide a stable memory architecture for long-running agent collaboration.
- Keep project-level context, branch exploration, milestones, and logs traceable.
- Standardize how memory is injected and updated in each conversation.

## Memory Directory

- Main directory: `memory/`
- Global context: `memory/main.md`
- Branch exploration: `memory/branch/` (active branch file is a **thin pointer**; see below)
- Task detail (full working state): `memory/tasks/` — one file per task thread, linked from the active branch file
- Milestone commits: `memory/commit.md`
- Raw conversation log: `memory/log.md`
- Metadata: `memory/metadata/` (includes **`forget-policy.md`** — **conditional** load; see below)
- Archive (forgotten / retired): `memory/archive/` — layout in `memory/archive/README.md`; procedures in `memory/metadata/forget-policy.md`; resolved API/error rows in `memory/archive/errors-resolved.md`

## Forgetting & archive

### Role of this section vs other files

| Piece | Role |
|-------|------|
| **This section (`MEMORY.md`)** | **Triggers** (when forgetting/archive applies), **relationship** to `log.md` / `tasks`, and **when** to open `forget-policy.md` / `archive/README.md`. |
| **`memory/metadata/forget-policy.md`** | **Full** distillation, task retention, quarter snapshot, and branch-pointer steps. Load **only when a trigger fires** or you are executing those steps. |
| **`memory/archive/README.md`** | **Directory layout** under `archive/`. Read when **performing** moves into `archive/log/` or `archive/task_branch/`. |
| **`memory/archive/errors-resolved.md`** | Archived **resolved** error rows (moved from `doc/reference/error-codes.md`); read when debugging past incidents or after T4. |

### Relationship to `log.md` and `memory/tasks/`

- **`memory/log.md`:** Active checkpoints live under **`## Entries`**. When counts grow past the threshold, **distillation** folds old entries into **`## Historical Log Summary (distilled)`** (see `forget-policy.md`). **Major releases** snapshot the whole file into `memory/archive/log/`.
- **`memory/tasks/` + `memory/branch/`:** Active work and pointers stay hot. **Completed** tasks (with **`Completed:`** date) age **30 days** in `memory/tasks/`, then **move** to `memory/archive/task_branch/` and may require rewriting **`active-default.md`** (see `forget-policy.md`).
- **`doc/reference/error-codes.md`:** Active error catalog with **First discovered**, **Last seen**, **Prevention**; rows eligible for cold storage move to **`memory/archive/errors-resolved.md`** under **T4** (see `forget-policy.md` § C). The doc keeps an **Archived entries** pointer table—**no silent deletion** of facts.

### Triggers (when to forget / archive)

| # | Trigger | Action |
|---|---------|--------|
| T1 | `memory/log.md` → **`## Entries`** has **more than 50** `### …` checkpoint blocks | Read **`memory/metadata/forget-policy.md`** § A; run log distillation; update `memory/commit.md`. |
| T2 | Any **`memory/tasks/*.md`** has **`Completed:`** date **≥ 30 days** before today | Read **`forget-policy.md`** § B; move file to `memory/archive/task_branch/`; fix `active-default.md` if needed; read **`memory/archive/README.md`** for path naming; update `memory/commit.md`. |
| T3 | Project **major release** is tagged / shipped | Read **`forget-policy.md`** § A (quarter snapshot) and optionally § B (purge policy); snapshot `log.md` to `memory/archive/log/log-YYYY-Qn.md`; update `memory/commit.md`. |
| T4 | **`doc/reference/error-codes.md`** row meets **resolved + low recurrence risk + Last seen ≥ 90 days ago** (or `—` with documented stale judgment per § C) | Read **`forget-policy.md`** § C; append to **`memory/archive/errors-resolved.md`**; trim active table; update **Archived entries** pointer table in `error-codes.md`; update `memory/commit.md`. |

### Post-write check (every conversation)

After **Write-Back Protocol** steps for this turn (updates to `log.md`, `memory/tasks/`, `commit.md`, `doc/reference/error-codes.md`, etc.):

1. Count `### …` blocks under **`memory/log.md` → `## Entries`**. If **> 50**, **T1** → load **`forget-policy.md`** and execute.
2. Scan **`memory/tasks/*.md`** for **`Completed:`**. If any date is **≤ today − 30 days**, **T2** → load **`forget-policy.md`** (and **`archive/README.md`** if you need path confirmation), then execute.
3. If the user or maintainer declares a **major release** in this session, **T3** → load **`forget-policy.md`** and execute snapshot (and optional purge) steps.
4. If **`error-codes.md`** was edited or on a periodic audit, scan for rows meeting **T4**; if any, load **`forget-policy.md`** § C and execute.

**Do not** load `forget-policy.md` on every new conversation—only when **T1–T4** applies or you are mid-execution of archiving.

### Routing

| Need | Open |
|------|------|
| Full procedures, examples, loop rules | `memory/metadata/forget-policy.md` |
| What lives under `archive/log/` and `archive/task_branch/` | `memory/archive/README.md` |
| Resolved error archive (T4) | `memory/archive/errors-resolved.md` |

## Boundaries: `doc/iterations/` vs `memory/tasks/`

- **`doc/iterations/`** (especially `current/`): **timeboxed product/engineering plan** — goals, scope, blockers, what ships this iteration. Written for humans and agents to align on *what* the iteration is.
- **`memory/tasks/<task>.md`**: **agent operational workbook** for a single task — resume points, files touched, breakpoints, micro-decisions, step-by-step progress. Optimized for *continuing implementation* across sessions.

Do **not** copy long technical drill-down from `memory/tasks/` into `doc/iterations/current/`; **link** (e.g. “see task file …”) if the iteration doc must reference a thread. Iteration docs should stay review-friendly; task files may be verbose.

## Knowledge routing (`doc/`)

Long-term, reviewable **knowledge** lives under `doc/`. Treat it as the single source of truth for architecture, contracts, conventions, and iteration scope. Do **not** copy those facts into `memory/`; link here and update `doc/` when the truth changes.

| Path | Role | Load when |
|------|------|-----------|
| `doc/README.md` | Documentation index and folder map | Orienting in the doc set; first hop into `doc/` |
| `doc/architecture/overview.md` | System shape and major components | Understanding end-to-end architecture before structural changes |
| `doc/architecture/boundaries.md` | Module boundaries and dependency rules | Refactors, new modules, or cross-layer edits |
| `doc/architecture/component-notes.md` | High-risk components (Funnel, Timeline, App shell) | Touching Funnel, Fluid Timeline, or app coordination |
| `doc/conventions/README.md` | Conventions index | Before adopting or extending team coding/testing norms |
| `doc/conventions/coding-standards.md` | Coding standards | Any non-trivial code change |
| `doc/conventions/testing.md` | Testing rules and expectations | Adding or changing tests, CI expectations |
| `doc/iterations/README.md` | How `iterations/` relates to evergreen docs | Understanding iteration vs permanent reference |
| `doc/iterations/current/README.md` | Active goals, scope, blockers, release notes | Planning work, scoping a task, checking blockers |
| `doc/iterations/change-routing.md` | Change routing by area (where to start, what to verify) | Choosing entry files and verification paths for a change |
| `doc/reference/README.md` | Reference index | Jumping to API, errors, local dev, sharp edges |
| `doc/reference/api-spec.yaml` | HTTP API contract (OpenAPI) | Client/server request shapes, routes, schemas |
| `doc/reference/error-codes.md` | Error meanings, recovery, first seen, last seen, prevention | Handling or surfacing API/auth errors |
| `memory/archive/errors-resolved.md` | Archived resolved errors (low recurrence, stale) | Past incidents after T4 or deep regression lookup |
| `doc/reference/local-development.md` | Commands and environment variables | Running, building, or configuring locally |
| `doc/reference/sharp-edges.md` | Known caveats and semantic gotchas | Avoiding regressions (e.g. task save semantics, legacy naming) |

## Injection Types

Memory is grouped by **what** is being loaded and **when** it enters context. Five types cover instruction, global behavior, working task state, on-demand knowledge, and historical trail.

### 1) Instruction Memory (AGENT)

- **Source:** `AGENT.md`; project rules under `.cursor/rules/` when applicable.
- **Injection timing:** first user meta message of every new conversation (or equivalent: rules + handbook always in scope).
- **Purpose:** execution contract—constraints, boundaries, doc navigation, logging and collaboration rules.
- **Cache:** stable for the session; only re-read if `AGENT.md` or rules change mid-session.

### 2) Global Memory (Memory Plan)

- **Source:** `memory/main.md` (roadmap, memory taxonomy, active branch pointer); `memory/metadata/project-profile.md`, `memory/metadata/memory-policy.md`.
- **Not** loaded every conversation by default: **`memory/metadata/forget-policy.md`** — only when **Forgetting & archive** triggers fire (see that section) or during archive execution.
- **Injection timing:** once per conversation after instruction memory (cache for the rest of the turn unless policy files change).
- **Purpose:** how memory works—types, recall/write-back expectations, and project snapshot metadata.
- **Cache:** treat as session baseline; refresh if the user edits `memory/main.md` or `memory/metadata/*` for this task.

### 3) Task Memory

- **Current task context:** the user’s stated goal, constraints, and success criteria for **this** thread (from the latest messages). Ephemeral unless written down.
- **Branch pointer (persisted, keep small):** the active file under `memory/branch/` (default `memory/branch/active-default.md`, unless `memory/main.md` points elsewhere). It should hold a **one-line goal**, **`Active task file`** path into `memory/tasks/`, and at most a few bullets for scan-level context.
- **Task details (persisted, progressive disclosure):** full notes—background, technical plan, progress, working context (files / modules / step / breakpoint), open issues, related files, decision log (`timestamp | decision | rationale`)—live in **`memory/tasks/<task>.md`**, linked from the active branch file. See `memory/tasks/README.md` and `memory/tasks/_template.md`.
- **Iteration alignment:** when work is iteration-scoped, read **`doc/iterations/current/README.md`** for *plan-level* truth; keep *execution-level* detail in `memory/tasks/`, not duplicated verbatim in iteration docs.
- **Injection timing:** after global memory; load the active branch file first, then the linked `memory/tasks/*.md` when resuming or executing; refresh when task, scope, or strategy shifts.
- **Purpose:** separate **scan** (branch pointer) from **deep** (task file) to save context and stay consistent across sessions.
- **Write-back:** update the **task file** as work proceeds; touch the **branch pointer** only when the task file path or one-line goal changes.

### 4) Knowledge Memory

- **Source:** `doc/` only, using the **Knowledge routing** table above. Pick the **minimal** set of paths for the current task (architecture, conventions, API, iteration scope, change routing, etc.).
- **Injection timing:** **on demand**—when task memory and global memory are insufficient for a correct or safe change.
- **Purpose:** durable, reviewable **domain truth** (single source of truth). Do not mirror full `doc/` content inside `memory/`.
- **Cache:** per sub-task or file cluster; drop from active attention when no longer needed to save context.

### 5) Log Memory

- **Source:** `memory/commit.md` (high-level milestones and deliveries) and `memory/log.md` (raw or near-raw conversation / checkpoint log).
- **Injection timing:**
  - **Commit:** skim or load **recent** entries early in a long-running or resumed effort so continuity and last-known deliveries are clear.
  - **Log:** only when verbatim history, debugging a past decision, or reconstructing a timeline is required.
- **Purpose:** trail of **what was decided and shipped**, separate from evergreen `doc/` and from in-flight branch notes.
- **Write-back:** append to `commit.md` after meaningful subtask completion; append to `log.md` at useful checkpoints (see Write-Back Protocol).

## Recall Protocol (Recommended)

Order reflects dependency: contracts first, then global behavior, then task, then historical trail, then pull knowledge only as needed.

1. **Instruction Memory:** `AGENT.md` (and `.cursor/rules` if used).
2. **Global Memory:** `memory/metadata/project-profile.md`, `memory/metadata/memory-policy.md`, `memory/main.md`.
3. **Task Memory:** active file in `memory/branch/`; then **`memory/tasks/<task>.md`** linked from that file when detail is needed; optionally `doc/iterations/current/README.md` when aligning to iteration **plan** (not for full execution notes).
4. **Log Memory:** recent sections of `memory/commit.md`; `memory/log.md` only when history detail is required.
5. **Knowledge Memory:** `doc/` paths from **Knowledge routing**—minimal subset per task.
6. Conditional loading `memory/metadata/forget-policy.md`

## Write-Back Protocol (Recommended)

- Update `memory/commit.md` after meaningful subtask completion.
- Update the **active task file** in `memory/tasks/` during work (progress, context, decisions); keep **`memory/branch/active-default.md`** (or current active branch) as a short pointer unless the task link or summary changes.
- Create a new `memory/tasks/<task>.md` when starting a materially new thread; update the branch pointer’s **Task file** field.
- Update one branch file in `memory/branch/` when **strategy path** changes (or add a new branch file and update `memory/main.md` pointer).
- Append condensed conversation facts to `memory/log.md` at checkpoints (under `## Entries`). After write-back, run the **post-write check** under **Forgetting & archive**; if **`## Entries`** exceeds **50**, read **`memory/metadata/forget-policy.md`** and distill per § A.
- Keep `memory/main.md` stable; only change for roadmap or global context updates.
- Update the errors and corresponding solutions in `doc/reference/error-codes.md`
- Update `doc/architecture/overview.md` when there is a new decision.


## Injection Protocol (summary)

| Type | Primary sources | When to inject | Typical cache |
|------|-----------------|----------------|----------------|
| Instruction | `AGENT.md`, `.cursor/rules` | Start of every new conversation | Whole session |
| Global | `memory/main.md`, `memory/metadata/project-profile.md`, `memory/metadata/memory-policy.md` | Once after instruction | Whole session unless files change |
| Forget / archive (conditional) | `memory/metadata/forget-policy.md`; `memory/archive/README.md` when writing under `archive/` | After write-back if T1–T3 in **Forgetting & archive**; or during archive ops | One-shot per triggered maintenance |
| Task | User messages + active `memory/branch/*.md` + linked `memory/tasks/*.md` | After global; branch first, task file when executing/resuming | Pointer small; task file as working set |
| Knowledge | `doc/` per **Knowledge routing** | On demand when implementation needs truth | Per sub-task / area |
| Log | `memory/commit.md`, `memory/log.md` | Recent commits early; full log when history needed | Recent tail or one-off deep read |
