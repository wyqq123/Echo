# System Architecture Overview

## Summary

`Echo_web` is an AI-assisted planning system composed of a React frontend, an Express backend, Prisma persistence, and a prompt-driven AI service layer.

The product is organized around one shared domain object: `Task`.

## Top-Level Architecture

### Frontend

- `App.tsx`
  - top-level application shell
  - coordinates auth hydration, server bootstrap, and tab routing
  - synchronizes client state with backend persistence

- `components/`
  - user-facing product modules such as Funnel, Timeline, Compass, Pods, onboarding, and auth

- `store/`
  - Zustand-based runtime state for user tasks, focus themes, auth session, and daily runtime metrics

### AI Layer

- `services/geminiService.ts`
  - orchestration layer for AI-backed decomposition and prioritization
  - despite the filename, it currently calls Qwen-compatible proxy endpoints exposed by the backend

- `skills/`
  - prompt knowledge base used by the AI orchestration layer

- `utils/skillLoader.ts`
  - loads raw prompt files and interpolates template variables

### Backend

- `server.js`
  - Express entrypoint
  - mounts API routes
  - exposes chat and embedding proxy endpoints

- `server/routes/`
  - authenticated and unauthenticated route handlers for auth, tasks, focus themes, user profile, and funnel analytics

- `server/middleware/requireAuth.js`
  - validates bearer access tokens for protected routes

### Persistence

- `prisma/schema.prisma`
  - PostgreSQL-backed data model
  - stores users, refresh tokens, focus themes, tasks, and funnel runs

Important: tasks are stored as JSON payloads keyed by `Task.id`, not as a fully normalized relational model.

## Main Runtime Flow

1. The user enters a brain dump in `FocusFunnel`.
2. `services/geminiService.ts` segments and classifies that input using prompt assets in `skills/`.
3. The frontend receives candidate tasks and renders preview plus decision flow UI.
4. Confirmed tasks move into the scheduling model used by `FluidTimeline`.
5. Client state is managed in Zustand and synchronized to the backend through `services/userDataApi.ts`.
6. Task completion can trigger forest growth and quarterly review behavior in the Compass domain.

## Major Product Modules

### Focus Funnel

- responsibility
  - convert unstructured user input into structured tasks
  - support AI-assisted prioritization

- primary files
  - `components/FocusFunnel.tsx`
  - `services/geminiService.ts`
  - `skills/funnel/`
  - `skills/chains/`
  - `skills/domains/`

### Fluid Timeline

- responsibility
  - schedule and edit tasks
  - manage drawer and icebox flows
  - support daily execution

- primary files
  - `components/FluidTimeline.tsx`
  - `store/useUserStore.ts`

### Commute Pod

- responsibility
  - support focused short sessions for fragmented time

- primary files
  - `components/CommutePod.tsx`

### Echo Compass

- responsibility
  - expose quarterly themes
  - show task forest growth
  - show synergy links and AI review feedback

- primary files
  - `components/EchoCompass.tsx`
  - `skills/leaf-merge.md`
  - `skills/quarterly-review.md`

## Source Of Truth

- shared type contracts
  - `types.ts`

- runtime task and theme state
  - `store/useUserStore.ts`

- auth session state
  - `store/useAuthStore.ts`

- authenticated client API access
  - `services/userDataApi.ts`

- AI prompt behavior
  - `skills/`
  - `services/geminiService.ts`

- backend persistence behavior
  - `server/routes/`
  - `prisma/schema.prisma`
