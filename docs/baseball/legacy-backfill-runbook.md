# #379 Legacy Stats Backfill — Runbook

> Companion to `supabase/migrations/20260715141727_baseball_legacy_stats_backfill.sql`
> and `docs/baseball/stats-migration-plan.md` / `stats-architecture.md`.
> Last updated: 2026-07-15.
>
> **Status: WRITTEN, NOT APPLIED.** This migration is a one-time, pending-approval
> catch-up — do not run it against any shared project until Nick has explicitly
> signed off. It is not wired into any cron, CI gate, or app code path; nothing
> executes it automatically.

## What it does

`#827` ("#379 Phase 0") fixed `scripts/seed-baseball-stats.mjs` and the live
import/box-score-save paths (`src/app/baseball/actions/imports.ts`,
`src/app/baseball/actions/games.ts`) to write **both** stat layers going
forward — the legacy flat table (`baseball_player_stats`) AND the canonical
box-score tables (`baseball_box_score_batting` / `_pitching` + synthesized
`baseball_games` rows). It did not do anything for teams whose entire game
history predates that fix and lives **only** in the legacy table. Those teams
still show real numbers on Command Center / Roster / Player Today / Passport
(the grandfathered legacy-layer consumers — see
`src/lib/baseball/stat-layer-manifest.ts`) but an honestly-empty Stats Center,
because `src/lib/baseball/read-models/stats-center.ts` reads **only** the
box-score/season layer.

The migration is the one-time catch-up for exactly those teams:

1. Finds every team with a `stat_type = 'game'` row in `baseball_player_stats`
   and **zero** rows in both `baseball_box_score_batting` and
   `baseball_box_score_pitching` ("zero box-score data" — see below).
2. For those teams only, groups their legacy `'game'` rows by
   `(team_id, session_date)` into one shared, synthesized `baseball_games` row
   per team-date (never one row per player — mirrors #827's
   `buildBoxScoreRowsForSessions` fix).
3. Copies each attending player's legacy row into a
   `baseball_box_score_batting` row (always) and a `baseball_box_score_pitching`
   row (only when `innings_pitched > 0`), computing avg/obp/slg/ops and
   era/whip/k9/bb9 with the same formulas
   `src/app/baseball/actions/games.ts`'s `computeBattingRates` /
   `computePitchingRates` use, including outs-based innings-pitched conversion
   (`src/lib/baseball/innings.ts` — the `X.1`/`X.2` notation is thirds of an
   inning, not a decimal fraction).

**Practice rows are never touched.** Only `stat_type = 'game'` rows are read;
`'practice'` and `'other'` rows have no box-score equivalent
(`baseball_games.game_type` only allows `'game'`/`'scrimmage'`).

**Copy-only.** The migration only ever `INSERT`s into `baseball_games`,
`baseball_box_score_batting`, `baseball_box_score_pitching`. It never
`UPDATE`s or `DELETE`s a row of `baseball_player_stats`, or anything else —
the legacy table is read-only input.

**Never mixes into teams already using box-score.** A team with even one
existing box-score row is completely excluded — that team's box-score data is
maintained live by the adapter precedence in `applyGameBoxScoreImport`
(`imports.ts`) and `save_baseball_full_box_score` (`games.ts`), and this
migration never races with or duplicates that path.

### Season-stats interaction: seeded where safe, explicitly flagged where not

**Recalc is not an opt-in, manual, per-team step — it already runs
automatically on every ordinary box-score save.** The already-shipped,
unrelated RPC `save_baseball_full_box_score`
(`supabase/migrations/20260630000000_baseball_save_full_box_score_rpc.sql`) —
called by every normal in-app "save box score" action — unconditionally
calls `recalculate_baseball_season_stats(player_id, team_id, EXTRACT(YEAR
FROM now()))` for every player in whatever game a coach just saved. That
function fully aggregates all of that player's completed-game box-score rows
for the current calendar year and does an `ON CONFLICT ... DO UPDATE` — a
full **overwrite**, not a merge — of `baseball_player_season_stats`.

This migration inserts `baseball_games` rows carrying the legacy rows' real
historical `game_date`. For a team whose entire history "predates #827"
(applied the same day as this migration), those dates can plausibly fall
within the current season year. So the first time any coach enters one
ordinary new game this season for a player who overlaps with a backfilled
team, that live recalc sweeps up these backfilled box-score rows and
overwrites `baseball_player_season_stats` for that (player, team, year) —
with no code change, no extra step, and no opt-in required. If that team
already had a `season_totals`-imported baseline in
`baseball_player_season_stats` for that player/year, it gets silently
replaced at that moment.

**What the migration does about it (Step 4):** it seeds
`baseball_player_season_stats` now, for exactly the `(player_id, team_id,
season_year)` triples its own box-score inserts touch, using the identical
aggregation and rate formulas `recalculate_baseball_season_stats()` uses
(same SUMs, same `w`/`l`/`sv`/`holds`/`blown_saves` derivation from `result`,
same era/whip/k9/bb9 division by raw `ip`). It never invokes the live RPC —
the formulas are mirrored inline, read-only against the rows this migration
just wrote, so the migration never depends on (or risks a future edit to)
that shared function. It is guarded by `ON CONFLICT (player_id, team_id,
season_year) DO NOTHING`, so:

- **No pre-existing season row for that triple** (the common case, since the
  team had zero box-score data): the seed populates it now with numbers that
  exactly match what the inevitable future recalc would produce anyway — so
  that eventual overwrite becomes a substantive no-op, not a surprise.
- **A pre-existing season row already there** (a `season_totals`-imported
  baseline): Step 4 does **not** touch it — copy-only/additive-only is
  preserved. But that row remains exposed to the same already-shipped
  recalc-on-save behavior described above once this migration's box-score
  rows exist. This is not a new risk this migration invents — any team
  mixing legacy and `season_totals` data already had it — but backfilling box
  scores makes it far more likely to actually fire. **Run the pre-flight
  query below before applying** to see exactly which triples this affects,
  and decide with Nick (skip those teams for now, accept the eventual
  overwrite, or snapshot those specific rows externally) before proceeding.

Stats Center's game-log views (the batting/pitching splits, which read
straight off box-score rows) show real numbers immediately after this
migration runs regardless. See "Season-stats rollback" below for how the
Step 4 seed interacts with rollback.

#### Pre-flight query — season rows at risk (run BEFORE applying)

```sql
SELECT bpss.*
FROM public.baseball_player_season_stats bpss
WHERE (bpss.player_id, bpss.team_id, bpss.season_year) IN (
  SELECT DISTINCT ps.player_id, ps.team_id, EXTRACT(YEAR FROM ps.session_date)::integer
  FROM public.baseball_player_stats ps
  WHERE ps.stat_type = 'game'
    AND NOT EXISTS (SELECT 1 FROM public.baseball_box_score_batting bsb WHERE bsb.team_id = ps.team_id)
    AND NOT EXISTS (SELECT 1 FROM public.baseball_box_score_pitching bsp WHERE bsp.team_id = ps.team_id)
);
```

Any row this returns is one Step 4 will deliberately leave alone (`DO
NOTHING`) — and one that stays exposed to the live recalc-on-save behavior
above. **Non-empty result: stop and review with Nick before applying**,
per-team if needed (e.g. hold off on just the affected team's legacy rows
until its `season_totals` baseline is reconciled or intentionally retired).

## Eligibility, precisely

A team qualifies iff, at the moment the migration runs:

```sql
SELECT DISTINCT ps.team_id
FROM baseball_player_stats ps
WHERE ps.stat_type = 'game'
  AND NOT EXISTS (SELECT 1 FROM baseball_box_score_batting bsb WHERE bsb.team_id = ps.team_id)
  AND NOT EXISTS (SELECT 1 FROM baseball_box_score_pitching bsp WHERE bsp.team_id = ps.team_id);
```

This set is snapshotted once into a session-local `TEMP TABLE` (`ON COMMIT
DROP` — never persisted) before any writes happen, so a team's eligibility
can't be affected by rows the migration itself inserts mid-run.

A second, defensive check applies per `(team, date)`: even for an eligible
team, a date is skipped if a `baseball_games` row already exists for that
exact team + date (e.g. a scheduled-but-not-yet-played game created via the
Games UI). The migration never risks minting a second, duplicate game row
next to one that already exists — that date is left for manual/live
handling.

## Known limitations (by design — one-time script, not a product feature)

- **Grouping key is `(team_id, session_date)` only** (no opponent in the key),
  matching the `#827`/`scripts/seed-baseball-stats.mjs` precedent this
  migration mirrors. A genuine double-header (two different-opponent games,
  same team, same date) can't be told apart and collapses onto one game.
- **Duplicate legacy rows for the same player+team+date** (a data-entry dupe)
  can only produce one box-score line — enforced by the table's own
  `UNIQUE (game_id, player_id)` constraint, which has no concept of a player
  appearing twice in "the same game." The winner is the legacy row with the
  lexicographically-smallest `id` (via `ROW_NUMBER()`), so re-running the
  migration always picks the same winner.
- **Pitching `hr` (home runs allowed)** has no legacy column and is always
  `0` — a true, documented gap, not a fabricated stat.
- **`our_score` / `opponent_score` / lineup / `lob` / `batting_order`** have
  no legacy source and are left `NULL` / `0` — honest empty state, not
  invented data.

## Idempotency

Every synthesized id is **deterministic**: a SHA-1 hash of a namespaced key
(`baseball-legacy-backfill-379:<kind>:<...>`), shaped into RFC4122-v5-style
bytes (version nibble forced to `0x5`, variant bits forced to `10xx`) — the
exact pattern `scripts/seed-baseball-stats.mjs`'s `detId()` uses (see its
header comment and `#827`). The namespace is deliberately different from the
seed script's own `baseball-stats-seed` namespace, so these ids can never
collide with the demo seeder's (or anything else's) ids, and so this exact id
formula can be **recomputed** later — not merely looked up from a log — which
is what makes the rollback below possible without any extra bookkeeping
table.

Every `INSERT` is `ON CONFLICT (...) DO NOTHING` keyed on that deterministic
id (games) or the table's natural unique key (`(game_id, player_id)` for
batting/pitching). Re-running the file is always a no-op the second time —
verified empirically (see "Verified" below): a second run against the same
database inserted zero new rows in any of the three tables.

## How the orchestrator applies it

This file stays **written, not applied** until Nick says go. When he does:

1. Run the **pre-check queries** below (also present as SQL comments at the
   bottom of the migration file) via `mcp__supabase__execute_sql` and eyeball
   the team list / row counts — confirm it's the expected set of dormant
   legacy-only teams, not something surprising.
2. Run the **season-stats pre-flight query** above. If it returns any rows,
   stop and get Nick's explicit call on those specific teams/players before
   proceeding (see "Season-stats interaction" above) — do not treat an
   empty migration diff as proof this step is unnecessary.
3. Apply the migration file verbatim via `mcp__supabase__apply_migration`
   (file content unchanged from what's committed — this is a WRITE-ONLY repo
   file until that point).
4. Run the **post-check queries** below to confirm row-count parity per team.
5. Spot-check one backfilled team's Stats Center page in the app to confirm
   real numbers now render (previously empty).

No code changes accompany this migration — nothing needs deploying alongside
it. It's pure data.

### Pre-check query (preview affected teams)

```sql
SELECT
  ps.team_id,
  COUNT(*) FILTER (WHERE ps.stat_type = 'game') AS legacy_game_rows,
  COUNT(DISTINCT ps.session_date) FILTER (WHERE ps.stat_type = 'game') AS legacy_game_dates
FROM public.baseball_player_stats ps
WHERE ps.stat_type = 'game'
  AND NOT EXISTS (SELECT 1 FROM public.baseball_box_score_batting bsb WHERE bsb.team_id = ps.team_id)
  AND NOT EXISTS (SELECT 1 FROM public.baseball_box_score_pitching bsp WHERE bsp.team_id = ps.team_id)
GROUP BY ps.team_id
ORDER BY legacy_game_rows DESC;
```

### Post-check queries (row-count parity)

```sql
-- Distinct (team, date) game-slots: legacy dates vs synthesized baseball_games
-- (identifiable via the notes tag). Counts should match unless the
-- "skip if a game already exists that date" guard fired for some dates.
WITH legacy_dates AS (
  SELECT team_id, COUNT(DISTINCT session_date) AS n
  FROM public.baseball_player_stats
  WHERE stat_type = 'game'
  GROUP BY team_id
),
backfilled_games AS (
  SELECT team_id, COUNT(*) AS n
  FROM public.baseball_games
  WHERE notes LIKE 'Backfilled by #379 one-time legacy stats backfill%'
  GROUP BY team_id
)
SELECT ld.team_id, ld.n AS legacy_game_dates, COALESCE(bg.n, 0) AS backfilled_games
FROM legacy_dates ld
LEFT JOIN backfilled_games bg ON bg.team_id = ld.team_id
ORDER BY ld.team_id;
```

```sql
-- Per-team row parity (swap in a real team id):
SELECT
  (SELECT COUNT(*) FROM public.baseball_player_stats
    WHERE team_id = '<TEAM_ID>' AND stat_type = 'game') AS legacy_game_rows,
  (SELECT COUNT(*) FROM public.baseball_box_score_batting bsb
    JOIN public.baseball_games g ON g.id = bsb.game_id
    WHERE bsb.team_id = '<TEAM_ID>'
      AND g.notes LIKE 'Backfilled by #379 one-time legacy stats backfill%') AS backfilled_batting_rows,
  (SELECT COUNT(*) FROM public.baseball_box_score_pitching bsp
    JOIN public.baseball_games g ON g.id = bsp.game_id
    WHERE bsp.team_id = '<TEAM_ID>'
      AND g.notes LIKE 'Backfilled by #379 one-time legacy stats backfill%') AS backfilled_pitching_rows;
```

`backfilled_batting_rows` should equal `legacy_game_rows` unless duplicate
team+date+player legacy rows existed (see Known Limitations).
`backfilled_pitching_rows` will be `<= legacy_game_rows`: only rows with
`innings_pitched > 0` get a pitching line.

## Rollback story

Copy-only means rollback is a pure delete, and because every id is
deterministic (not random), rollback does not depend on any log or snapshot
from the original run — it **recomputes** the exact same ids from whatever
`baseball_player_stats` currently contains, then deletes any row whose id
matches. Rows this migration never created simply won't match anything (a
pre-existing team's real box-score id was assigned by `gen_random_uuid()`,
not derived from this hash, so it cannot collide), so this is precise and
safe to run at any time after the migration, without needing to already know
which teams were touched.

Run this as one transaction:

```sql
BEGIN;

-- Recompute candidate game ids from CURRENT baseball_player_stats — no
-- eligibility gate needed here; safety comes from exact id match, not from
-- re-deriving "which teams were eligible" (which would self-exclude every
-- team this migration touched, since they now have box-score rows).
WITH game_groups AS (
  SELECT ps.team_id, ps.session_date
  FROM public.baseball_player_stats ps
  WHERE ps.stat_type = 'game'
  GROUP BY ps.team_id, ps.session_date
),
hashed AS (
  SELECT g.team_id, g.session_date,
    substring(
      public.digest('baseball-legacy-backfill-379:box-game:' || g.team_id::text || ':' || g.session_date::text, 'sha1')
      FROM 1 FOR 16
    ) AS raw16
  FROM game_groups g
),
versioned AS (
  SELECT team_id, session_date, set_byte(raw16, 6, (get_byte(raw16, 6) & 15) | 80) AS b1 FROM hashed
),
varianted AS (
  SELECT team_id, session_date,
    set_byte(b1, 8, ((((get_byte(b1, 8) >> 4) & 3) | 8) << 4) | (get_byte(b1, 8) & 15)) AS b2
  FROM versioned
),
hexed AS (SELECT team_id, session_date, encode(b2, 'hex') AS hx FROM varianted),
game_ids AS (
  SELECT team_id, session_date,
    (substring(hx FROM 1 FOR 8) || '-' || substring(hx FROM 9 FOR 4) || '-' ||
     substring(hx FROM 13 FOR 4) || '-' || substring(hx FROM 17 FOR 4) || '-' ||
     substring(hx FROM 21 FOR 12))::uuid AS game_id
  FROM hexed
)
SELECT game_id INTO TEMP _rollback_379_game_ids FROM game_ids;

-- Eyeball this before deleting: should equal the number of games the
-- post-check query above reported as backfilled.
SELECT count(*) AS games_to_delete
FROM public.baseball_games g
JOIN _rollback_379_game_ids c ON c.game_id = g.id;

DELETE FROM public.baseball_box_score_batting
WHERE game_id IN (SELECT game_id FROM _rollback_379_game_ids);

DELETE FROM public.baseball_box_score_pitching
WHERE game_id IN (SELECT game_id FROM _rollback_379_game_ids);

DELETE FROM public.baseball_games
WHERE id IN (SELECT game_id FROM _rollback_379_game_ids);

-- Review the row counts printed by the DELETEs above, THEN:
COMMIT;
-- (or ROLLBACK; instead, to abort without changing anything)
```

`baseball_games`'s `game_id` foreign key on `baseball_box_score_batting` /
`_pitching` is `ON DELETE CASCADE`, so deleting only the `baseball_games` rows
would technically also remove the box-score rows — the explicit 3-statement
form above is preferred for an auditable, step-by-step rollback where each
`DELETE`'s row count is visible before committing.

`baseball_player_stats` (the legacy source) is never touched by the forward
migration, so there is nothing to restore there on rollback.

### Season-stats rollback

Step 4's seed is guarded by `ON CONFLICT DO NOTHING`, so — unlike the
deterministic-id games/box-score rollback above — there is no id to
recompute-and-match for `baseball_player_season_stats` rows: a row this
migration seeded and a row that pre-existed both look like ordinary rows
once written, keyed only on `(player_id, team_id, season_year)`.

This is exactly why the **pre-flight query** ("Season-stats interaction"
above) must be run and its output saved (a screenshot, a CSV export, a copy
of the JSON result) **before** applying the migration:

1. **Before applying**, run the pre-flight query and save its output — that
   is your "already existed" list for every triple this migration is about
   to touch.
2. **If you need to roll back**, run the same pre-flight-shaped query again
   (against the same touched-triple set the games rollback above
   recomputes) and diff against the saved "before" list:
   - Any `(player_id, team_id, season_year)` present **now** but **absent**
     from the saved "before" list was seeded by Step 4 — safe to `DELETE FROM
     baseball_player_season_stats WHERE (player_id, team_id, season_year) =
     (...)` for those rows specifically.
   - Any triple present in **both** is the pre-existing baseline Step 4 never
     touched — leave it alone.
3. If the "before" snapshot was never taken (e.g. this section is read after
   the fact), do **not** guess — treat every season-stats row for a
   backfilled team as unknown provenance and reconcile it manually against
   `season_totals` import records or Nick's own knowledge of that team,
   rather than deleting rows that might be real, independent data.

## Season-stats reconcile (only relevant for pre-existing baselines Step 4 left alone)

For the rarer case flagged by the pre-flight query — a team where
`baseball_player_season_stats` already had a `season_totals`-imported row for
a touched player/year — Nick can force that row in sync with the
now-complete box-score data (this **is** the one action that overwrites
existing data, since it calls the live, already-shipped RPC directly):

```sql
SELECT public.recalculate_baseball_season_stats(
  '<player_id>'::uuid, '<team_id>'::uuid, <season_year>::int
);
```

Do this deliberately and per-team, only after confirming with Nick that the
box-score-derived total should win over whatever `season_totals` baseline is
there — remembering that, per "Season-stats interaction" above, an ordinary
game save for that player this season year will trigger the exact same
overwrite anyway, whether or not anyone runs this by hand.

## Verified

Before writing this runbook, the migration was exercised against a disposable
local Postgres 16 instance (schema mirrored from
`supabase/migrations/20260527000000_prod_public_baseline.sql` +
`20260624001000_baseball_official_stat_breadth.sql` +
`20260708011000`/`20260708022000`'s drift columns — never against any shared
Supabase project) with fixture data covering:

- a normal single-sport batter,
- a two-way player (bats and pitches with a partial-innings `6.2` /
  `4.1` IP notation),
- a duplicate same-player-same-date legacy row (dedupe correctness),
- a team that already has box-score data (must be fully excluded),
- a team with zero box-score data but a pre-existing scheduled
  `baseball_games` row on the same date as a legacy row (that date must be
  skipped).

Results: avg/obp/slg/ops and era/whip/k9/bb9 matched hand-calculated values
(and the outs-based IP conversion) exactly; the already-box-score team was
untouched; the colliding date was correctly skipped; a second run of the
same file inserted zero additional rows anywhere; a rollback recompute+delete
(run inside a `ROLLBACK`ed transaction as a dry run) matched exactly the rows
the migration had created, and nothing else.

### Step 4 (season-stats seed) — re-verified after the post-review fix

Re-exercised against a fresh disposable local Postgres 16 instance (schema
reconstructed directly from the real column/constraint lists in
`20260527000000_prod_public_baseline.sql` and
`20260624001000_baseball_official_stat_breadth.sql`, plus the real,
unmodified `recalculate_baseball_season_stats()` and
`save_baseball_full_box_score()` function bodies from this repo — never
against any shared Supabase project) with fixtures covering exactly the
scenario the review flagged:

- a two-way player on an eligible team with **no** pre-existing
  `baseball_player_season_stats` row for the touched season year,
- a second player on the **same** eligible team **with** a pre-existing
  `season_totals`-imported baseline row for that year,
- a team that already has box-score data (must be fully excluded from
  Step 4 too, not just Steps 1-3).

Confirmed:
- Step 4 seeded the first player's season row with `g`/`ab`/`h`/`hr`/`avg`/
  `obp`/`slg`/`ops` and `ip`/`era`/`whip`/`k9`/`bb9` matching hand-calculated
  values exactly, aggregated across both backfilled games.
- Step 4 left the second player's pre-existing baseline **completely
  unchanged** (`DO NOTHING` fired; row was excluded from the `INSERT ...
  RETURNING` count).
- The already-box-score team got zero season-stats rows from Step 4.
- Re-running the whole migration file a second time was still a no-op
  everywhere, including Step 4.
- The pre-flight query above, run against the fixtures **before** applying,
  correctly returned exactly the second player's at-risk row and nothing
  else.
- **Reproduced the exact risk this section documents:** after applying,
  calling the real, unmodified `save_baseball_full_box_score()` RPC for a
  brand-new ordinary game dated in the same season year, with both players
  in its box score, behaved exactly as written above — the first player's
  seeded row extended cleanly (2 games → 3, numbers correct) with no
  surprise, while the second player's pre-existing `season_totals` baseline
  was silently overwritten by that already-shipped RPC, exactly as warned.
  This was not a hypothetical for this test — it happened on the very next
  ordinary save.
- The rollback story (games/box-score delete + the season-stats diff-based
  delete described in "Season-stats rollback" above) correctly removed only
  the seeded row and left the pre-existing baseline intact.
