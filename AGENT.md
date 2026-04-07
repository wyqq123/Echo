# AGENT.md

## Product Summary

`Echo_web` is an AI-assisted daily planning product. The core loop is:

1. The user brain-dumps work into the Funnel.
2. AI decomposes and classifies that input into structured tasks.
3. The user curates and schedules those tasks in the Timeline.
4. Task completion feeds the Compass/Forest layer and quarterly review logic.
5. Authenticated users sync tasks, themes, and funnel runs to the backend.

The product is centered around one shared domain object: `Task`.

If a change alters how a task is created, scheduled, completed, frozen, revived, or persisted, assume the change may affect all four product surfaces:

- Funnel
- Timeline
- Compass
- Pods

## Primary Goals For Any Agent

When working in this repo, optimize for these outcomes:

- Preserve the task lifecycle end-to-end.
- Keep AI-generated structure editable by the user.
- Avoid splitting business rules across too many layers.
- Keep frontend state and server persistence consistent.
- Respect the product's intentional UX language: Funnel, Icebox, Anchor, Icebreaker, Forest, Compass.

## Architecture Overview

### Frontend Shell

- `App.tsx`
  - Top-level orchestration.
  - Handles auth hydration, server bootstrap, local persistence for some app state, and tab routing.
  - Bridges reducer-managed UI state with Zustand stores and server sync.

### Core Product Surfaces

- `components/FocusFunnel.tsx`
  - Brain-dump intake.
  - AI task generation preview.
  - Funnel decision matrix flow.
  - First-time and subsequent prioritization behavior.

- `components/FluidTimeline.tsx`
  - Scheduling UI.
  - Drawer and Icebox management.
  - Task editing, drag/resize, and completion interactions.

- `components/EchoCompass.tsx`
  - Quarterly themes, forest growth, and synergy layer.

- `components/CommutePod.tsx`
  - Pod-oriented activity/ritual surface.

- `components/EchoOnboarding.tsx`
  - Captures initial user profile and quarterly themes.

- `components/AuthScreen.tsx`
  - Sign-in/sign-up entry.

### Client State

- `store/useUserStore.ts`
  - Shared task/theme runtime state.
  - Daily reset logic.
  - Commute stats and AI report state.

- `store/useAuthStore.ts`
  - Auth session state.
  - Access/refresh token flow.
  - Session clear/reset behavior.

### AI Layer

- `services/geminiService.ts`
  - Despite the filename, this is currently a Qwen/DashScope-backed orchestration layer through the local proxy endpoints.
  - Owns task parsing, segmentation, feature extraction, decomposition routing, funnel script generation, semantic forest merge, and quarterly review generation.

- `skills/`
  - Prompt assets used by `geminiService.ts`.
  - Treat these as product logic, not copywriting only.

- `utils/skillLoader.ts`
  - Imports raw prompt markdown and fills template variables.

### API Layer

- `server.js`
  - Express entrypoint.
  - Mounts auth and data routes.
  - Exposes Qwen-compatible proxy endpoints for chat and embeddings.

- `server/routes/*.js`
  - Authenticated CRUD-like routes for tasks, focus themes, user info, and funnel run logging.

### Persistence Layer

- `prisma/schema.prisma`
  - User, refresh token, focus theme, task, and funnel run schema.

Important: tasks are persisted as JSON payload blobs keyed by `Task.id`, not decomposed into many relational task columns.

## Source Of Truth Rules

Use these boundaries when deciding where a change belongs.

### Task Shape

- `types.ts` is the canonical shared contract for `Task`, `FocusTheme`, `LeafNode`, enums, and app-level concepts.
- If task semantics change, update `types.ts` first and then propagate carefully.

### Task Runtime State

- `useUserStore.ts` is the source of truth for active tasks and focus themes during runtime.
- `App.tsx` coordinates when that state is fetched or saved to the server.

### Auth State

- `useAuthStore.ts` is the source of truth for session/token handling.
- Authenticated fetch behavior belongs in `services/userDataApi.ts`, not duplicated across components.

### AI Behavior

- Prompt logic belongs in `skills/`.
- Prompt assembly and request/response normalization belong in `services/geminiService.ts`.
- UI components should call the service, not embed prompt behavior inline.

### Persistence Contracts

- Backend request/response contracts live in `server/routes/` and `services/userDataApi.ts`.
- If you add fields to tasks/themes that must persist, verify both frontend typing and backend blob/route compatibility.

## Product Invariants

Do not violate these unless the change is explicitly intended and coordinated.

### Task Lifecycle Invariants

- New AI-generated tasks start as `CANDIDATE`.
- Funnel decisions promote tasks into `ANCHOR`, `ICEBREAKER`, `PENDING`, or later `DRAWER`.
- Timeline scheduling depends on `startTime`, `dateStr`, `isAnchor`, and `status` staying coherent.
- Frozen tasks represent the Icebox and use `isFrozen`.
- Completed tasks can feed Forest growth and quarterly reporting.

### Auth And Sync Invariants

- Unauthenticated users should not hit protected data routes as if they were logged in.
- Refresh-token-based access recovery must continue working after auth-related edits.
- Task/theme sync should not race initial hydration in `App.tsx`.

### AI Workflow Invariants

- Funnel generation, task parsing, and decomposition must degrade gracefully when the AI path fails.
- Fallback behavior should leave the user with usable tasks, not an empty screen.
- Prompt edits should preserve machine-readable output expectations where JSON is required.

### Daily Reset Invariants

- Cross-day reset logic in `useUserStore.ts` is product logic, not a cosmetic behavior.
- Unfinished anchors should move back out of the active schedule path according to current rules.

## Working Agreements For Agents

### 1. Start With The Domain, Not The Component

Before editing UI, identify which domain concept is being changed:

- task creation
- task prioritization
- task scheduling
- task persistence
- theme management
- forest growth
- auth/session flow

Follow that concept through `types.ts`, store, service, component, and server before patching.

### 2. Prefer Existing Vocabulary

Use the product's established language in code and UX:

- Funnel
- Anchor
- Icebreaker
- Drawer
- Icebox
- Compass
- Forest
- Quarterly Themes

Avoid introducing parallel naming for the same concept.

### 3. Keep AI Prompt Changes Narrow

When editing `skills/`:

- preserve placeholders expected by `fillTemplate`
- preserve JSON-only output instructions when downstream parsing expects JSON
- avoid changing both prompt schema and parser logic in unrelated ways at the same time unless necessary

### 4. Preserve User Editability

AI-generated `workflowNote`, title, duration, intent, and scheduling information should remain editable in the UI unless the feature explicitly requires locking them.

### 5. Respect The Existing Data Model

Because tasks are stored as JSON payloads in Prisma:

- new fields are relatively easy to add on the frontend
- but they still require careful handling in typing, serialization, UI defaults, and migration expectations

## Change Map: Where To Edit

### If You Need To Change Brain-Dump Parsing

Start here:

- `services/geminiService.ts`
- `skills/task-segmentation.md`
- `skills/feature-extraction.md`
- relevant chain/domain prompt files in `skills/`

Check impact on:

- `components/FocusFunnel.tsx`
- `types.ts`

### If You Need To Change Funnel Prioritization Logic

Start here:

- `services/geminiService.ts`
- `skills/funnel/first-time.md`
- `skills/funnel/first-time-icebox.md`
- `skills/funnel/subsequent.md`

Check impact on:

- `components/FocusFunnel.tsx`
- `types.ts`
- `services/userDataApi.ts` if logging shape changes

### If You Need To Change Scheduling Behavior

Start here:

- `components/FluidTimeline.tsx`

Check impact on:

- `types.ts`
- `store/useUserStore.ts`
- `App.tsx`

### If You Need To Change Task Persistence

Start here:

- `services/userDataApi.ts`
- `server/routes/tasks.js`
- `prisma/schema.prisma` only if persistence strategy changes materially

Check impact on:

- `App.tsx`
- `store/useUserStore.ts`

### If You Need To Change Auth

Start here:

- `store/useAuthStore.ts`
- `services/authApi.ts`
- `server/routes/auth.js`
- `server/lib/tokens.js`
- `server/middleware/requireAuth.js`

Check impact on:

- `App.tsx`
- all authenticated fetches in `services/userDataApi.ts`

### If You Need To Change Quarterly Themes / Compass / Forest

Start here:

- `components/EchoCompass.tsx`
- `components/EchoOnboarding.tsx`
- `services/geminiService.ts`
- `skills/leaf-merge.md`
- `skills/quarterly-review.md`

Check impact on:

- `types.ts`
- `store/useUserStore.ts`
- `server/routes/focusThemes.js`

## Component Guidance

These notes are based on the current component design and should guide future edits.

### `FocusFunnel.tsx`

This component mixes:

- AI generation
- preview editing
- funnel question flow
- revival of icebox tasks
- assignment of initial schedule metadata

Be careful here. Small edits can affect multiple downstream states.

When modifying it:

- trace every place `generatedTasks` changes status
- verify subsequent mode and first-time mode still both work
- verify revived icebox tasks remain consistent with `isFrozen` handling
- verify final emitted tasks still satisfy Timeline expectations

### `FluidTimeline.tsx`

This file contains heavy interaction logic:

- drag/move/resize
- collision resolution
- task editing modal
- drawer/icebox movement
- completion interactions

When modifying it:

- protect the relationship between `status`, `isAnchor`, `startTime`, and `dateStr`
- avoid introducing silent mutations that break collision resolution
- sanity-check both scheduled tasks and unscheduled drawer/icebox tasks

### `App.tsx`

This is an orchestration layer, not just a shell.

When modifying it:

- be careful with hydration order
- be careful with sync timing and debounce behavior
- do not duplicate store logic that belongs in Zustand or services

## Prompt Asset Guidance

The markdown files in `skills/` are part of the application logic.

Treat them like code:

- make changes intentionally
- preserve required structure
- keep variables aligned with `fillTemplate`
- keep downstream parsing in mind

If a prompt output is parsed as JSON:

- explicitly keep JSON-only instructions
- avoid adding explanatory prose around the output
- verify parser assumptions in `geminiService.ts`

## Verification Checklist

There is limited automated test coverage in this repository, so manual verification matters.

After meaningful changes, verify the affected flow locally.

### Minimum Frontend Checks

- app loads without crashing
- auth gate still behaves correctly
- Funnel can generate tasks
- generated tasks can be edited
- Timeline can save and display tasks
- task completion still works

### If You Touched Funnel Or AI Logic

- brain-dump input still produces tasks
- JSON parsing paths still succeed
- fallback behavior still returns usable tasks when AI calls fail
- first-time and subsequent funnel flows still render coherent options

### If You Touched Timeline Logic

- drag and resize still work
- drawer tasks remain unscheduled until placed
- icebox melt/shatter behavior still works
- anchor scheduling remains sequential

### If You Touched Persistence Or Auth

- login/logout/refresh still behave correctly
- tasks can be fetched and saved
- focus themes can be fetched and saved
- protected routes still reject unauthenticated access

## Commands

Common local commands:

```bash
npm run dev
npm run server
npm run dev:full
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:dev
```

## Environment Notes

Expected environment variables include values like:

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `DASHSCOPE_BASE_URL`
- `QWEN_CHAT_MODEL`
- `QWEN_EMBED_MODEL`
- auth token secrets used by the backend auth routes

Do not hardcode secrets or provider keys into client code.

## Known Sharp Edges

- `services/geminiService.ts` still uses legacy naming even though the live provider path is Qwen via local proxy.
- Some files contain encoding artifacts in comments and strings; avoid broad cleanup unless it is the task, because wide text churn will make review harder.
- `FluidTimeline.tsx` is large and interaction-dense; prefer targeted edits.
- Task persistence currently replaces the user's full saved task set on `PUT /api/tasks`; avoid partial-save assumptions.

## Preferred Style For Future Agents

- Make narrow, high-confidence edits.
- Follow existing architecture before inventing new layers.
- Update shared types before patching around them.
- Preserve product terminology and user-facing intent.
- When changing AI behavior, keep the UX resilient if model output is imperfect.

## Definition Of Done

A change is not done just because the code compiles.

For Echo_web, done usually means:

- the changed flow still works end-to-end
- shared task semantics remain consistent
- persistence and hydration still make sense
- AI-dependent paths still fail safely
- the next agent can understand why the code is shaped the way it is
