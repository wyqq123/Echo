# Known sharp edges

Caveats that are easy to forget when changing `Echo_web`.

- `services/geminiService.ts` still uses legacy naming although the current provider path is Qwen via local proxy.
- Some files contain text encoding artifacts; avoid broad cleanup unless that is the actual task.
- `components/FluidTimeline.tsx` is large and interaction-dense, so prefer narrow edits.
- `PUT /api/tasks` currently replaces the user's full saved task set; do not assume partial-save semantics.
