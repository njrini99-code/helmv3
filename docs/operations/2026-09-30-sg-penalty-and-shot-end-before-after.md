# Strokes gained in the database: penalty attribution and shot end (Q-89), before and after

Status: migration written, **not applied** (independent review: see the PR). Applying it is a separate owner decision.
File: `supabase/migrations/20260930150000_golf_sg_penalty_charged_to_earning_shot.sql`
(rollback capture: `supabase/rollbacks/20260930150000_golf_sg_penalty_charged_to_earning_shot.rollback.sql`,
register row in `supabase/migrations/HELD.md`).

## What changes

The SG chain is `recalculate_round_strokes_gained` -> `golf_round_stats_cache` ->
`golf_player_stats_cache` -> `golf_player_standing`. One migration changes the two SG functions
(`recalculate_round_strokes_gained`, `calculate_round_strokes_gained`; signatures, SECURITY attribute and
grants unchanged):

1. **A penalty is charged to the shot that earned it.** Today the -1 is charged by the penalty row's own lie,
   which is where the ball is played from next (the drop), so a tee shot into the water lands in Approach.
   Now the origin is the nearest preceding non-penalty shot, else the nearest following one, else the row
   itself, exactly as the TypeScript engine does (`getPenaltyCategory`). Tee (par 3: approach) -> Off the tee,
   green or within 50 yd -> Around the green, otherwise Approach. Still exactly -1.
2. **A shot ends where the next non-penalty shot starts** (the held `20260928160000` rule; this migration
   supersedes that file). Each hole's SG then equals expected(first shot) - strokes, so the round total
   reconciles with the score; only the split across legs moves where a lie break sat.
3. **`is_test` rounds store NULL strokes gained**, so the player cache and Standing skip them. Done inside the
   two SG functions; no player-cache, cache-refresh or Standing function body is replaced, so the held OD-01
   chain and its md5 guards are not disturbed.

The Stats pages compute SG in TypeScript on read; the TypeScript engine is changed in the same PR to the same
two rules (next-shot-start added; penalty attribution already matched), and the round review narrative now
charges a penalty to the earning shot too. The two engines are pinned to the same numbers by one shared
fixture file (`src/lib/utils/__tests__/fixtures/sg-shot-rules.json`), asserted by a vitest test and by a pgTAP
test.

## How the numbers below were produced

Read-only SQL on production (`supabase/investigations/2026-09-30-sg-penalty-shot-end-simulation.sql`, SELECT
only, nothing written). The new function body was also installed on a scratch PostgreSQL 16 loaded with a
read-only export of production shots: its `calculate_round_strokes_gained` equals the simulation on all 680
shot-level rounds (largest difference 0.0000), and the old function there equals the simulation's live
variant on all 680 (so the simulation is the function, not an approximation of it).

Basis: non-test completed rounds with shots. **644 are 18-hole** (the Q-90 basis for SG) and are used for the
means; 680 in total (36 nine-hole). Three columns are used:

- **Stored**: `golf_rounds.strokes_gained_*`, what the app reads today.
- **Live function**: what today's function computes from the shots now. It differs from stored on **24 rounds
  of 8 players** (median 3.0 strokes, largest 5.8) because those stored values are stale (recorded before the
  shots were last edited). They change on the recompute whatever the migration does.
- **After**: the new function.

## Per leg, mean strokes gained per round (644 18-hole rounds)

| Leg | Stored | Live function | After | After minus live function |
|---|---:|---:|---:|---:|
| Off the tee | +0.26 | +0.23 | +0.12 | -0.11 |
| Approach | -2.67 | -2.71 | -2.28 | +0.43 |
| Around the green | -0.14 | -0.15 | -0.10 | +0.05 |
| Putting | -2.17 | -2.21 | -2.22 | -0.01 |
| **Total** | -4.73 | -4.85 | -4.48 | +0.36 |

What each rule does to the means (live function -> after, per round):

| Leg | Penalty rule only | Shot end only | Both |
|---|---:|---:|---:|
| Off the tee | -0.32 | +0.21 | -0.11 |
| Approach | +0.27 | +0.16 | +0.43 |
| Around the green | +0.04 | +0.01 | +0.05 |
| Putting | 0.00 | -0.01 | -0.01 |
| Total | 0.00 | +0.36 | +0.36 |

The penalty rule moves strokes between legs and never changes the total. The shot-end rule is what changes the
total (+0.36 a round): with it a hole's SG is exactly expected(first shot) - strokes; with the old per-shot
ends it was not (the audit measured a mean error of 0.46 strokes a round against the shots).

## Off the tee and Approach

Stored -> after: Off the tee **-0.14** a round, Approach **+0.39** a round (net +0.25). The penalty rule alone
moves Off the tee by -0.32, Approach by +0.27 and Around the green by +0.04; that is the "about 0.3 strokes a
round" in Q-89 (a). Against the Tour (0.00 in every leg) one team-level leg changes sign: Team E's Off the tee
goes from +0.10 to -0.06 (table below). Every other team keeps the sign of every leg.

## Per team (mean per round, 18-hole rounds; live function -> after)

Teams are anonymised by size.

| Team | Players / rounds | Off the tee | Approach | Around the green | Putting | Total |
|---|---|---|---|---|---|---|
| A (men's) | 12 / 247 | -0.06 -> -0.26 | -2.77 -> -2.27 | -0.13 -> -0.07 | -1.93 -> -1.94 | -4.89 -> -4.53 |
| B (men's) | 7 / 90 | +0.75 -> +0.73 | -2.38 -> -1.97 | -0.13 -> -0.12 | -3.24 -> -3.26 | -5.00 -> -4.62 |
| C (men's) | 7 / 87 | +0.69 -> +0.67 | -2.53 -> -2.10 | -0.13 -> -0.13 | -3.21 -> -3.23 | -5.19 -> -4.80 |
| D (men's) | 10 / 79 | +0.77 -> +0.63 | -1.39 -> -1.00 | +0.06 -> +0.15 | -0.65 -> -0.65 | -1.21 -> -0.87 |
| E (men's) | 13 / 67 | +0.10 -> -0.06 | -3.60 -> -3.19 | -0.37 -> -0.32 | -1.79 -> -1.79 | -5.66 -> -5.37 |
| F (men's) | 12 / 29 | +0.39 -> +0.45 | -1.84 -> -1.68 | +0.26 -> +0.33 | -2.10 -> -2.10 | -3.30 -> -2.99 |
| G (gender not set) | 6 / 27 | -0.53 -> -0.48 | -4.09 -> -3.79 | -0.59 -> -0.47 | -3.76 -> -3.73 | -8.98 -> -8.48 |
| H (women's) | 5 / 18 | -1.69 -> -1.65 | -6.13 -> -5.74 | -0.76 -> -0.70 | -2.45 -> -2.45 | -11.04 -> -10.53 |

Off the tee falls on Teams A, D and E (-0.20, -0.14, -0.16) and Approach rises on every team.

## How many rounds move

| Basis | Rounds | Any leg moves more than 0.5 | Any leg more than 1 | Total moves more than 0.5 | Total more than 1 |
|---|---:|---:|---:|---:|---:|
| Stored -> after, 18-hole | 644 | 292 | 182 | 198 | 65 |
| Stored -> after, all | 680 | 295 | 183 | 199 | 65 |
| Live function -> after, 18-hole (logic only, excludes the 24 stale rounds) | 644 | 284 | 144 | 190 | 50 |

The held `20260928160000` file counted 66 rounds moving by more than a stroke; the total here is 65 (stored ->
after) for the same reason.

## Largest per-player shifts (players with at least 5 18-hole rounds, 46 of them)

Logic only (live function -> after), mean per round, ranked by the largest single leg. Anonymised.

| Player | Rounds | Largest leg shift | Off the tee | Approach | Around the green | Putting | Total |
|---|---:|---|---|---|---|---|---|
| A | 5 | Approach +1.34 | -0.15 -> -1.11 | -6.24 -> -4.89 | -0.75 -> -0.75 | -3.87 -> -3.87 | -11.01 -> -10.62 |
| B | 12 | Approach +1.24 | -1.75 -> -2.74 | -5.17 -> -3.93 | -0.41 -> -0.25 | -1.73 -> -1.73 | -9.06 -> -8.65 |
| C | 18 | Approach +0.92 | +0.10 -> -0.57 | -2.86 -> -1.94 | -0.03 -> +0.19 | -0.70 -> -0.70 | -3.49 -> -3.03 |
| D | 12 | Approach +0.85 | -0.15 -> -0.47 | -3.83 -> -2.98 | -0.31 -> -0.31 | -2.16 -> -2.21 | -6.45 -> -5.97 |
| E | 14 | Approach +0.81 | -0.13 -> -0.61 | -4.50 -> -3.69 | -0.72 -> -0.50 | -1.81 -> -1.81 | -7.16 -> -6.62 |

(Another player carries numbers identical to D.) 37 of the 46 players move by more than 0.25 strokes a round in
total and 4 by more than 0.5; the largest total shift is +1.14 a round.

**A finding outside the migration:** stored SG is stale on 24 rounds (8 players). For one player all 8 rounds are
stored about 5.5 strokes a round better than the live function gives from the shots. The recompute refreshes
them; it is not caused by the new rules.

## Apply and recompute (owner, after the numbers are accepted)

1. `npm run db:apply -- supabase/migrations/20260930150000_golf_sg_penalty_charged_to_earning_shot.sql` from a
   clean, current `main` (dry run first). The file's DO block refuses to run unless the live
   `recalculate_round_strokes_gained` is the live body (md5 `7f8fc14239e8658719a9e000bd1c61b6`) or the
   `20260928160000` body. Do not apply `20260928160000` as well.
2. Recompute, in this order (service role; not inside the migration because about 700 rounds fire the
   per-row player-cache trigger and one API statement can time out):
   ```sql
   SELECT public.recalculate_round_strokes_gained(id) FROM public.golf_rounds WHERE status = 'completed';
   SELECT public.refresh_player_stats_cache(p.id) FROM public.golf_players p
    WHERE EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.player_id = p.id AND r.status = 'completed');
   SELECT * FROM public.refresh_player_standing(ARRAY(SELECT id FROM public.golf_teams));
   SELECT * FROM public.refresh_player_standing_round_metrics(ARRAY(SELECT id FROM public.golf_teams));
   SELECT * FROM public.refresh_player_standing_shot_metrics(ARRAY(SELECT id FROM public.golf_teams));
   ```
3. Roll back: re-apply the two captured bodies in the rollback file, then repeat step 2.

## Not changed here (still open)

- `update_player_putt_make_pct` (feeds Standing's putting make %) still includes test rounds: held
  `20260928120000`.
- Per-shot SG on the round review and in `team-shot-analysis.ts` still values each shot from its own recorded
  end (a shot-by-shot "what this swing did" figure); only the penalty category and the round and player
  aggregates follow the new rules.
- `calculate_round_strokes_gained` is SECURITY DEFINER and executable by any authenticated user for any round
  id (existing behaviour, unchanged).
