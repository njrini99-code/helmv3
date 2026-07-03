## My Game Profile + My Standing [player]

End-to-end audit of the two player-self surfaces:

- `/golf/dashboard/my-game-profile` — the player's genome (8-dim radar + persona)
- `/golf/dashboard/my-standing` — the player's standing matrix (you vs team vs PGA/LPGA, per metric)

Audited 2026-06-20. Role: player. Focus: self-scoped data, numbers trace to real rows.

---

### End-to-end wiring (actual)

#### My Game Profile

- `src/app/golf/(dashboard)/dashboard/my-game-profile/page.tsx:33` — server component.
  - Auth + role gate: `getGolfSessionProfile()` (`my-game-profile/page.tsx:34`) → `redirect('/golf/login')` if no session (`:35`); `notFound()` if `!session.player` (`:36`). A coach hits `notFound()` — correct player-only gate.
  - Data: `loadGenome(sb, session.player.id)` (`:38-40`) where `sb = await createClient()` (RLS-respecting server client). `loadGenome` reads `golf_player_genome` by `player_id`, `.maybeSingle()`, tolerant of "no row" (`src/lib/coachhelm/v3/genome/loader.ts:23-36`).
  - Persona: `derivePersona(genome.vector)` (`:41`) — pure transform, no DB (`src/lib/coachhelm/v3/genome/persona.ts:40`).
  - Redesign fork (`:44 isRedesignEnabled()`): builds serializable `cells`/`axes`/`strengths`/`watchouts` via `normalizeForRadar` over `GENOME_DIMENSIONS` (`:49-73`), passes to `FairwayMyGameProfile` (`src/components/fairway/pages/player-game/FairwayMyGameProfile.tsx`). Locked dims (null normalize) preserved honestly — no fabricated score (`:54-58`).
  - Legacy fork (`:90`): `GenomeRadar` (legacy, `series` prop) + `GenomePersonaPanel` + `GenomeDimensionGrid`; "warming up" empty state needs 8+ rounds.
- Genome source data is REAL: written nightly by `/api/cron/v3/genome-nightly` (registered `vercel.json:70`) → `orchestrator.ts` which **upserts** `golf_player_genome` with `onConflict: 'player_id'` (`src/lib/coachhelm/v3/genome/orchestrator.ts:134-145`) — non-destructive, no delete-then-insert.
- `GENOME_DIMENSIONS` = 8 dims (`src/lib/coachhelm/v3/genome/registry.ts:23-33`), one per category. `weatherSensitivityStub` is a deferred stub → normalizes to null → renders an honest "Locked" cell. By design.

#### My Standing

- `src/app/golf/(dashboard)/dashboard/my-standing/page.tsx:79` — server component, `export const revalidate = 300`.
  - Auth + role gate: `getGolfSessionProfile()` (`:80`) → `redirect('/golf/login')` if no session (`:81`); `redirect('/golf/dashboard')` if `!player` (coach bounce, `:83-86`). Player-only gate enforced.
  - Data: `Promise.all([loadPlayerStandingMap(player.id), loadPlayerScoringBaseline(player.id)])` (`:88-91`).
    - `loadPlayerStandingMap` reads `golf_player_standing` filtered by `player_id`, resolves cohort once (`loadPlayerCohort`), applies `applyGenderAnchor` to every row (`src/lib/coachhelm/v3/standing/loader.ts:93-113`).
    - `loadPlayerScoringBaseline` reads `golf_player_stats_cache.scoring_average` gated at `rounds_played >= 5` (`src/lib/coachhelm/v3/counterfactual/baseline-loader.ts:18-30`).
  - Rows are bucketed by category via `metricCategory()` (`:65-77`) over the canonical `METRIC_IDS` (`:95-102`); `CATEGORY_ORDER` (`:51-63`) drives section order. `metric-config.ts` (`METRIC_RENDER_CONFIG`) supplies `direction`/`unit`/`display_label`/`default_scale`.
  - Redesign fork (`:110`): renders inside `CoachHelmShell` (role="player", active="standing") which mounts the player sub-nav (Overview/Development/Standing — all real player routes, `CoachHelmSubNav.tsx:118-139`). Each metric → `<StandingStrip>` (`:143-160`). Empty state → Fairway `EmptyState`.
  - Legacy fork (`:173`): `<StandingBar>` + `<CounterfactualLine>` per metric (`:217-243`).
- Standing source data is REAL: written by `/api/cron/v3/standing-refresh` (registered `vercel.json:66`) into `golf_player_standing`.

#### Auth / data-scoping model

- Both pages resolve the player via `getGolfSessionProfile()` (`src/lib/auth/session.ts:142`), which keys off `supabase.auth.getUser()` then `golf_players` by `user_id`. The pages ONLY ever pass `session.player.id` (self) — no route params, no foreign id.
- `golf_player_genome` is read through the RLS-respecting **server** client; RLS policies `genome_player_read` (player_id = current_player_id()) + `genome_coach_read` are present and RLS is enabled (baseline migration `20260527000000_prod_public_baseline.sql:18681-19364`).
- `golf_player_standing`, `golf_player_stats_cache`, cohort lookup all go through `createAdminClient()` (service-role, **bypasses RLS**) — but the only id passed is the authenticated self id, so data stays self-scoped by code (not by RLS). See INFO finding.

---

### Expected vs actual (golfhelm-features.md #2 Stats, #3 Qualifiers)

- These two surfaces are v3 CoachHelm-genome/standing features that post-date the feature doc (doc "Last verified 2026-02-13"); they are NOT individually catalogued in golfhelm-features.md. The closest spec anchors are #2 Stats & Analytics and the SG/standing framework.
- Doc Known Gap "Strokes Gained not populated" (#2) is **resolved** in the v3 standing path: SG metrics are tracked and rendered (`METRIC_IDS sg_*`), with the SG reference correctly labeled "Field Avg" not "PGA" (`StandingBar/utils.ts:44-55`). Consistent with the SG recalibration memory notes.
- Master-plan intent for My Standing (header in `my-standing/page.tsx:1-14`): "one StandingBar per (player, metric) ... empty state log 5 rounds". Actual matches.
- DIVERGENCE (incomplete in prod path): The W17 **counterfactual line** ("if you putted like the Tour you'd save X strokes") is wired in the LEGACY fork only. With the redesign flag ON (prod), the Fairway fork renders `StandingStrip` with **no** counterfactual — `playerBaseline` is still fetched (`:89-91`) but unused in that branch. See HIGH finding cf-line-dropped.
- DIVERGENCE (audit P3 honesty rule defeated): `applyGenderAnchor` sets `pga_omitted: true` for women's-team players on metrics with no credible women's anchor (course_management, par-type scoring), expecting the render layer to suppress the reference marker. The legacy `StandingBar/Card.tsx` honors this; the prod `StandingStrip` does NOT. See CRITICAL finding strip-pga-omitted.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| CRITICAL | wrong-data | src/components/fairway/charts/StandingStrip.tsx:103-109,119,174 | `StandingStrip` ignores `props.pga_omitted`. It always draws the reference tick (`:174`) and the reference Readout value (`:119`) from `props.pga_value`. For a women's-team player on a metric with no women's anchor, `applyGenderAnchor` returns the **men's** `pga_value` with `pga_omitted:true` (gender-anchor.ts:86-91) expecting suppression. Legacy `Card.tsx:46,88-90,196-206` correctly suppresses; the prod Fairway path does not. | A women's player sees a misleading men's-Tour benchmark ("PGA/LPGA") on Penalties/Double-bogey-rate/Par-3/4/5 scoring as if it were her real reference — the exact contradiction the gender-anchor was built to prevent. Shown as truth. | In StandingStrip compute `pgaPct`/refReadout conditional on `!props.pga_omitted` (mirror Card.tsx): hide the reference Tick and render "—" / hidden for the PGA Readout when omitted. |
| HIGH | incomplete-feature | src/app/golf/(dashboard)/dashboard/my-standing/page.tsx:110-167 | Redesign (prod) fork renders only `StandingStrip` and omits `<CounterfactualLine>` entirely. The legacy fork (`:234-242`) renders it under every bar. `loadPlayerScoringBaseline` is still fetched (`:89-91`) but `playerBaseline` is dead in the Fairway branch. | The W17 "strokes you'd save vs Tour" projection — a headline player-motivation feature — silently disappears for every player in prod. Also a wasted DB read each request. | Render `CounterfactualLine` (or a Fairway equivalent) under each `StandingStrip`, passing `player_30d_scoring_avg={playerBaseline}` as the legacy path does; or remove the now-dead `loadPlayerScoringBaseline` call if intentionally dropped. |
| LOW | no-loading-state | src/app/golf/(dashboard)/dashboard/my-standing/loading.tsx:6-26 | `loading.tsx` is styled in legacy tokens (`surface-stone`, `bg-white/70 backdrop-blur-xl ... shadow-glass`) and is NOT wrapped in the `.fairway-ds` scope. With the redesign flag on, the skeleton does not visually match the Fairway `StandingStrip` cards (`rounded-card border bg-surface shadow-soft`). | Brief visual flash / layout mismatch (skeleton looks like the old glass UI, then resolves to the matte Fairway UI). Cosmetic CLS. | Add a redesign-aware skeleton (or a `fairwayScope`-wrapped matte skeleton matching StandingStrip dimensions). |
| LOW | ux-gap | src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx:118-139 | The player CoachHelm sub-nav (Overview/Development/Standing) has no entry for My Game Profile (`/golf/dashboard/my-game-profile`), and `FairwayMyGameProfile` is not mounted inside `CoachHelmShell`. The two self-surfaces (genome vs standing) are not cross-linked in the same shell. | A player on My Standing has no in-shell path to their genome and vice-versa; discoverability gap. The genome page's only nav-out is "Back to hub". | Either add a "Game Profile" tab to `PLAYER_TABS` and mount `FairwayMyGameProfile` in `CoachHelmShell`, or add a cross-link CTA between the two surfaces. |
| INFO | rls | src/lib/coachhelm/v3/standing/loader.ts:64,93; src/lib/coachhelm/v3/counterfactual/baseline-loader.ts:16; src/lib/coachhelm/v3/counterfactual/player-cohort-loader.ts:8 | Standing map, scoring baseline, and cohort all read via `createAdminClient()` (service-role, RLS bypassed). Self-scoping is enforced only by the page passing `session.player.id`. There are no route params on either page, so no player can currently coerce another id — but the safety is code-discipline, not RLS. | None today (pages only pass self id). Risk surfaces if any future caller passes a non-self id to these loaders. | Prefer the RLS-respecting server client for player-self reads (as the genome loader already does), or add an explicit "caller must pass authenticated self id" assertion / keep these admin loaders for cron-only and add a self-client variant for page reads. |
| INFO | correctness | src/lib/coachhelm/v3/standing/metric-config.ts:55-57 | `approach_proximity_*` carry `unit:'feet'` while `display_label` says "...yd" (e.g. "Approach Proximity 50-125 yd"). This is intentional and correct: the bracket (50-125) is the approach SHOT distance in yards, and the proximity VALUE (rendered via `formatValue ... 'feet'`) is in feet. No feet/yards blending in the math. | None — verified not a unit bug. The bracket-yards / value-feet split is consistent across config, scale (`min/max` in feet), and `formatValue`. | None. Noted to pre-empt a false "yards mislabeled as feet" flag. |

---

### Coverage notes / open questions for live verification

- `pga_omitted` regression (CRITICAL) is best confirmed live with a women's-team demo player on My Standing (prod redesign on): look for a "PGA/LPGA" marker + value on Penalties-per-Round / Double-Bogey Rate / Par-3/4/5 Scoring that should be suppressed.
- Counterfactual absence (HIGH) confirmable by comparing flag-off vs flag-on My Standing: the italic "you'd save X strokes" line under each bar is present off-flag, absent on-flag.
- Genome and standing cron population is wired and non-destructive (verified in code); whether the crons are actually firing in prod (last-run freshness) needs a DB/Vercel-cron check — not verifiable from source.
- RLS policies for `golf_player_genome` / `golf_player_standing` are present in the baseline migration; live `pg_policies` confirmation recommended given the project's history of recreate-regrants-anon.
