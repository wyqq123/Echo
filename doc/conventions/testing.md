# Testing Standards

## Goal

This document defines the minimum testing expectations for work in `Echo_web`.

The repository currently depends heavily on manual verification, so testing guidance must cover both automated and manual checks.

## Test Levels

### 1. Unit-Level Logic Tests

Use targeted tests for logic that can be isolated, especially:

- task transformation logic
- status transition logic
- date and reset utilities
- parsing helpers
- token and auth helper logic

### 2. Integration-Level Flow Tests

Prefer integration coverage for flows that cross module boundaries, especially:

- auth refresh behavior
- task fetch and save behavior
- focus theme fetch and save behavior
- onboarding save behavior
- AI fallback behavior when service calls fail

### 3. Manual Product Verification

Manual verification is currently required for high-interaction UI surfaces such as:

- `components/FocusFunnel.tsx`
- `components/FluidTimeline.tsx`
- `components/EchoCompass.tsx`
- auth and onboarding flows

## Required Manual Checks

### Baseline Checks

- app starts without crashing
- auth gate behaves correctly
- backend routes still respond as expected

### Funnel Changes

- brain dump still produces usable tasks
- generated tasks remain editable
- first-time and subsequent decision flows still work
- AI failure path still falls back safely

### Timeline Changes

- drag and resize still work
- drawer behavior still works
- icebox behavior still works
- completion still updates task state correctly

### Persistence Changes

- tasks can still be loaded and saved
- focus themes can still be loaded and saved
- onboarding persistence still works

### Auth Changes

- register works
- login works
- refresh works
- logout works
- protected routes reject invalid tokens

<!-- ## Multi-Agent Testing Rule

When multi-agent collaboration is used for a feature or code modification:

1. `Agent1` implements the core feature.
2. `Agent2` writes or updates tests.
3. `Agent3` updates documentation.
4. `Agent4` performs code review.

This rule is mandatory unless the user explicitly overrides it. -->

## Test Design Guidance

- prefer narrow tests over brittle full-app mocks
- test task lifecycle transitions explicitly
- test protected route failure behavior explicitly
- test AI parsing code against malformed responses when possible
- do not treat prompt changes as safe without verification

## Minimum Done Criteria

A meaningful code change is not done until:

- relevant automated checks are added or updated when practical
- required manual checks are completed for the changed flow
- documentation is updated when behavior or contracts changed
