## Coaching Intelligence Settings [coach]

End-to-end audit of the coach-only Coaching Intelligence (a.k.a. "Coaching Philosophy") settings tab.

Route: `/golf/dashboard/settings/coaching-intelligence`
Feature doc: `memory/context/golfhelm-features.md` #18 (status ✅, no Known Gaps listed).

---

### Actual end-to-end wiring

**Entry / route shell**
- `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx:42-53` — default export forks on `useRedesign()`. Flag ON (live in prod per redesign promotion) → `FairwaySettingsCoachingIntelligence`; flag OFF → `LegacyCoachingIntelligenceSettingsPage`. Both forks are byte-for-byte the same plumbing — only chrome differs (`src/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence.tsx:72-443`).
- `layout.tsx:1-14` — metadata-only passthrough. No gating here.
- Outer dashboard layout `src/app/golf/(dashboard)/layout.tsx:27-203` resolves role + builds `userData` (coach gets `coachId`, player gets `playerId`). It redirects only to onboarding/login; it does NOT redirect a player away from coach-only sub-routes.
- `src/app/golf/(dashboard)/dashboard/layout.tsx:16-30` reads the session only to gate the `ChatDrawer` (`isCoach`). No route-level role redirect.
- Entry link is correctly coach-gated in `FairwaySettingsGeneral.tsx:352-356` (`profile.role === 'coach'`) and the nav shell only shows it for coaches. The page itself has no self-gate.

**Coach philosophy read/write (golf_coach_philosophy)**
- `page.tsx:69-93` / Fairway `:86-110` — client `useEffect` calls `supabase.auth.getUser()`, then `golf_coaches.select('id, organization_id').eq('user_id', user.id).maybeSingle()` → sets `coachId`.
- `useCoachPhilosophy(coachId)` (`src/hooks/coachhelm/useCoachPhilosophy.ts:127-223`):
  - Fetch: `golf_coach_philosophy.select('*').eq('coach_id', coachId).maybeSingle()` (`:149-153`).
  - If no row: client-side INSERT default priorities (`:165-177`).
  - Save: `fromUntyped(...).update(tsToDb(updates)).eq('id', philosophy.id).select().single()` (`:200-205`), then optionally `revalidateCoachingPhilosophyPaths()` (`:213-215`).
  - Uses the **client** Supabase client throughout (correct for a client component). RLS on `golf_coach_philosophy` is coach-owned (select/insert/update/delete all check `gc.user_id = auth.uid()`, baseline migration `20260527000000_prod_public_baseline.sql:18895-18918`) + admin read. The `GRANT ALL TO anon` line (`:21562`) is the standard baseline grant; RLS is enabled with no anon policy, so anon cannot read/write. No leak.
- Server action `src/app/golf/actions/coaching-philosophy.ts` (`saveCoachingPhilosophy`) exists with full auth + ownership check + column allowlist + `upsert(onConflict: 'coach_id')` + revalidate — but the page does NOT use it. The page writes via the hook (direct client update). `revalidateCoachingPhilosophyPaths()` (`:67-73`) IS imported and called by the hook after each save, so downstream coach screens (insights/alerts/patterns/intelligence) are revalidated.

**Widget handlers** (`page.tsx:163-187`, Fairway `:170-195`)
- Priorities (drag), Sensitivity (segmented), alert toggles, display toggles, verbosity → `flushSave` (immediate).
- Thresholds + weights → `debouncedSave` (600ms). Timers cleaned up on unmount (`page.tsx:131-137`).
- All five editor widgets (`PriorityRanker`, `SensitivitySlider`, `ThresholdSlider`, `WeightDistributor`, `AlertTypeToggles`) and `SgBaselineSelector` are reused verbatim across both forks and are correctly wired to real handlers. No dead/`href="#"` controls.
- Column round-trip verified against `memory/context/golfhelm-database.md:263-300` — every camelCase↔snake_case mapping in the hook matches a real column. `insight_verbosity` DB check constraint is `('brief','detailed')`; the hook maps any non-`detailed` value to `'brief'` (`:81`), so writes are constraint-safe.

**Team CoachHelm master switch (golf_team_coachhelm_settings)**
- `page.tsx:83-89` seeds via `getOrCreateTeamCoachHelmSettings(activeTeamId)`; toggle calls `updateTeamCoachHelmSettings` (`insights.ts:3705-3770`) with optimistic flip + revert-on-failure.
- Server action does full auth (`ensureCoachInTeamOrg`, `insights.ts:3609-3646`), head-coach gate via `is_golf_team_primary_coach` RPC, records `disabled_at/by/reason`, revalidates. This control TAKES EFFECT: the engine gate reads `golf_team_coachhelm_settings.enabled` (`src/lib/coachhelm/v2/gate.ts:74-84,190,292`) and `effectivelyEnabled` gates all CoachHelm processing. Correctly wired end-to-end.

**SG baseline (golf_team_settings.sg_baseline)**
- `SgBaselineSelector` → `getTeamSgBaseline` / `setTeamSgBaseline` (`team-sg-baseline.ts`). Set path upserts then runs `recompute_team_sg` (service-role RPC) and revalidates stats/coachhelm. Correctly wired, with loading + saving + saved + error states. Takes effect (stored SG recomputed).

---

### Expected vs Actual

Feature doc #18 says: priorities, alert sensitivity, thresholds (decline/pressure/bubble), weight distribution (5 summing to 100%), 11 alert toggles → "Save → UPDATE golf_coach_philosophy", and "Feeds into CoachHelm AI Engine (filters insights), Alerts System (sensitivity + toggles)."

- Priorities — persisted AND consumed (`insights.ts:450-517` rank/score insights). MATCHES.
- Alert sensitivity — persisted AND consumed (`insights.ts:332,489-491,792,3244` confidence-threshold + score multiplier). MATCHES.
- Decline / pressure-gap thresholds — persisted AND consumed by the engine (`orchestrator.ts:631-639` + `insights.ts`). MATCHES.
- Bubble zone threshold — persisted but NOT consumed anywhere (only loaded/defaulted). DIVERGES (doc implies it triggers bubble alerts).
- Weight distribution — persisted but NO consumer anywhere in `src/` (loaded into the type at `insights.ts:283-287`, never read). DIVERGES from doc's "comparison weighting … roster decisions."
- 11 alert toggles — persisted and loaded into the philosophy object (`insights.ts:288-297`) but NEVER read to gate which alert types get emitted. The doc explicitly says Alerts System uses the toggles. DIVERGES — they are write-only.
- Display preferences (`showStrokesGained`, `showAdvancedStats`, `insightVerbosity`) — not in the doc, present in UI, but not consumed by any render component or by the engine (orchestrator hardcodes `verbosity: 'brief'`/`'balanced'` at `orchestrator.ts:704,738,902`). Write-only.

Net: the tab persists everything correctly and the most important levers (priorities, sensitivity, the two engine thresholds, the team master switch, SG baseline) genuinely take effect. A meaningful subset of controls (alert toggles, weights, bubble zone, display prefs) are write-only — they save but change nothing the coach can observe.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| MEDIUM | role-leak / no-error-state | `coaching-intelligence/page.tsx:42-93`, Fairway `:86-110` | Coach-only page has no self-gate. A player (or any user without a `golf_coaches` row) who deep-links/bookmarks the route is not redirected; `coachId` resolves to null, `useCoachPhilosophy` returns `loading=false`+`philosophy=null`, and the page is stuck on the loading skeleton forever. No data leak (RLS protects the table) but the route is reachable and never renders content/empty/error. Inconsistent with the sibling `notifications/page.tsx:23-45` which role-gates gracefully. | Player hitting the URL sees an infinite shimmer skeleton with no way forward. | Add a server-side gate (convert to a thin server wrapper or check `getGolfSessionProfile().coach` and `redirect('/golf/dashboard/settings')` for non-coaches), or render a "coach-only" notice like the notifications page does. |
| MEDIUM | dead-control | `AlertTypeToggles.tsx` + `insights.ts:288-297` | The 11 "Active Alerts" toggles persist to `golf_coach_philosophy.alert_*` but are never read to suppress alert emission. The engine loads them into the philosophy object then ignores them; no code path checks `philosophy.alertScoringDecline` etc. before generating that alert type. | Coach disables e.g. "Plateau" or "Par 3 issues" alerts; they keep appearing. The control silently does nothing. | Gate each alert-type generation on its toggle in the insight/alert generation path (insights.ts + orchestrator alert composition), or remove the toggles until wired. |
| MEDIUM | dead-control | `WeightDistributor.tsx` + `insights.ts:283-287` | The 5 "Comparison Weighting" sliders persist `weight_*` but have zero consumers in `src/` (no `philosophy.weightHistorical` read anywhere). Roster-comparison weighting described in the doc is not implemented. | Coach tunes weights for roster decisions; nothing changes anywhere. | Wire the weights into the comparison/ranking logic, or hide the section until consumed. |
| MEDIUM | dead-control | `page.tsx:429-463` / Fairway `:388-439`, hook map `:78-81` | Display Preferences (`Show Strokes Gained`, `Show advanced statistics`, `Insight Detail Level`) persist but are not consumed by any render component, and `insight_verbosity` is ignored by the NLG layer (orchestrator hardcodes `verbosity` at `orchestrator.ts:704,738,902`). | Toggling these has no observable effect on dashboards/reports/insight length. | Read `showStrokesGained`/`showAdvancedStats` in the stat/dashboard render gates and pass `insightVerbosity` into the NLG `verbosity` instead of the hardcoded value. |
| LOW | dead-control | `ThresholdSlider` "Bubble Zone" (`page.tsx:322-329`) + `insights.ts:282` | `bubble_zone_range` persists and loads but is never used to compute/trigger bubble alerts. | Coach adjusts the bubble threshold; no alert behavior changes. | Consume `bubbleZoneRange` in the bubble-player alert logic, or note it as informational. |
| LOW | broken-wiring | `coaching-philosophy.ts` (whole file) | A complete, hardened server action `saveCoachingPhilosophy` (auth + ownership + column allowlist + `upsert onConflict` + revalidate) exists but is unused; the page persists via direct client-side `update` in the hook instead. Functionally fine (RLS enforces ownership and the hook revalidates), but it is duplicate dead code that can drift from the live write path. | None user-facing; maintenance hazard (two write paths, only one used). | Either route the page's saves through the server action or delete it; keep one source of truth. |
| INFO | data wiring | `useCoachPhilosophy.ts:200-218` | Saves are PATCH-style single-column `update`s by row `id`; no destructive delete-then-insert; correct client; debounce timers cleaned up on unmount. Optimistic UI for the team toggle reconciles with the server (revert on failure). No pagination concern (single-row reads). | Confirms the persistence path is sound. | — |

---

### Coverage notes
- Could not exercise the running app; the "infinite skeleton for a player" path and the "toggles do nothing" claims are traced statically. Both are confirmable by clicking through: (1) log in as a player and open the URL directly; (2) as a coach, disable an alert type and run insight generation, then check whether that alert type still appears.
- Did not enumerate every alert-generation branch line-by-line; the dead-toggle finding is based on a repo-wide grep finding zero read sites for `philosophy.alert*` toggle fields outside the load/map code. Worth a live confirm before removing toggles.
