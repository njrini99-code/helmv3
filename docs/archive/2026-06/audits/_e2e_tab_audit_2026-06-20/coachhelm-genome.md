## CoachHelm Genome + Compare [player]

**Audited:** 2026-06-20
**Role focus:** player — who can view whose genome (role/ownership gate) + data correctness.
**Routes audited:**
- `/golf/dashboard/coachhelm/genome/[playerId]` (coach-only genome detail)
- `/golf/dashboard/coachhelm/genome/compare` (coach-only two-up compare)
- `/golf/dashboard/my-game-profile` (the player-facing genome surface — the only genome route a player can reach)

---

### End-to-end wiring (actual)

**Player surface — `/golf/dashboard/my-game-profile`** (`src/app/golf/(dashboard)/dashboard/my-game-profile/page.tsx`)
1. `getGolfSessionProfile()` → `if (!session) redirect('/golf/login')`; `if (!session.player) notFound()` (page is player-only; coaches hit notFound). (page.tsx:34-36)
2. `loadGenome(sb, session.player.id)` — **always the caller's own player id**, never a URL param. (page.tsx:39-40)
3. `loadGenome` (`src/lib/coachhelm/v3/genome/loader.ts:23-36`) reads `golf_player_genome` (`player_id, vector, computed_at, rounds_basis`) `.maybeSingle()` via the authenticated server client → RLS-gated.
4. `derivePersona(genome.vector)` (`src/lib/coachhelm/v3/genome/persona.ts:40-77`) — pure, no DB.
5. Flag-ON (prod): pure transforms over the already-loaded genome build serializable `axes`/`cells`/`strengths`/`watchouts` and pass to `FairwayMyGameProfile` (`src/components/fairway/pages/player-game/FairwayMyGameProfile.tsx`). `axes` filters to `score != null` (page.tsx:61-63) so locked dims are never plotted as 0; `GenomeRadar` renders its own insufficient-data state when `< 3` axes. Empty `axes` → honest "warming up" panel (FairwayMyGameProfile.tsx:228-257).
6. Flag-OFF (legacy): radar + `GenomePersonaPanel` + `GenomeDimensionGrid` (page.tsx:90-179).

**Coach surface — `/genome/[playerId]`** (`src/app/golf/(dashboard)/dashboard/coachhelm/genome/[playerId]/page.tsx`)
1. `getGolfSessionProfile()` → `if (!session) redirect('/golf/login')`; **`if (!session.coach) redirect('/golf/dashboard/coachhelm/genome/${playerId}/forbidden')`** (page.tsx:52-54) — players are denied here.
2. Reads `golf_players` (RLS `golf_players_select` — a coach only resolves a player they coach/teammate, else `notFound()`). (page.tsx:57-62)
3. `loadGenome(sb, playerId)` from the **URL param** — but RLS `genome_coach_read` only returns a row when the caller is on that player's team coaching staff. (page.tsx:64)
4. Flag-ON: `GenomeDetailView` (`src/components/fairway/pages/coachhelm/GenomeDetailView.tsx`) with a working "Compute now" (POST `/api/coachhelm/v3/genome/compute`), persona, dimension grid, focus areas with outcome capture (`recordFocusAreaOutcome`), `Compare` CTA. `getAlertCounts(session.coach.id)` for the shell badge (auth-gated).

**Compare surface — `/genome/compare`** (`src/app/golf/(dashboard)/dashboard/coachhelm/genome/compare/page.tsx`)
1. `getGolfSessionProfile()` → `if (!session) redirect('/golf/login')`; `if (!session.coach) redirect('/golf/dashboard')` (page.tsx:39-41) — players are denied (clean redirect, unlike the [playerId] page).
2. Roster from `golf_team_members` filtered only by `status='active'` (no explicit team scope) — safe because RLS `golf_team_members_select_v5` scopes to the caller's coached teams. (page.tsx:46-49)
3. `loadGenomes(sb, [p1,p2])` (`loader.ts:39-51`, `.in('player_id', ids)`) — RLS-gated per row.
4. Flag-ON: `GenomeCompareView` renders `GenomeFingerprint` diverging bars (not two radars), per-player live-dim readouts, honest "no genome computed" chips, and `<Link>`-based pickers that preserve the other slot's param.

**Genome compute** (`src/app/api/coachhelm/v3/genome/compute/route.ts`): auth-checks `getUser()`, validates `player_id` (zod uuid), authorizes "self OR coach of player's team" (route.ts:36-56), then runs `computeGenomeForPlayer`. Orchestrator (`src/lib/coachhelm/v3/genome/orchestrator.ts`) paginates holes/shots past the 1000-row cap (`fetchAllRowsResult`), isolates per-dim failures, writes honest null below `min_rounds` (default 8), and upserts with `onConflict: 'player_id'` (no destructive delete).

---

### Ownership / role gate (the focus) — VERIFIED SOLID

DB-level (`golf_player_genome`, confirmed live):
- RLS **enabled** (`relrowsecurity=true`).
- `genome_player_read` — `USING (player_id = current_player_id())`, role `authenticated`. A player can read **only their own** genome row.
- `genome_coach_read` — `USING (EXISTS … golf_team_members tm WHERE tm.player_id = … AND tm.status='active' AND is_team_coach(tm.team_id))`, role `authenticated`. `is_team_coach` is golf-specific (`golf_team_coach_staff` JOIN `golf_coaches`) — no cross-sport leak.
- No anon policy / no `USING (true)`. The `GRANT ALL … TO anon/authenticated` present in the baseline SQL is neutralized by RLS (no anon-matching policy ⇒ zero rows). Confirmed live: only the two `authenticated` policies exist.

App-level:
- Player surface (`my-game-profile`) reads `session.player.id` only — a player cannot pass another player's id.
- Both coach pages redirect non-coaches before any genome read.
- The only player-facing link to a genome surface is `player-dashboard-parts.tsx:259` → `/golf/dashboard/my-game-profile` (own profile). The coach `[playerId]` link is only emitted on a coach surface (`PlayersGridView.tsx:729`).

**A player cannot view another player's genome — gate holds at both the app and RLS layers.**

---

### Expected vs actual (golfhelm-features.md #20, #12)

- #20 Player CoachHelm (95%) and #12 CoachHelm Engine (75%) predate the v3 W33/W34 genome work and do not document the genome/game-profile surface or the `golf_player_genome` table at all — the feature doc is stale relative to shipped code, not the code being wrong. The shipped genome surfaces are honest about maturity ("N of 8 dimensions live", "warming up" floor of 8 rounds) and trace to real `golf_player_genome` rows (45 live rows, latest `computed_at` today — nightly cron is running).
- Honesty rules in the redesigned surfaces are correctly enforced: locked dims render qualitative/"Needs more rounds", never a fabricated 0; radar requires ≥3 live axes; empty → warming-up state.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | broken-link | `src/app/golf/(dashboard)/dashboard/coachhelm/genome/[playerId]/page.tsx:54` | Non-coach gate redirects to `/golf/dashboard/coachhelm/genome/${playerId}/forbidden`, a route segment that does not exist (no `forbidden/` dir under `[playerId]`, no golf `not-found.tsx`, no middleware rewrite). | A player who navigates/bookmarks a coach genome URL is correctly denied, but lands on a bare Next.js 404 instead of a clean forbidden/redirect-to-dashboard. Access is NOT bypassed (security holds); only the denial UX is broken. The sibling compare page does this correctly (`redirect('/golf/dashboard')`). | Redirect to an existing destination, e.g. `redirect('/golf/dashboard')` or `/golf/dashboard/hub`, matching the compare page. |
| LOW | wrong-data | `src/components/fairway/pages/dashboard/player-dashboard-parts.tsx:224-275` | The player dashboard "Your genome" teaser (`GenomeFingerprintTeaser`) plots strokes-gained across 4 scoring zones (`sg_off_tee/approach/around_green/putting`), but is titled "Your genome" and links to `/golf/dashboard/my-game-profile`, which renders the entirely different 8-dimension `golf_player_genome` model. | A player clicking "Full profile" sees a different shape/axes than the teaser implied — two different data models share the "genome" name, which can read as inconsistent. Not a correctness bug in either surface alone. | Re-label the teaser (e.g. "Strokes-gained shape") or back it with `golf_player_genome` so the teaser and full profile agree. |
| LOW | empty-state | `src/app/golf/(dashboard)/dashboard/my-game-profile/page.tsx:121` (legacy fork) | `loadGenome` returns a row whenever ANY `golf_player_genome` row exists, including `rounds_basis=0`/all-null vector (the orchestrator writes such rows). In the flag-OFF legacy fork, `derivePersona({})` is always truthy (`course_profile='Not enough rounds yet…'`), so `genome && persona` passes and the legacy `GenomeRadar` renders a degenerate all-collapsed polygon instead of the empty state. | Flag-OFF only: a brand-new player with a 0-round genome row sees a collapsed/empty radar rather than the "warming up" card. Prod is flag-ON (FairwayMyGameProfile), which handles this correctly via `axes.length>0`, so user impact is limited to the legacy path. | In the legacy fork, gate the radar on live-axis count (e.g. `normalizeForRadar` non-null count `>= 3` or `genome.rounds_basis >= 8`) before rendering the radar, mirroring the Fairway fork. |
| INFO | rls | `golf_player_genome` (live DB) | Defensive verification: RLS confirmed enabled with exactly `genome_player_read` (own) + `genome_coach_read` (coach-of-team), both `authenticated`-scoped; no anon exposure despite the baseline `GRANT ALL … TO anon`. | None — positive. The ownership gate is correct at the DB layer (defense-in-depth behind the page redirects). | None. |

---

### Coverage notes
- Could not click through the running app; the broken `forbidden` redirect (MEDIUM) is confirmed by static analysis (no matching route file, no golf `not-found.tsx`, no middleware) but the exact rendered 404 chrome should be confirmed live.
- Live DB confirms 45 genome rows and an active nightly cron (`computed_at` = today); did not exercise the "Compute now" POST end-to-end at runtime.
- Compute route + orchestrator reviewed for the player-self path (auth + pagination + non-destructive upsert) — all correct.
