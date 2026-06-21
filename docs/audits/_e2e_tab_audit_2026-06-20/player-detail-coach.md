## Player detail / game view (coach) [coach]

**Audited:** 2026-06-20
**Role context:** coach
**Routes:**
- `/golf/dashboard/players/[playerId]` (legacy "Player Insight" scattered-card view)
- `/golf/dashboard/players/[playerId]/game` (7-section "Game Fingerprint" scouting report)
- `/golf/dashboard/players/[playerId]/game/print` (B&W print/PDF variant, auto `window.print()`)

---

### End-to-end wiring (actual)

**Role-gate + auth (all three routes):**
- `players/[playerId]/page.tsx:119-123` — `getGolfSessionProfile()`; `redirect('/golf/login')` if no session; `redirect('/golf/dashboard')` if `!coach`. Coach-only.
- `players/[playerId]/page.tsx:131-143` — resolves the coach's ACTIVE team via `resolveCoachTeamIdWithCookie()` (cookie-validated against `golf_team_coach_staff`, falls back to staffed/org team), then verifies the player is on THAT team via `golf_team_members` (`notFound()` otherwise). Scoped to the *active* team only.
- `game/page.tsx:41-46` and `game/print/page.tsx:33-37` — same session + `!coach` redirects, then call `getPlayerFingerprint(playerId)` → `notFound()` on null.

**`getPlayerFingerprint` (`player-fingerprint.ts:210-333`):**
- `'use server'`; `supabase.auth.getUser()` first (`:218-222`), returns `null` on no user.
- `verifyPlayerAccess(playerId, user.id)` (`:224`) — self OR coach-staffs-ANY-team-the-player-is-on, via the `verify_coach_owns_player` RPC. Returns `null` on deny.
- Parallel fetch (`:236-276`): `golf_players`, `golf_team_members`+`golf_teams(name)`, `golf_player_stats_cache` (~40 columns, all verified present in golfhelm-database.md), `golf_rounds` (last 10, `total_score IS NOT NULL`), and `getInsightsForCoach(user.id, { player_id, limit: 40 })`.
- Builds 6 sections (tee/approach/short_game/putting/scoring/pressure) + composite + rolling trend; all metrics quoted from the stats cache or computed from real rounds.

**Insight delivery (`insight-delivery.ts:444-581`, `getInsightsForCoach`):**
- Auth-checked; per-player branch re-runs `verifyPlayerAccess`. Uses `fetchAllRowsResult` (paginated, `.order('id').range()`) — NO 1000-row truncation. `applyInsightVisibility` applies the v3-engine + visible-lifecycle + not-dismissed guard. Ranked by the shared `scoreInsight` composite, par-scoring collapsed, deduped by subject, sliced to limit. Pre-joins drill chips. Sport-prefixed tables throughout.

**Render fork:** Both `game` and `page.tsx` branch on `isRedesignEnabled()` (`flag.ts`, env `NEXT_PUBLIC_REDESIGN`, ON in prod). Flag-on renders `FairwayPlayerGameFingerprint` / `FairwayPlayerInsight`; flag-off renders `PlayerGameFingerprint` / `PlayerInsightClient`. Both consume the SAME server-resolved data and the SAME write actions.

**Interactive controls (Fairway, prod path — `FairwayPlayerGameFingerprint.tsx`):**
- "Print report" → `Link` to `/game/print` (`:197`) — real route, exists.
- "Player page" → `Link` to `/golf/dashboard/roster/${id}` (`:204`) — real route, exists.
- InsightCard actions (`:386-406`): "Make focus area" → `createFocusAreaFromInsight` (auth + `verifyPlayerAccess` gated, `development.ts:642-669`, revalidates 3 paths); "Acknowledge" → `acknowledgeInsight` (`insights.ts:1134`, `verifyInsightAccess` + team-scoped UPDATE + revalidate); "Dismiss" → `dismissInsight` (`insights.ts:1197`, same pattern). Optimistic state with revert-on-failure (`:127-160`).
- Legacy `FingerprintHero.tsx` extra controls: Print (`router.push`), "Discuss in messages" → `/messages?player=${id}` (messages page reads `?player=`, `messages/page.tsx:43`), "Assign focus area" → `/development?player=${id}`.

**Print route (`game/print/page.tsx`):** Renders all 6 sections + a textual trend table, auto-launches `window.print()` via a static `next/script` body (no user data in the script, guard flag prevents double-launch). Honest sparse/empty states preserved.

**States:** `game/loading.tsx` → `DetailPageSkeleton` (not a bare spinner); `game/error.tsx` + `print/error.tsx` → `RouteErrorBoundary`; sparse sections → honest "Not enough data yet · needs 5+ rounds"; empty insight slots → "No insights in this area". Composite renders an honest `awaiting` "N of 5" state when no rating, never a fake 0.

---

### Expected vs actual (golfhelm-features.md #2 Stats, #5 Roster)

The feature doc describes the coach-viewing-a-player surface as `/roster/[id]` with Suspense-loaded stats sections. The audited `/players/[playerId]` + `/game` routes are a NEWER parallel surface (Wave 2 "Game Fingerprint") not yet reflected in the feature doc. The data sources match the spec exactly: `golf_player_stats_cache` (50+ columns) for per-category metrics, `golf_rounds` for trend/scoring fallback, `golf_coach_insights` (evidence-backed) for the insight rails. The doc's "Strokes Gained not populated / null" known gap is handled honestly — SG metric pills only render when `sg_*_per_round` is non-null. No fabricated data anywhere; sparse and awaiting states are honest. Verdict: **actual matches the spec's data model; the feature doc is stale on routing (does not document `/players/[id]/game`).**

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| MEDIUM | role-leak | `game/page.tsx:45` vs `players/[playerId]/page.tsx:131-143` | The base `/players/[id]` page scopes to the coach's *active* team (cookie-resolved) and `notFound()`s if the player isn't on it; `/game` + `/print` use `verifyPlayerAccess` (ANY staffed team). A multi-team head coach toggled to team A can open `/game` for a team-B player but gets `notFound()` on the base page. | Inconsistent scoping across two views of the same player; not a security leak (coach genuinely staffs the team) but a confusing divergence and a bypass of the active-team toggle on the game/print routes. | Make all three routes use the same access model. Either gate `/game`+`/print` to the active team (cookie-resolved) like the base page, or relax the base page to `verifyPlayerAccess`. Pick one. |
| LOW | broken-link | `FingerprintHero.tsx:167-178` | Legacy "Assign focus area" links to `/golf/dashboard/development?player=${id}`, but the development page + client never read a `player` query param (`development/page.tsx`, `development-client.tsx` — no `searchParams`/`useSearchParams`). | Coach lands on the team-wide development page with no player pre-selected — silent no-op of the deep-link intent. Legacy (flag-off) path only; the Fairway prod hero has no such link. | Read `?player=` in the development page and pre-select/scroll to that player, or drop the query param from the link. |
| LOW | correctness | `player-fingerprint.ts:885-891` (`toPct`) | The fraction-vs-percent heuristic treats any value `<= 1.5` as a 0–1 fraction and multiplies by 100. The canonical calculator writes these as 0–100 (`golf-stats-calculator.ts:715-718`), so a legitimate low percentage (e.g. a 1% sand-save / one-putt rate) would be inflated to 100%. | Rare but real 100× mis-scale for genuinely tiny percentages; pills like "Sand saves 100%" could appear for a player who almost never saves. | Source the unit from the column contract (cache is 0–100) rather than value-magnitude guessing, or lower the threshold and document which columns are fractional. |
| INFO | rls | `supabase/migrations/20260527000000_prod_public_baseline.sql:20952` | `verify_coach_owns_player` is `SECURITY DEFINER`, accepts a caller-supplied `p_user_id`, and is `GRANT ALL ... TO anon`. The audited code always passes the authenticated `user.id`, so this path is safe, but the anon grant lets any anon-key holder probe whether an arbitrary `(user_id, player_id)` pair is a coaching relationship — a boolean RLS-bypass oracle. | Information-disclosure oracle independent of this tab (pre-existing schema grant; matches the deferred SECURITY DEFINER grant-audit note). No data exfiltration, boolean only. | `REVOKE EXECUTE ... FROM anon` on `verify_coach_owns_player` (and audit sibling SECURITY DEFINER RPCs). |

---

### Coverage notes

- Could not run the app live; all findings are code-traced. The MEDIUM scoping divergence and LOW dead-link are best confirmed by clicking through as a multi-team head coach and by clicking "Assign focus area" in the flag-off hero.
- Did not exhaustively read every `sections/*.tsx` legacy section component (TeeSection, etc.) — they are thin wrappers over `SectionBand`/`MetricPill` shown here; the prod (flag-on) path renders the single self-contained `FairwayPlayerGameFingerprint` which was read in full.
- Pagination, auth-first-then-read, revalidation, sport-prefixed tables, correct server vs client Supabase clients, and non-destructive writes (all insight mutations are scoped UPDATEs, no delete-then-insert) are all CORRECT on this tab.
