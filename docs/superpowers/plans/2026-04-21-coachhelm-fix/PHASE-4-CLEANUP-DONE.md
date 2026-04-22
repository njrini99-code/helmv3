# Phase 4 Cleanup — Done Marker

Date: 2026-04-21
Branch: main (working directly, per task spec)

## Summary

- **TS6133** before → after: **200 → 0** (-200)
- **TS6196** before → after: **20 → 0** (-20)
- **Total typecheck errors** before → after: **319 → 92** (-227)
- **F9 flipped**: **NO** — `next.config.mjs:32 ignoreBuildErrors: true` stays
  on. Blocker: 92 non-cleanup errors (null-safety + type-mismatch + schema
  drift) remain across CoachHelm V2 stats/shot-analysis/trends files.
  Documented in `F9-REMAINING-ERRORS.md`.

## Commits (6 + this doc = 7)

| # | Hash | Scope | Count |
|---|------|-------|------:|
| 1 | 8ab04059 | chore(cleanup): lib/calendar | 64 |
| 2 | 465f36e8 | chore(cleanup): lib/offline + lib/storage | 33 |
| 3 | d002cf24 | chore(cleanup): auth/admin-logger/error-*/datadog | 32 |
| 4 | 0fec3a61 | chore(cleanup): rest of lib/ (strokes-gained, coachhelm/v2 mining files, cache, notifications, recruiting, etc.) | 43 |
| 5 | 11ea20f0 | chore(cleanup): components + hooks (re-exported orphaned components) | 61 |
| 6 | 60a3fe1a | test(coachhelm/v2): Team B fixture + null-safety fixes | 7 |

## Knip false positives detected (re-exported, not deleted)

The knip purge stripped `export` from these component declarations even
though they look like legitimate UI code with no same-file usage (i.e., they
either have no consumers yet or had their consumers removed separately).
Per task instructions ("err on the side of re-adding `export` rather than
deleting"), I re-added `export` to these rather than deleting:

- `MatchScoreBadge`, `MatchScoreInline`, `MatchScoreRing` (baseball/recruiting-philosophy)
- `GameVsPracticeComparison`, `GameVsPracticeComparisonSkeleton`, `GameVsPracticePanel`, `PlayerPerformanceGrid`, `TeamBattingOverview`, `TrendAnalysisPanel` (baseball command-center analytics)
- `PlayerStatsClient` (baseball/player-stats)
- `CompactRouteErrorBoundary` (errors/RouteErrorBoundary)
- `AlertBadge`, `NavAlertBadge`, `useAlertCounts` (golf coachhelm/alerts/AlertBadge)
- `CoachAlertCenter`, `InsightsFeed` (golf coachhelm/alerts + insights)
- `PremiumStatCard`, `QuickActionCard` (golf/dashboard/premium-components)
- `StatsCardSkeleton`, `CalendarEventSkeleton`, `ShotStatsTabSkeleton`, `SkeletonGrid` (golf GolfSkeletons)
- `AnimatedList`, `PageTransition`, `StaggeredList`, `FadeInCard` (golf layout/animation)
- `PlayerQuickCard`, `RecentActivityFeed`, `ReminderBadge` (golf components)
- `DevPlanMockup` (baseball-mockups)
- `useIsMobile`, `isUserOnline`, `useTeamRouteProtection`, `useAdminAlertsWithToast`, `getAlertDescription`, `getSeverityClasses`, `usePendingInvitations` (hooks)

If any of these are truly dead after team review, they can be removed in a
follow-up pass. Safer to leave them importable.

## Whole-file deletions (nothing imports them anywhere)

- `src/lib/coachhelm/v2/mining/correlation-engine.ts` (486 lines, `CorrelationEngine` class with 0 external refs)
- `src/lib/coachhelm/v2/mining/pressure-analysis.ts` (918 lines, standalone `analyzePressurePerformance` — the live class-based version lives in `stats-insight-generator.ts`)
- `src/lib/coachhelm/v2/mining/resilience-analysis.ts` (853 lines, standalone `analyzeTeamResilience` with 0 external refs)

## Uncertain / left alone

- None. Every flagged declaration was either deleted (0 external refs) or
  re-exported (legitimate-looking UI component where deletion felt risky).

## Lines of code deleted

~5,300 lines across 48 files (primarily strokes-gained.ts collapse and the
three coachhelm/v2/mining dead files). No business logic lost — the
deleted code had zero consumers.

## Next steps (for whoever lands F9)

Read `F9-REMAINING-ERRORS.md`. The 92 remaining errors split into:

1. **CoachHelm V2 hot spots (87)** — written before
   `noUncheckedIndexedAccess: true`. Each array index returns `T | undefined`
   now. Requires site-by-site narrowing, not a mass codemod.
2. **use-auto-save-round.ts (8)** — schema drift: references `.putts`/`.shots`
   on `RoundHole` which no longer has those fields. Needs Team E to align the
   hook with current draft schema.
3. **Component null guards (3)** — single-site `Map.get()` / `find()` results
   missing null check. Easy.

Once those land, flip `next.config.mjs:32` to `ignoreBuildErrors: false` and
confirm `rm -rf .next && npm run build` succeeds.
