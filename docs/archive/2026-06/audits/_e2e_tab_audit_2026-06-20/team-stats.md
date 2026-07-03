## Team Stats [coach]

**Route:** `/golf/dashboard/stats/team`
**Page:** `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx`
**Role:** coach-only
**Audit date:** 2026-06-20

---

### End-to-end wiring (actual)

1. **Auth + role-gate** — `page.tsx:51-55`. `getGolfSessionProfile()` (`src/lib/auth/session.ts:142-167`) resolves the session via `supabase.auth.getUser()` and a `golf_coaches`/`golf_players` lookup. No session → `redirect('/golf/login')`. No `coach` profile → `redirect('/golf/dashboard/stats')`. This is a real, page-level gate — it does not rely on nav hiding. A player hitting this URL is bounced to their own stats. ✅

2. **Team resolution** — `page.tsx:61` calls `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)` (`src/lib/golf/resolve-team-server.ts`), which reads the `golf_active_team` cookie, **validates it staff-strict** via `validateCoachTeamAccess` (`src/lib/golf/resolve-team.ts:125-161` — the men's/women's wall), then falls back to the coach's staffed team, then to deterministic org-ranked resolution. No team → "No Team Found" empty state (`page.tsx:72-83`). ✅

3. **Roster fetch** — `page.tsx:86-101`. `golf_team_members` (status='active') → `player_id[]` → `golf_players` (`id, first_name, last_name, avatar_url, graduation_year, handicap`). Columns all verified against `golfhelm-database.md` (`golf_players` has `graduation_year`, `handicap`; `golf_team_members` has `player_id`, `status`). No players → roster empty state (`page.tsx:103-126`). ✅

4. **Rounds + intelligence (parallel)** — `page.tsx:133-150`.
   - `golf_rounds` (`id, player_id, total_score, round_date, holes_played`) filtered `status='completed'`, `total_score not null`, ordered `round_date DESC, id ASC`, **paginated** through `fetchAllRowsResult` (`src/lib/supabase/fetch-all-rows.ts`) → lifts the PostgREST 1000-row cap. ✅
   - `getTeamStatsIntelligence(teamId)` (`src/app/golf/actions/stats-intelligence.ts:298-387`) — re-checks the coach session, reads `golf_player_stats_cache` for the roster, z-score-normalizes via `normalizePlayerMetrics`, and pulls the top insight per player. `teamId` is passed explicitly so it never re-resolves to a different team. ✅

5. **Holes fetch** — `page.tsx:159-168`. `golf_holes` (`round_id, par, fairway_hit, gir, putts, score`) `.in('round_id', roundIds)`, ordered `id ASC`, **paginated** via `fetchAllRows`. Columns verified against `golf_holes` schema. ✅

6. **Per-player aggregation** — `page.tsx:194-342`. In-memory grouping (no N+1 on the round/hole reads). Computes scoring avg (strictly 18-hole rounds, matching the cache canonical), 9/18 format splits, best/worst (18-normalized), scoring trend (last-5 vs prior-5 normalized), FW% (`par>=4 && fairway_hit !== null`), GIR% (`gir !== null`), putts/round (18-normalized), birdies/round.

7. **Render fork** — `page.tsx:351-432`. `isRedesignEnabled()` (`NEXT_PUBLIC_REDESIGN`, **true in prod** per memory `helmv3 prod RE-PROMOTED 2026-06-02`):
   - **Flag ON (LIVE):** two extra reads — `getTeamLeakMaps(teamId)` (`src/app/golf/actions/stats-leak-maps.ts:407`) + `Promise.all(playersWithStats.map(p => loadPlayerStandingMap(p.id)))` — then `<FairwayTeamStats>` (`src/components/fairway/pages/coachhelm/FairwayTeamStats.tsx`).
   - **Flag OFF (legacy):** `<TeamStatsTable>` (`team-stats-table.tsx`).
   Both branches consume the **same** `playersWithStats` array, so the core per-player math is shared.

8. **States** — `loading.tsx` (`StatsPageSkeleton`, not a bare spinner ✅), `error.tsx` (`RouteErrorBoundary` ✅), empty states for no-team / no-roster ✅, honest em-dashes for null metrics in both render branches ✅.

9. **Interactive controls** — Legacy: column sort buttons (all wired to `handleSort`), `FormatToggle` (wired to `setHoleFormat`; auto-hides when only one format exists, `shared-primitives.tsx:80`), per-row "View Details" → `/golf/dashboard/stats?player=${id}` (resolves; `stats/page.tsx:33` handles `?player=`), AI cell → `/golf/dashboard/players/${playerId}` (resolves to `players/[playerId]/page.tsx` ✅). Fairway: name + "View full stats" + insight footnote → `/golf/dashboard/stats?player=${id}` ✅; primary CTA → `/golf/dashboard/intelligence` (route exists ✅). No dead controls found.

---

### Expected-vs-actual (golfhelm-features.md #2 Stats & Analytics)

- **Expected:** team-wide analytics (coach only), scoring/short-game/long-game, trend analysis, lazy-refresh `golf_player_stats_cache`. **Actual:** matches. The team page computes its tabular per-player aggregates **directly from `golf_rounds` + `golf_holes`** (not the cache) for the table, while the AI/category column and SG/standing/leak surfaces read the already-populated cache/standing/shots — consistent with the doc's "cache + raw shots" split.
- **Known gaps still open (spec-acknowledged, not new findings):** SG columns in `golf_player_stats_cache` are null/unpopulated for most players; `golf_putting_tendencies` never written. The redesign branch honestly degrades (insufficient-data / awaiting-standing states) rather than fabricating, so these gaps surface as empty states, not wrong numbers.
- **Divergence:** the team table's scoring-average definition (strict 18-hole rounds, `page.tsx:241`) was deliberately aligned to the cache to stop a prior ~0.2-0.4-stroke disagreement; FW%/GIR% now use `!== null` opportunity rules matching the player page. These match the memory note "stats correctness audit 2026-06-06" remediation.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | pagination-cap | `page.tsx:159-167` | `golf_holes` query passes the **entire** `roundIds` array into a single `.in('round_id', roundIds)` on every paginated page. The *response* is paginated, but the *filter list* is not chunked. For a large multi-season roster (>~1000 completed rounds) the round-id list is serialized into the request URL (~40 chars/UUID), which can exceed PostgREST/proxy URL length limits and 414/silently drop. | A program with a deep historical roster could get a failed or truncated holes fetch → wrong/empty FW%/GIR%/Putts for the whole team. Edge-case (demo rosters are far under the limit) but real at scale. | Chunk `roundIds` into batches (e.g. 300) and merge results, or filter holes by `player_id` via a join/`golf_rounds` window instead of a raw id `.in()`. |
| LOW | correctness | `page.tsx:288-311` | Putts/round denominator is `Σ (holes_played ?? 18)` over scored rounds (`totalPlayerHoles`), but the numerator only sums holes where `putts !== null && putts > 0` (`totalPutts`). When a round has fewer putt-recorded holes than `holes_played` (partial entry), the denominator over-counts → understated putts/round. | A player who logged scores but skipped putts on some holes of an otherwise-18-hole round shows an artificially low putts/round. Affects only mixed-completeness rounds. | Normalize over the count of holes that actually carry a putt value (track `holesWithPutts` like `totalHolesWithScore`), or use `total_putts`/`total_fairways` round-level columns when present. |
| LOW | n+1 | `page.tsx:367-374` | Redesign (LIVE) branch fans out `loadPlayerStandingMap(p.id)` per player; each call issues 2 admin-client queries (`golf_player_standing` select + `loadPlayerCohort` → `golf_team_members`). For a 12-player roster that is ~24 queries per page load. Parallelized via `Promise.all` so latency is bounded, but it is an admin-client per-player fan-out. | Extra DB load on every team-stats render; cohort gender is identical for all teammates yet re-fetched N times. Minor at current roster sizes. | Batch standing rows in one `golf_player_standing .in('player_id', ids)` query and resolve the team cohort once for the whole roster. |
| INFO | wrong-data | `stats-intelligence.ts:348-375` | `insightCount` is derived from `getInsightsForPlayer(pid, { limit: 1 }).length`, so it is only ever 0 or 1 — never the true number of a player's insights. The legacy table consumes it only as a present/absent signal (priority dot), and the Fairway tile ignores it, so there is no visible defect today. | No user-visible bug now, but the field name is misleading for any future consumer that treats it as a real count. | Either fetch a count(*) for `insightCount` or rename it to `hasInsight`/drop it. |
| INFO | revalidation | `page.tsx:23` | This is a read-only page; `export const revalidate = 300` caches the RSC for 5 min while the sibling personal-stats page (`stats/page.tsx:15`) is `force-dynamic`. A coach who just had a round submitted for a player may see up-to-5-min-stale team aggregates. No mutation occurs here, so the "revalidate after mutation" rule does not apply; noting the staleness window only. | Brief staleness after new rounds land. Acceptable for an aggregate dashboard. | If freshness matters, drop to `force-dynamic` or lower the revalidate window. |

---

### Verdict

The Team Stats tab is **correctly wired end-to-end** on the load-bearing axes: coach-only role-gate enforced at the page (not via nav), staff-strict team resolution that holds the men's/women's wall, sport-prefixed tables with verified columns, **proper PostgREST pagination** on both the rounds and holes reads, no destructive writes (read-only page), real handlers on every control, and honest loading/empty/error/null states in both render branches. The previously-flagged per-player FW/GIR/Putts calc bugs (memory: "Team Stats per-player FW/GIR/Putts wrong (Putts badly)") appear **remediated** — FW/GIR now use `!== null` opportunity rules and scoring avg matches the cache.

Remaining items are one MEDIUM scale-risk (un-chunked `.in(roundIds)`), one LOW edge-case putts-normalization mismatch, one LOW N+1 standing fan-out, and two INFO observations. None are role leaks, auth bypasses, data loss, or wrong-data-shown-as-truth at current roster sizes.

**Needs live verification:** the `.in(roundIds)` URL-length ceiling (reproduce only with a synthetic >1000-round roster) and the putts-normalization mismatch (needs a round with partial putt entry) are best confirmed against running data.
