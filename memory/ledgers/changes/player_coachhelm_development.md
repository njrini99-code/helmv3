# Change ledger — player_coachhelm_development

## 2026-08-26 — log-progress drawers stop autofocusing the measurement field on touch

- SHA: 596913022.
- Change: both LogProgressDrawer copies (FairwayMyDevelopment.tsx and
  golf/coachhelm/home/DevelopmentDrill.tsx) gate the measurement input's
  autoFocus on a fine pointer.
- Why: on iPhone the numeric keypad popped over the drawer before the
  player had read the field's context (owner TestFlight report,
  same class as the event editor).

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/coachhelm`, `dashboard/my-development`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.

## 2026-09-23 — comparable-attribution interventionAt anchors on first action

- SHA: 1021c7e27.
- Change: `causality/comparable-attribute.ts`'s `computeComparableAttribution`
  (and the cron route's bulk pre-filter in `api/cron/v3/causality-attribute/
  route.ts`) now anchor `interventionAt` on an insight's first qualifying
  `golf_insight_action` (`INTERVENTION_ACTION_TYPES` — currently
  `create_focus`/`acknowledged`/`resolved`, provisional) when one exists,
  falling back to first exposure (`shown_at`) otherwise — both call sites
  share the new `resolveInterventionAnchor` so they cannot drift. A new
  `anchor_kind` ('action' | 'exposure') is derived at READ time in
  `attribution-read.ts`'s `attachAnchorKind`, via an exact timestamp-string
  match against `golf_insight_action.created_at` — not persisted, no
  migration. `attribution-view-model.ts` renders "(since first shown)" when
  `anchor_kind` is `'exposure'`; no label is invented yet for `'action'`.
  Behind the existing A9 flag (`coachhelm_analytics`), default off.
- Why: owner decision (Package 10) — an action is stronger evidence of
  engagement than an exposure row, and the exact-match derivation avoids
  a naive "does any action exist" check silently reclassifying an old,
  already-written attribution row when an unrelated later action appears
  for the same insight (attribution rows are written once; actions are
  append-only).
- Verification: `npm run typecheck` (tsc) 0. `npx eslint` on all 8 touched
  source/test files 0. `comparable-attribute.test.ts` 31/31,
  `causality-attribute.test.ts` (cron route) 37/37, `attribution-read.test.ts`
  18/18, `attribution-view-model.test.ts` 19/19 — 105/105 combined. PR #2023's
  `observed-outcome-language.test.ts` guard re-run against this tree via a
  local-only merge (immediately aborted, nothing pushed): 14/14, zero
  violations against the new "(since first shown)" text. `npm run docs:check`
  clean.
