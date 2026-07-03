## Alerts [coach]

End-to-end audit of the coach Alerts tab. Route entry:
`src/app/golf/(dashboard)/dashboard/alerts/page.tsx`. Feature spec: `memory/context/golfhelm-features.md` #13 Alerts System.

### Role-gate & auth (correct)

- `AlertsPage` (page.tsx:31-48) resolves `getGolfSessionProfile()`; null → `redirect('/golf/login')`.
- Coach-only enforced at the page: if `!coach` and `player` present → `FeatureUnavailable` (redirect affordance to `/golf/dashboard/coachhelm`); if neither → `/golf/login`. No nav-only reliance. (page.tsx:35-48)
- Team resolved deterministically via `resolveCoachTeamIdWithCookie` (page.tsx:53); no team → `FeatureUnavailable` → Team Settings. Good.
- Every server action in `alerts.ts` calls `supabase.auth.getUser()` then verifies coach ownership (`golf_coaches` by `id` + `user_id`) BEFORE any read/mutate (alerts.ts:36-50, 152-166, 230-244, 290-304, 355-369, 554-568, 612-626). `insights.ts#acknowledgeInsight/dismissInsight` add `verifyInsightAccess` team-scoped ownership checks (insights.ts:1147-1150, 1207-1210). No auth gaps found.

### Actual end-to-end wiring

There are TWO render paths gated by `isRedesignEnabled()` (`NEXT_PUBLIC_REDESIGN`). The flag is `true` in `.env.local` and prod serves the redesign (memory: helmv3 prod serves foundation, "redesign on"), so the **flag-ON path is the live path**.

FLAG-ON (live) — page.tsx:71-90:
1. Server pre-computes badge count: `getAlertCounts(coach.id)` → `signalCount = counts.critical` (urgent+high) (page.tsx:72-73; alerts.ts:142-218).
2. Renders `<FairwayCoachHelmSignals coachId teamId signalSource="insights" defaultFilter={{severity:['urgent','high'], status:'active', signalTypes:['insight','pattern']}} signalCount showScanTeam />`.
3. `FairwayCoachHelmSignals` (client) mount-fetches `getInsightsForCoach(coachId, { limit:100, priorities: defaultFilter.severity })` (FairwayCoachHelmSignals.tsx:362-367, 407-415) → reads `golf_coach_insights` team-wide via RLS, evidence-backed only, visibility-filtered + ranked (insight-delivery.ts:444-581).
4. Rows projected to `SignalRow` via `insightsToSignalRows` (patternToInsightVocabulary.ts:213-231, 363-365); priority mapped `urgent→critical, high→high` (INSIGHT_PRIORITY_MAP, line 101-106).
5. Client filter/sort/group → `InsightCard`/`InsightPanel`. Per-row actions: `acknowledgeInsight`, `dismissInsight` (insights.ts), `createFocusAreaFromInsight` (development.ts) — all preserved, optimistic-with-rollback. Scan-Team → `ScanTeamControl` → `generateAlerts(coachId, teamId)` then re-reads.

FLAG-OFF (dead in prod) — page.tsx:92-111 renders `CoachAlertCenter`, which ALSO uses `getInsightsForCoach` (not `getCoachAlerts`) + `acknowledgeInsight/dismissInsight` + `generateAlerts`. The legacy `getCoachAlerts`/`acknowledgeAlert`/`dismissAlert`/`acknowledgeAllAlerts`/`dismissAllAlerts` in `alerts.ts` and the `AlertCard` component are now orphaned (only `generateAlerts` + the `CoachAlert` type are still referenced).

### Expected vs actual (spec #13)

The spec's data-flow is stale: it claims `AlertsClient → getCoachAlerts() → READ golf_coach_insights WHERE is_alert=true`, level filters All/Critical/Warning/Info/Suggestion, and acknowledge/dismiss via `acknowledgeAlert/dismissAlert`. The live implementation instead:
- Uses `getInsightsForCoach` (insight-delivery), not `getCoachAlerts`. There is no `is_alert` column; selection is `priority in (urgent,high)` + evidence + lifecycle visibility.
- Triage uses `acknowledgeInsight`/`dismissInsight` (insights.ts), not the alerts.ts variants.
- Severity vocabulary is critical/high/medium/low (no "warning/info/suggestion" tier in the live toolbar).

Functionally the live path is a superset (filters, grouping, bulk, export, scan). But it has a correctness bug in the default filter (below).

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | wrong-data | FairwayCoachHelmSignals.tsx:289-301 + page.tsx:81 | Default severity filter is seeded with `['urgent','high']`, but rows' mapped `priority` uses `urgent→'critical'` (patternToInsightVocabulary.ts:101-106; InsightPriority has no 'urgent'). The client filter `!severitySet.has(r.priority)` (line 477) therefore drops every urgent insight: `severitySet={'urgent','high'}` never contains `'critical'`. | On the live Alerts tab, the single most-severe (urgent/critical) alerts are filtered OUT by default; only `high` rows render. Coaches see a partial, lower-priority list as "Alerts". Recoverable only if the coach removes the stale 'Urgent' chip / clears severity. | Seed the severity set with mapped tones: pass `severity:['critical','high']` from page.tsx (keep `priorities:['urgent','high']` for the DB fetch which uses the raw enum), OR normalize the preset in the mount seed via the same `urgent→critical` map. |
| MEDIUM | dead-control | FairwayCoachHelmSignals.tsx:1018-1045, 628-651 | Bulk-action bar (Acknowledge / Resolve / Dismiss) is unreachable: `selectedIds` is only ever set to `new Set()` (cleared) — no per-row checkbox/selection affordance exists in `renderCard`/`InsightCard` to ADD ids. `runBulk` early-returns on empty selection; the bar only shows when `selectedCount>0`. | The bulk Acknowledge/Resolve/Dismiss controls can never be triggered from the Alerts (or Insights) surface. Coaches must triage one card at a time. (Export survives via its all-visible fallback at line 653-654.) | Wire a selection control on each card (checkbox prop on `InsightCard`, or a row long-press/select-mode) that calls `setSelectedIds`; or remove the dead bulk-bar wiring until selection ships. |
| MEDIUM | type-mismatch | FairwayCoachHelmSignals.tsx:181-186, 720-734 + page.tsx:81 | Toolbar `SEVERITY_OPTIONS` only offers critical/high/medium/low, but the seeded applied-chip renders label 'Urgent' (capitalized raw value, line 725). The severity MENU shows 'Critical' as unselected while an 'Urgent' chip shows as applied — and the badge `signalCount` counts urgent+high while the feed (per the HIGH bug) shows only high. | Confusing/inconsistent severity UI; badge count won't match the visible feed; the 'Urgent' chip maps to no menu option. | Same fix as the HIGH finding (normalize urgent→critical end-to-end) resolves the chip label, the badge↔feed mismatch, and menu consistency. |
| LOW | revalidation | alerts.ts:643, 633-637 | `acknowledgeAllAlerts` only `revalidatePath('/golf/dashboard')` (not `/alerts`, `/insights`, `/intelligence`); and it sets `acknowledged_at` only (no `status='acknowledged'`), unlike `acknowledgeAlert` (line 309-312). Legacy/orphaned in prod (flag-on path never calls it), so impact is latent. | If the flag-off path is ever re-enabled, "acknowledge all" leaves rows `status='active'` and other coach surfaces stale until manual refresh. | Mirror the per-item action: also set `status='acknowledged'` and revalidate the same four paths. (Or delete the orphaned legacy actions.) |
| INFO | incomplete-feature | golfhelm-features.md #13 (lines 591-611) | Feature doc describes a `getCoachAlerts()/is_alert`/warning/info/suggestion model that the live code no longer uses (now `getInsightsForCoach` + critical/high/medium/low). The legacy `alerts.ts` readers, bulk actions, and `AlertCard.tsx` are orphaned. | Documentation drift; future maintainers may edit the dead path. | Update spec #13 to the insight-delivery wiring; remove or clearly deprecate the orphaned alerts.ts readers + `AlertCard`. |

### States / interactive controls / cross-links (verified OK)

- Loading: `SkeletonList rows={4}` (not a bare spinner) (line 1256-1257).
- Empty: distinct active/search/patterns empty states (lines 1258-1295). "All clear" copy for no-signal case.
- Error: honest `InlineNotice` with Try-again (lines 1128-1142); load failures never silently render empty.
- Scan-Team: determinate progress affordance, real ≥44px control, aria-live, calls preserved `generateAlerts` (ScanTeamControl.tsx).
- Per-row Focus area / Acknowledge / Dismiss all wired to real actions with optimistic rollback (lines 514-563, 822-899). Export works (all-visible fallback).
- Cross-links resolve: `/golf/dashboard/development` (focus-area push), `/golf/dashboard/insights` ("Open the insight workspace", line 1427) — both routes exist. Legacy AlertCard's `/golf/dashboard/players/${id}` resolves to `players/[playerId]` (verified) and `/golf/dashboard/messages?player=` resolves.
- Tables/columns: all reads/writes use `golf_coach_insights` (+ `golf_coaches`, `golf_team_members`, `golf_players`, drill joins) with real columns verified in golfhelm-database.md. No bare/unprefixed tables. No placeholder/hardcoded data — counts and rows trace to queries.
- Pagination: `getInsightsForCoach` uses `fetchAllRowsResult` (paginated, no 1000-row truncation) (insight-delivery.ts:488-531).
- Supabase clients correct (server `await createClient()` in actions/page; client `createClient` not needed — client component calls server actions).

### Coverage notes

The `urgent→critical` default-filter bug is code-certain (string identity mismatch) but its user-visible severity depends on whether live data has `priority='urgent'` rows; confirm on the running app by loading `/golf/dashboard/alerts` for a coach with at least one urgent insight and checking it does NOT appear until the severity filter is cleared. The bulk-bar dead-control and the badge↔feed count mismatch are also best confirmed live. RLS on `golf_coach_insights` (team-staff scoping for the no-player_id sweep) was trusted per the action comments, not directly inspected here.
