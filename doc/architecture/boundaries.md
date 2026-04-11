# Module Boundaries

## Goal

This document defines ownership boundaries and dependency expectations for the current `Echo_web` codebase.

Agents should use these rules to avoid cross-layer drift and accidental coupling.

## Boundary Rules

### 1. Shared Domain Contracts

- owner
  - `types.ts`

- responsibilities
  - define `Task`, `FocusTheme`, `LeafNode`, enums, and shared app contracts

- rules
  - if task semantics change, update `types.ts` first
  - do not create component-local shadow models for shared task concepts

### 2. UI Components

- owner
  - `components/`

- responsibilities
  - render product experiences
  - handle local interaction state
  - call services and stores

- rules
  - components must not own persistence contracts
  - components must not embed prompt templates directly
  - components should not duplicate auth fetch behavior

### 3. Runtime State

- owner
  - `store/useUserStore.ts`
  - `store/useAuthStore.ts`

- responsibilities
  - maintain runtime task, theme, session, and daily state

- rules
  - runtime state belongs in Zustand, not scattered across multiple top-level components
  - `App.tsx` may orchestrate hydration and synchronization, but should not replace store ownership

### 4. AI Orchestration

- owner
  - `services/geminiService.ts`
  - `skills/`
  - `utils/skillLoader.ts`

- responsibilities
  - prompt assembly
  - model request handling
  - response parsing
  - AI fallback behavior

- rules
  - prompt text belongs in `skills/`
  - parsing and routing belong in `services/geminiService.ts`
  - UI components must consume service output, not reconstruct prompt logic

### 5. Client API Access

- owner
  - `services/userDataApi.ts`
  - `services/authApi.ts`

- responsibilities
  - frontend access to backend routes
  - token-aware request behavior

- rules
  - authenticated fetches belong here
  - do not duplicate bearer token logic inside components

### 6. Backend Routes

- owner
  - `server/routes/`
  - `server/middleware/`
  - `server/lib/`

- responsibilities
  - input validation
  - auth checks
  - persistence coordination
  - server response shape

- rules
  - backend route files define the actual API contract
  - route validation must happen before persistence writes
  - auth enforcement for protected routes must go through middleware

### 7. Persistence

- owner
  - `prisma/schema.prisma`

- responsibilities
  - database schema and storage model

- rules
  - storage-model changes must be reflected in routes and client expectations
  - task payload fields stored as JSON still require explicit typing and default handling in the app

## Dependency Rules

### Allowed Direction

Preferred dependency direction:

1. `types.ts`
2. `services/` and `store/`
3. `components/`
4. `App.tsx`

Backend side:

1. `server/lib/`
2. `server/middleware/`
3. `server/routes/`
4. `server.js`

### Disallowed Or Discouraged Patterns

- components importing prompt markdown directly
- components implementing raw authenticated fetch logic
- stores importing UI components
- route logic depending on frontend-only state
- prompt assets being treated as free-form copy unrelated to downstream parsing

## High-Risk Boundaries

Changes are high-risk when they cross one or more of these boundaries:

- `Task` shape changes across UI, store, and persistence
- task status semantics across Funnel and Timeline
- auth session handling across store and backend
- prompt output format changes across `skills/` and `services/geminiService.ts`
- focus theme changes across onboarding, Compass, and backend routes

## Review Expectation

When a change crosses boundaries, verify all affected owners before considering the task done.
