## Stats (personal) [both]

End-to-end audit of the personal Stats tab (`/golf/dashboard/stats`) for BOTH the player-self view and the coach-viewing-a-teammate view. Audited 2026-06-20.

---

### Active path (production)

`NEXT_PUBLIC_REDESIGN=true` in `.env.local`, and prod serves `main` with the redesign on (per project memory). So the **active** surface is the Fairway redesign, not the legacy `StatsClient`.

```
/golf/dashboard/stats/page.tsx (server, force-dynamic)
  └─ searchParams.player → playerId
  └─ isRedesignEnabled() === true  →  Fairway fork:
        if (!playerId) and session.coach && !session.player  → redirect('/golf/dashboard/stats/team')
        else render <FairwayPlayerStats initialPlayerId={playerId} />
  └─ isRedesignEnabled() === false →  legacy <StatsClient initialPlayerId={playerId} />  (DORMANT in prod)

FairwayPlayerStats (src/components/fairway/pages/coachhelm/FairwayPlayerStats.tsx)
  └─ resolvedPlayerId = initialPlayerId (coach ?player=) ?? golfUser.playerId
  └─ isCoachView = golfUser.role === 'coach'
  └─ wraps body in CoachHelmShell (sub-nav) with a "← Team stats" back link for coaches
  └─ no resolvedPlayerId → EmptyState "No player selected" (Back to team stats)
  └─ else → <FairwayStatsCockpit playerId={resolvedPlayerId} />

FairwayStatsCockpit (src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx)
  └─ loadAll(playerId) — Promise.allSettled of 6 server actions:
        getDetailedStats(id,'overall')         → stats-data.ts  (auth + verifyPlayerAccess)
        getTrendAnalysis(id)                    → stats-data.ts  (auth + verifyPlayerAccess)
        getPlayerStandingRows(id)               → stats-leak-maps.ts (auth + verifyPlayerAccess → loadPlayerStandingMap admin)
        getPlayerLeakMaps(id)                   → stats-leak-maps.ts (auth + verifyPlayerAccess)
        getPlayerPatterns(id)                   → insights.ts (auth + verifyPlayerAccess + isCoachHelmEnabledForPlayer)
        getSprayChartData(id,'overall')         → stats-data.ts  (auth + verifyPlayerAccess)
  └─ Renders: SgVerdict (SG total vs PGA + scoring avg + synthesized read) → Vitals 4-up
       (Rounds/Fairways/GIR/Putts) → Tabs[Scoring, Driving, Approach, Putting, Scrambling,
       Strokes Gained, Analysis] → Recent rounds (links to /rounds/[id]).
```

Tables touched (all sport-prefixed, all columns verified against `memory/context/golfhelm-database.md`):
`golf_rounds`, `golf_holes`, `golf_shots` (+ `putt_details`, `approach_miss_details` embeds), `golf_pga_standards`, `golf_team_members`, `golf_teams`, `golf_players`, `golf_coaches`, `golf_patterns_v2`.

---

### Role-gate & auth (audit rubric 1, 2) — PASS

- **Layout auth:** `src/app/golf/(dashboard)/layout.tsx:34-35` redirects unauthenticated users to `/golf/login`; admins to `/golf/admin`. `GolfUserProvider` is populated with the server-resolved role/playerId/teamId.
- **Page-level coach gate (redesign):** `page.tsx:48-53` — a coach with no `?player=` is redirected to `/golf/dashboard/stats/team` (their natural landing), so coaches never dead-end on the "No player selected" empty state. The gate is correctly scoped INSIDE the redesign fork.
- **Per-action defense in depth:** every server action the cockpit calls independently runs `requireAuth()` (`supabase.auth.getUser()`) and `verifyPlayerAccess(supabase, user.id, playerId)` (`stats-data.ts:48-102`). A coach can only read a player on their own org's team; a player can only read themselves. A coach hitting `?player=<other-team-player>` gets empty/Unauthorized data, not a leak.
- `getPlayerStandingRows` uses the service-role admin client via `loadPlayerStandingMap` but is correctly wrapped behind `verifyPlayerAccess` before that call (`stats-leak-maps.ts:556-560`). No anon/over-broad exposure in the read path.

### Data wiring & pagination (rubric 3) — PASS

- All shot/hole reads paginate past the PostgREST 1000-row cap via `fetchAllRowsResult((from,to)=>…range(from,to))` (`stats-data.ts:893-933`, `1176-1212`; `stats-leak-maps.ts:287-297, 345-361`). `MAX_SHOT_ROWS` is enforced by stopping page accumulation, NOT a single `.limit()` (the file comments call out the exact footgun).
- Detailed-stats round window is hard-capped at `DETAILED_STATS_MAX_ROUNDS = 100` (perf), with an honest truncation flag surfaced as an `InlineNotice` (`FairwayStatsCockpit.tsx:513-518`) when the unfiltered count exceeds the cap.
- SG uses the per-team Broadie baseline scale via the same DB function the cache uses (`sg_scale_for_player`, `stats-data.ts:1015-1018`) — Stats-page SG matches the DB cache. No hardcoded SG.
- Leak maps normalize mixed feet/yards correctly (`toFeet`, `stats-leak-maps.ts:150-153`) and restrict approach proximity to on-green finishes only (`result in ['green','hole','gir']`, `:356`) to avoid the historic ×3 unit-blend inflation. Approach-proximity ceiling drops blow-up outliers.
- No fake/placeholder/hardcoded numbers — every value traces to a query; nulls render as em-dash via `fmt*` helpers, never fabricated zeros.

### Interactive controls (rubric 5) — PASS

- Tabs, the by-lie/by-distance/by-break/scramble-cut `ToggleChip`s, and the two disclosure toggles (`Detailed standings`, `Full shot detail`) are all wired to real `useState` handlers.
- "Open CoachHelm" → `/golf/dashboard/players/${playerId}` (route exists). Recent-round links → `/golf/dashboard/rounds/${round.id}` (route exists). Coach "← Team stats" → `/golf/dashboard/stats` (and the page re-redirects the coach to `/stats/team`). No dead controls, no `href="#"`.

### States (rubric 6) — PASS

`StatsLoading` skeleton (not a bare spinner), `InlineNotice` error state, `EmptyState` cold-start ("More rounds needed") and "No player selected" empty state are all present and honest. `Promise.allSettled` means a single failing enrichment (patterns/spray) degrades gracefully instead of crashing the page; only an all-core-rejected case sets `loadError`.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| LOW | correctness | `src/app/golf/actions/stats-data.ts:1426,1432` + `src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx:2280,2296` | In `getTrendAnalysis`, `RoundTrendData.score` is normalized to an 18-hole equivalent (`total_score * 18/holes_played`) but `RoundTrendData.toPar` is the **raw** `score_to_par` (not normalized). `RecentRounds` renders the normalized score in the badge and the raw to-par in the chip (and uses raw to-par to pick the badge color). For a 9-hole round the two don't reconcile (e.g. badge "76" next to chip "+2"). Affects BOTH the player view and the coach roster drill-down (shared cockpit body). | A 9-hole round in Recent rounds shows an internally inconsistent score/to-par pair; the score-vs-par color cue can be wrong. 18-hole rounds are unaffected. | Either normalize `toPar` to 18 holes in the mapper (`toPar: Math.round((r.score_to_par ?? 0) * (18/hp))`) to match `score`, or display the raw score + raw to-par together (as the legacy `stats-client.tsx:1281-1313` does). Keep the badge and chip on the same basis. |
| INFO | revalidation | `src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx:332-387` | The cockpit re-fetches on `playerId` change only; unlike the legacy `StatsClient.handleRefresh` there is no in-page Refresh control to re-pull after a just-submitted round, and the page is `force-dynamic` so a soft nav re-runs `loadAll`. Stats are fresh on navigation but stale if the tab stays mounted while a round completes elsewhere. | Player who logs a round in another tab won't see updated stats without a navigation/reload. Low real-world impact (stats page is normally entered fresh). | Optional: add a manual refresh affordance (as the legacy surface had) or a focus/visibility re-fetch. |
| INFO | incomplete-feature | `memory/context/golfhelm-features.md` #2 "Known Gaps" vs `src/app/golf/actions/stats-leak-maps.ts` | Feature doc lists "Strokes Gained not populated (cache SG columns null)" and "golf_putting_tendencies never written" as open gaps. The active Fairway cockpit does NOT depend on those: SG comes from live shot calc with `sg_scale_for_player`, and leak maps are computed from raw `golf_shots` (the file comment explicitly says the per-bucket cache columns are populated for only 0-1 of 6 demo players, so it never reads the cache). The "Known Gaps" section is stale relative to the shipped redesign. | None functionally — actually better than the doc claims. Doc drift only. | Update feature doc #2 to reflect that the redesigned Stats surface derives SG + leak maps from raw shots, not the (still-empty) cache columns. |

### Notes on the legacy path (dormant, redesign-off)

`StatsClient` (`stats-client.tsx`) is only reachable when `NEXT_PUBLIC_REDESIGN` is off, which is not the prod config. Its Recent Rounds is internally consistent (raw score + raw to-par). It is auth-gated transitively through the same `stats-data` actions. Not in the live blast radius; not scored as a live finding.

---

### Coverage / open questions

- Could not exercise the running app — the 9-hole score/to-par mismatch in Recent rounds is confirmed by code inspection (normalized `score` vs raw `toPar`) but should be eyeballed on a player with a real 9-hole round to confirm visual severity.
- `loadPlayerStandingMap` (admin client) was confirmed to be wrapped behind `verifyPlayerAccess`; its internal RLS/grant posture (it bypasses RLS by design) was not separately audited here — out of scope for this tab, but worth confirming the admin client is never reachable from a client component directly.
