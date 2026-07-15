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

### Deliberately out of scope: `baseball_player_season_stats`

The migration does **not** call `recalculate_baseball_season_stats()` or
touch `baseball_player_season_stats`. That table can already hold a team's
season baseline from the unrelated "season_totals" bulk-import path
(`imports.ts`'s `upsertSeasonTotalsImport`) even for a team with zero
box-score rows, and the recalc function does an `ON CONFLICT ... DO UPDATE`
that would silently overwrite (not merge with) that baseline the moment it's
called. Since this migration's contract is copy-only/additive-only against
three named tables, clobbering a fourth table's independently-sourced data as
a side effect would violate that contract. Stats Center's game-log views
(the batting/pitching splits, which read straight off box-score rows) will
show real numbers immediately after this migration runs; only the
season-row **reconcile** cross-check may flag drift until someone
deliberately runs a recalc pass per team. See "Optional follow-up" below.

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
2. Apply the migration file verbatim via `mcp__supabase__apply_migration`
   (file content unchanged from what's committed — this is a WRITE-ONLY repo
   file until that point).
3. Run the **post-check queries** below to confirm row-count parity per team.
4. Spot-check one backfilled team's Stats Center page in the app to confirm
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

## Optional follow-up (not part of this migration, opt-in, per-team)

If Nick confirms a given backfilled team has **no** conflicting
`season_totals`-imported baseline in `baseball_player_season_stats`, the
season-stat reconcile can be brought in sync by calling the existing,
already-gated RPC once per (player, team, season year) touched by the
backfill:

```sql
SELECT public.recalculate_baseball_season_stats(
  '<player_id>'::uuid, '<team_id>'::uuid, <season_year>::int
);
```

This is intentionally a separate, manual, per-team decision — not bundled
into the migration — because it's the one action that overwrites existing
data in `baseball_player_season_stats`, and that table's provenance for a
"zero box-score" team isn't guaranteed to be empty.

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
