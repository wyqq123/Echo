# Change routing guide

Use this guide when you need to change behavior in a specific area: it lists **where to start** and **what to verify** so cross-layer drift is less likely.

This document is **evergreen** (not tied to a single sprint). For timeboxed goals and release scope, see [current/README.md](current/README.md).

## Brain-dump parsing

**Start with:**

- `services/geminiService.ts`
- `skills/task-segmentation.md`
- `skills/feature-extraction.md`
- relevant chain or domain prompt files in `skills/`

**Then verify:**

- `components/FocusFunnel.tsx`
- `types.ts`

## Funnel prioritization

**Start with:**

- `services/geminiService.ts`
- `skills/funnel/first-time.md`
- `skills/funnel/first-time-icebox.md`
- `skills/funnel/subsequent.md`

**Then verify:**

- `components/FocusFunnel.tsx`
- `types.ts`
- `services/userDataApi.ts` if logging payloads or persisted analytics change

## Scheduling or execution UX

**Start with:**

- `components/FluidTimeline.tsx`

**Then verify:**

- `types.ts`
- `store/useUserStore.ts`
- `App.tsx`

## Themes, Forest, or Compass

**Start with:**

- `components/EchoCompass.tsx`
- `components/EchoOnboarding.tsx`
- `services/geminiService.ts`
- `skills/leaf-merge.md`
- `skills/quarterly-review.md`

**Then verify:**

- `types.ts`
- `store/useUserStore.ts`
- `server/routes/focusThemes.js`

## Persistence

**Start with:**

- `services/userDataApi.ts`
- `server/routes/tasks.js`
- `server/routes/focusThemes.js`

**Then verify:**

- `App.tsx`
- `store/useUserStore.ts`
- `prisma/schema.prisma` if the storage model must change

## Auth

**Start with:**

- `store/useAuthStore.ts`
- `services/authApi.ts`
- `server/routes/auth.js`
- `server/lib/tokens.js`
- `server/middleware/requireAuth.js`

**Then verify:**

- `App.tsx`
- all authenticated fetch paths in `services/userDataApi.ts`
