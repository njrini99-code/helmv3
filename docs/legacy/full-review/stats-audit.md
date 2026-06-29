# Stats Tab Wiring Audit — investigator-1

Scope: `src/app/golf/(dashboard)/dashboard/stats/**`, `src/components/golf/stats/**`, plus referenced server actions.

## Stats Tab Wiring Gaps

### Confirmed Gaps (High confidence)

None. Every data path traces to a real implementation:

- `stats-client.tsx` imports 7 server actions from `src/app/golf/actions/stats-data.ts` — all 7 exist (`getDetailedStats` L947, `getSprayChartData` L999, `getFilterOptions` L1820, `getCourseBreakdown` L1874, `getWorstHoleAnalysis` L1989, `getTrendAnalysis` L1258, `getCoachRosterStats` L2196).
- `StatsIntelligenceStrip.tsx:114` calls `getPlayerStatsIntelligence` — defined at `src/app/golf/actions/stats-intelligence.ts:205`.
- `team/page.tsx:7` calls `getTeamStatsIntelligence` — defined at `src/app/golf/actions/stats-intelligence.ts:288`.
- `stats-client.tsx:826` calls `refreshPlayerAnalysisAsCoach` — defined at `src/app/golf/actions/insights.ts:3296`.
- Zero `mock|MOCK|fixture|dummy|lorem|TODO|FIXME|XXX|HACK` markers across all stats files (one HTML `placeholder=` attribute at `stats-client.tsx:959` is a search-input placeholder, not a code stub).
- All 9 section components (`OverviewStats`, `ScoringStats`, `DrivingStats`, `ApproachStats`, `PuttingStats`, `ScramblingStats`, `StrokesGainedStats`, `ProgressStats`, `DispersionStats`, `AnalysisStats`) are imported and rendered (`GolfStatsDisplay.tsx:262-271`), each receiving live props.
- `team-stats-table.tsx:448` rows link to `/golf/dashboard/stats?player=${id}` (consumed by `stats-client.tsx:31` via `initialPlayerId`) and `:537` to `/golf/dashboard/players/[playerId]` — that dynamic route exists at `src/app/golf/(dashboard)/dashboard/players/[playerId]/`.
- Direct Supabase queries in `stats-client.tsx:559-578` and `team/page.tsx:79-137` use real tables: `golf_rounds`, `golf_team_members`, `golf_players`, `golf_teams`, `golf_holes` (all match `memory/glossary.md`).

### Likely Gaps (Medium confidence)

- `TODO.md:98` — flags missing detail page `/golf/dashboard/stats/[id]` — Minor — This is a route-audit-script artifact, not an actual gap. The stats UI uses query-param drilldown (`/stats?player=…`) wired through `stats-client.tsx:26-31` and player profile drilldown via `/dashboard/players/[playerId]`. Per-round detail is handled by `/dashboard/rounds/[id]` referenced at `stats-client.tsx:1240`. Recommend either deleting the TODO entry or scoping it to "evaluate whether `/stats/[id]` is needed" — the current architecture intentionally avoids it.
- `stats-client.tsx:491` — strengths/weaknesses computation has a silent `catch` that returns `null` with no logging — Minor — Wrap in `console.warn` or surface via Sentry to avoid degraded UI going unnoticed.
- `stats-client.tsx:679, 644` — spray-chart and analytics fetch errors are swallowed with `// handled by null state` comments — Minor — Could cause silent partial-data renders; consider logging.

### Inconclusive

- The `getTeamComparison` export at `stats-data.ts:1510` is not referenced from any file in the stats scope — possible dead code, but outside this hypothesis scope (could be used by other dashboards). Reporting per scope-discipline rule.
- `getDetailedStatsAsAdmin` at `stats-data.ts:977` — likewise not used by stats tab; admin-only.

## Summary

The Stats tab is **fully wired** end-to-end. Personal stats (`/golf/dashboard/stats`) load via 7 typed server actions plus 1 direct Supabase query for round summaries; coach team view (`/golf/dashboard/stats/team`) computes everything server-side from `golf_rounds` + `golf_holes` and renders through a prop-driven table; the CoachHelm AI strip reads pre-computed engine output via `stats-intelligence.ts`. There are zero mock/placeholder/TODO markers in the code, all imported actions exist, all 9 stat section components render with live data, and all internal links target existing routes. The only "gap" surfaced — `TODO.md:98` calling for `/stats/[id]` — appears to be a stale route-audit artifact since the actual UX uses `?player=` query params and the separate `/players/[playerId]` route. Single biggest follow-up: triage the stale `TODO.md:98` entry and add error logging to the three swallowed catch blocks.
