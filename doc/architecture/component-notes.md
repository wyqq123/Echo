# High-risk components

Short notes on files that coordinate many concerns. Prefer **narrow edits** and trace state transitions before changing behavior.

## `components/FocusFunnel.tsx`

This file coordinates:

- AI generation
- preview editing
- decision flow
- icebox revival
- initial status assignment
- initial scheduling metadata

Treat it as high-risk for regression. Trace every status transition before editing.

## `components/FluidTimeline.tsx`

This file contains dense interaction logic:

- drag and resize
- collision resolution
- editing modal
- drawer and icebox movement
- completion actions

Treat it as a high-risk execution surface. Protect state coherence.

## `App.tsx`

This file is a coordination layer, not only a layout shell. Be careful with:

- hydration order
- sync timing
- local/server state interplay
