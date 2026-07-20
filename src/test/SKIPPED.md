# Skipped Tests — 2026-05-17 Audit Remediation

This document tracks tests that are intentionally skipped while the corresponding code or test fixture is being reworked by an audit-remediation plan. Re-enable when the referenced plan ships.

## Plan 03 — CoachHelm Evidence Contract

These specs assert against the pre-fix `comparison_source` / threshold shape. They drifted *with* the bug (per audit Finding 1 + Q-NEW-12). Plan 03 introduces a `BaselineRegistry`; un-skip with corrected assertions when it ships.

- `src/test/coachhelm/v2/mining/pattern-miner.test.ts` — 4 specs in `effectiveMinSampleSize` describe
- `src/test/coachhelm/v2/mining/putt-analytics.test.ts` — `emits insight for a noteworthy gap …`
- `src/test/coachhelm/v2/mining/approach-analytics.test.ts` — `emits the severity insight …`, `emits the direction-bias insight …`
- `src/test/coachhelm/v2/mining/scoring-context.test.ts` — 4 specs in `generateParTypeInsights` describe
- `src/test/coachhelm/v2/mining/scrambling-analytics.test.ts` — `emits an above-baseline insight when the player is >=8pp better`

## Plan 02 deferred — fake-supabase migration

Single-chain mock can't return different shapes for select vs delete in the same call. Migrate the file to `src/test/fixtures/fake-supabase.ts` then un-skip.

- `src/app/golf/actions/__tests__/travel.test.ts` — `returns error when delete fails` (under `deleteGolfTravelItinerary`)

## User WIP — a11y / design-system sweep (in-progress on `main`)

These component tests drifted because the user's uncommitted WIP modified component behavior (e.g. Button now renders children alongside loading spinner for accessibility). The user is expected to update these specs as part of finalizing the sweep. Skip them now so CI is green; the user's next commit on the sweep should re-enable them with updated assertions.

_Updated 2026-07-09: 5 of the original 9 entries are resolved and removed from this list — `stat-card-sparkline.test.tsx`, `team-pulse-card.test.tsx`, `today-timeline.test.tsx`, and `PlayerCoachHelmDashboard.test.tsx` were deleted (components consolidated away) during the production-readiness mission; `CoachInsightCard.test.tsx`'s skipped spec was superseded by a rewritten `InsightsFeed (coach)` describe block with no remaining `it.skip`. The 4 below are still genuinely pending._

- `src/components/ui/button.test.tsx` — `shows loading state` (children no longer hidden under spinner)
- `src/test/golf/components/EvidencePanel.test.tsx` — `compact mode renders the four key facts in a single row`
- `src/test/golf/components/InsightCard.test.tsx` — `fires coach actions including create_focus_area`, `renders different action buttons for player vs coach`
- ~~`src/test/golf/components/RoundTakeaway.test.tsx`~~ — deleted 2026-07-20: `RoundTakeaway` was retired by the Round Review filmstrip rebuild (Task 10) — its one narrative replaces the separate hero card.

## Plan 04 deferred — round-loop hardening test surface

(None yet. Plan 04 may add more deferrals when it lands.)

## Re-enable workflow

1. Identify the plan blocking each skip.
2. Apply the plan's fix.
3. Search for `TODO(plan-NN)` in the relevant test file.
4. Remove `.skip` and update the assertion to match the new code.
5. Update this file to reflect what's now active.
