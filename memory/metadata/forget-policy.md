# Forget policy — forgetting & archive (full specification)

**Read this file when:** a trigger in `MEMORY.md` § Forgetting & archive (triggers & post-write check) is satisfied, or you are about to **move files under `memory/archive/`**, or you are **archiving rows** from `doc/reference/error-codes.md` to `memory/archive/errors-resolved.md` (§ C). Do **not** treat this as mandatory load on every new conversation.

**Directory layout only (when touching `archive/` paths):** `memory/archive/README.md`.

---

## Principles

Material **removed** from active `log.md` checkpoints, from `memory/tasks/`, or **moved** from `doc/reference/error-codes.md` is **moved or summarized**, not silently discarded. Quarter snapshots, task archives, and resolved error rows live under `memory/archive/` (or adjacent policy files).

---

## A) Conversation log (`memory/log.md`)

### Entry definition

Each `### …` checkpoint block under `## Entries` counts as **one** entry. Lines in **`## Historical Log Summary (distilled)`** do **not** count as entries.

### Ordering

**Older checkpoints at the top**, **newer at the bottom** (append new `### …` blocks after the previous one).

### Distillation when entry count > 50

When `## Entries` has **more than 50** entry blocks, run **log distillation**.

**Repeat** until the block count is **≤ 50**:

1. Let **n** = number of `### …` blocks under `## Entries`.
2. **Choose blocks to fold in this pass:**
   - If **n − 10 ≥ 40**: take the **40 oldest** blocks (top 40).
   - Else: take **all except the 10 newest** (i.e. **n − 10** blocks from the top — one summary; **exactly 10** checkpoints remain).
3. **Distill** those blocks into **one** summary of **≤200 Chinese characters** (`汉字`), covering: **完成的任务**, **主要决策**, **主要错误**, **遗留问题** (or the English equivalents used in your log header: completed tasks, major decisions, major mistakes, outstanding issues).
4. **Prepend** that summary to **`## Historical Log Summary (distilled)`** as a new dated sub-block (newest distillation at the **top** of that section, directly under the section heading).
5. **Delete** the folded blocks from `## Entries`.
6. Append a one-line note to `memory/commit.md` (date, how many entries folded in this pass).

**Examples:** n = 51 → one pass folds **41**, leaves **10**. n = 90 → first pass folds **40** (n → 50); second pass folds **40** (n → 10).

### Major release — quarter log snapshot

When the project cuts a **major release**, snapshot the current `memory/log.md` (including **Historical Log Summary** + **Entries**) into:

`memory/archive/log/log-YYYY-Qn.md`

Example: `log-2026-Q2.md`. Use the calendar quarter of the release tag or the agreed release window.

### Recall note

Routine work: use **Historical Log Summary** + **recent Entries**; open `memory/archive/log/` only for archaeology or compliance.

---

## B) Task branch + task files (`memory/branch/`, `memory/tasks/`)

### Completed task

The task file marks completion and records **`Completed: YYYY-MM-DD`** (see `memory/tasks/README.md` and `_template.md`).

### Retention

Keep the file under `memory/tasks/` for **30 days** after the `Completed:` date.

### Archival pass (≥ 30 days after Completed)

1. **Move** the file to `memory/archive/task_branch/{original-basename}-{archive-date}.md`  
   - `{original-basename}` = filename without `.md`  
   - `{archive-date}` = archival run date `YYYY-MM-DD`
2. If **`memory/branch/active-default.md`** pointed at that task file, **rewrite** the pointer: set **Task file** to the current active task (or `TBD` + one-line goal), update **Last updated**.
3. Ensure the original path under `memory/tasks/` is gone (no duplicate).
4. Note in `memory/commit.md` (short line: what was archived).

### After a major version release

Maintainers **may** permanently delete some `memory/archive/task_branch/*.md`; record that decision in `memory/commit.md`. Default: **keep** archives unless explicitly purged.

---

## C) Error registry (`doc/reference/error-codes.md` → `memory/archive/errors-resolved.md`)

### When to archive (all must be true)

1. **Resolved:** fix or handling is in production (or agreed baseline) and verified; no open P0/P1 to re-hit the same failure mode.
2. **Low recurrence risk:** maintainer judges the class is unlikely under current code paths (guards, tests, or API contract lock-in).
3. **Stale:** **Last seen** in `error-codes.md` is **≥ 90 days** before the archival run date, **or** `—` with no internal evidence of occurrence in that window and incident was single-shot (document judgment in `memory/commit.md` one line).

### Steps

1. Open **`memory/archive/errors-resolved.md`** and append a new `### err-<slug>` block with **one sentence each:** Status (resolved + recurrence + last triggered), Symptoms, Root cause, Resolution.
2. **Remove** the full row from the **active** area table in **`doc/reference/error-codes.md`**.
3. In **`doc/reference/error-codes.md` § Archived entries**, add a pointer row: HTTP, Message, **Archived on** (`YYYY-MM-DD`), and link to `../../memory/archive/errors-resolved.md#err-<slug>` (relative from `doc/reference/`).
4. **Do not delete** the information: it now lives only in `errors-resolved.md` with explicit **Status**; future changes **edit status** there, do not drop the section.
5. Note in **`memory/commit.md`** (which slug moved, date).

### Recall

Agents debugging **old** incidents: read **`memory/archive/errors-resolved.md`** after the active `error-codes.md` tables.

---

## Quality

- No secrets in distilled text or archive files.
- Prefer references to paths and decisions over pasting large code blocks into archives.
