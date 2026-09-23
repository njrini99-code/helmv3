# Change ledger — player_coachhelm_development

## 2026-09-23 — trust rollup no longer counts a thin-sample outcome as measured

- SHA: 390a44c65.
- Change: `getInsightEffectivenessSignals` (event-ledger.ts) gains a
  `coachhelm_trust_status_exclude_unmeasured_outcomes` flag (default off).
  On, a null-`improvement` `golf_insight_outcome` row (thin-sample
  attribution, below attribute.ts's MIN_WINDOW_ROUNDS) is excluded from
  `measured`/`worked` instead of counting as a real measurement. Off is
  byte-identical to prior behavior.
- Why: Package 10 gap audit — the gate "missing post-action evidence
  remains unknown" was violated by the rollup (not the write side, which
  already nulls `lift`/never reaches `nextWeight` for these rows): an
  insight with only thin-sample outcomes could read `needs_validation`,
  or `underperforming` with 3+ such rows, on zero real evidence.
- Verification: 5 new tests (event-ledger.test.ts), full `npm run
  typecheck` (tsc, 0 errors), eslint 0, `npm run docs:check` clean.

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

## 2026-09-23 — coachhelm_trust_status_exclude_unmeasured_outcomes ships enabled

- SHA: 6e4f09466.
- Change: `config/feature-flags.yml`'s
  `coachhelm_trust_status_exclude_unmeasured_outcomes` flag (PR #2034's
  Package 10 missingness fix — a null-`improvement` `golf_insight_outcome`
  row no longer counts as `measured`) is set `default: true` and
  `environment.production/preview/development: true`, with the owner's
  diff numbers recorded in the flag's `purpose` field.
- Why: owner decision, after reviewing the read-only prod trust-tier diff
  (`scratchpad/pr-2034-trust-tier-diff.sql` in the authoring session, not
  executed as part of this repo) — 26 of 68 insights change tier with the
  flag on, all 26 `needs_validation` → `new_hypothesis`, all 26 driven by a
  single thin-sample outcome row, zero `supported`/`promising`/
  `underperforming` insights affected. Also recorded in
  `docs/architecture/coachhelm-evidence-contract.md`'s Package 10 section
  (both owner-escalated items there are now marked RESOLVED) and in #2034's
  PR description.
- Verification: `npm run docs:check` clean (including `markdown:ratchet`,
  re-verified after a reflow needed to dodge an MD018 false-positive on an
  inline `#2034` reference at column 1, same class as SHA a813dcf34).
  **`npm run flags:generate` (regenerates `src/lib/flags/
  registry.generated.ts` from this YAML) has NOT been run** — blocked by
  this session's own tool-permission classifier ("Feature Flag Writes"),
  which denies write actions that flip a flag's shipped default without
  separate, explicit authorization beyond a relayed decision. `npm run
  flags:check` currently reports the generated registry stale relative to
  this YAML change. Someone with that permission (or the user directly)
  needs to run `npm run flags:generate` and commit the result before this
  flag change is actually live or #2034 is ready for review.
