# BaseballHelm stats source of truth (#379)

## Canonical write path

Box-score lines are the canonical persisted stats truth:

- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`

Full box-score saves must be atomic via `save_baseball_full_box_score` RPC before season rollups run.

## Canonical read path (display)

Stats Center reads box-score truth and reconciles against season rows:

- Display: `baseball_box_score_batting` / `baseball_box_score_pitching`
- Reconcile target: `baseball_player_season_stats` via `recalculate_baseball_season_stats`

## Legacy compatibility path

These tables remain for surfaces not yet migrated to box-score reads:

- `baseball_player_stats`
- `baseball_player_aggregates`

Command Center, Player Today, Passport, operational signals, and CoachHelm may still read legacy tables until each surface is migrated.

## Seeding contract

Demo/production seeds must write a coherent game set and fan out consistently:

1. Box-score rows (canonical)
2. Season stats (RPC recompute)
3. Legacy flat stats/aggregates (derived from the same games when still required)

Seeds must not create empty Stats Center with populated legacy-only rows.

## Verification

- `scripts/verify-stats-consistency.ts` — drift checks between layers
- Stats Center non-empty smoke when seed claims stats exist (see `src/contracts/baseball/`)
