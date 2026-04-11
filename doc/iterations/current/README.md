# Current iteration

## Purpose of this folder

`doc/iterations/current/` is the **timeboxed** view of work: what this iteration is trying to ship, what is in progress, and what is explicitly out of scope.

Use it to:

- align agents and humans on **active goals** and **release scope**
- record **known blockers** and **deferred** items
- avoid starting work that belongs to a later iteration

## Evergreen vs current

- **Current iteration** (this directory): sprint or milestone-specific notes.
- **Change routing** (where to edit code by area): see [../change-routing.md](../change-routing.md) — stable, not replaced each iteration.
- **Iterations index**: see [../README.md](../README.md).

## Status

This directory is the placeholder for the current iteration plan.

Recommended contents as the process matures:

- active goals
- in-progress tasks
- known blockers
- release scope
- deferred items

## Relationship to agent task files (`memory/tasks/`)

- **`doc/iterations/current/`** describes *this iteration’s* goals, scope, and blockers — suitable for planning and alignment.
- **`memory/tasks/<task>.md`** holds *execution-level* detail for a single task (files in play, breakpoints, step-by-step progress, timestamped micro-decisions). It may span multiple sessions and is optimized for **resuming agent work**.

If both apply, keep iteration notes summary-level and **link** to a task file for deep context instead of duplicating it here.
