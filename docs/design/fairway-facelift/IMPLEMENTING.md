<!-- markdownlint-disable MD013 -->
# Implementing a coach screen against the field-sheet language

Read this with `LANGUAGE.md` and your screen's `screens/<slug>.v3.md`.
`LANGUAGE.md` decides the composition, the spec decides the content, this
file decides the mechanics.

## The bar

The owner rejected the previous pass with: "It's so basic. Where are the
visuals, the thought, the architecture. You're just putting basic cards
down." A masthead followed by rounded cream boxes, each holding a big number
with a small label or a short list, is a failure however clean the code is.
Every capture is reviewed at full size and sent back if it reads as cards.

## The reference

`src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx` is the
canonical build of the language, with its parts in `coach-home-parts.tsx`
and its pure rollups in `coach-home-logic.ts`.
`src/components/fairway/modules/ScoreField.tsx` is the canonical instrument:
percentage geometry (no measurement pass, no SVG scaling), real rows of real
data, a link per mark, an axis that thins its own labels and yields the right
edge to the Today marker, and a capped stagger entrance.

## Structure

- Pure derivations go in a `<screen>-logic.ts` with unit tests. Components
  read them; they never derive a rollup inline.
- Presentational parts go in a `<screen>-parts.tsx`. The page file composes.
- A new instrument used by ONE screen stays page-local. It joins
  `modules/`, the barrel and `registry.ts` only when a second screen needs
  it, and only with the lead's agreement, because those three files are the
  usual cause of cross-agent commit races.

## Honesty

Every bar, number and sentence comes from a field that exists today, cited
as `path:line` in the spec. A scorecard-only round has no holes, no shots
and no strokes gained. A count query that failed is not a zero. A failed
read must never render as the empty state: say the read failed and offer a
refresh. When a series is too short to be a trend, say what unlocks it.

## Verification, in order

1. `while pgrep -f '^([^ ]*/)?node ([^ ]*/)?tsc( |$)' >/dev/null; do sleep 15; done`
   then `npx tsc --noEmit -p tsconfig.json`.
2. `npx eslint <every changed file>`, zero errors and zero warnings.
3. One vitest runner at a time:
   `while pgrep -f '[v]itest run' >/dev/null; do sleep 10; done` then run
   your scope. Update the existing tests to the new composition; never
   delete coverage to make a suite pass.
4. Captures, serialized behind the shared lock, one viewport per run:
   ```
   until mkdir /tmp/helm-capture.lock 2>/dev/null; do sleep 10; done
   node scripts/ui-intelligence/capture-golf-facelift.mjs \
     --base=http://localhost:3013 --persona=coach --only=<slug> --vp=desktop --force
   node scripts/ui-intelligence/capture-golf-facelift.mjs \
     --base=http://localhost:3013 --persona=coach --only=<slug> --vp=phone --force
   rmdir /tmp/helm-capture.lock
   ```
   Look at both PNGs yourself before reporting. The dev server on 3013 is
   already running and restarts itself under memory pressure: on
   ECONNREFUSED, wait and retry, never start a second server.
5. Never paste dev server output unfiltered; it echoes a password argument.
   Filter with `grep -v -i password`.

## Git

Stage explicit paths. Commit, do not push, do not land. End the message with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011zGybqwusmeKC2jJhsU9JC
```

Record every deviation from the spec, with its reason, in a `## Result`
section appended to your screen's spec file.
