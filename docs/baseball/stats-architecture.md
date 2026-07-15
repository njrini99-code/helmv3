# BaseballHelm Stats Layer Architecture

> Governance note for GitHub issue #381 ("consolidate legacy flat stats,
> box-score stats, and elite stat-event imports"). Last updated: 2026-07-14.
>
> Machine-readable backing: `src/lib/baseball/stat-layer-manifest.ts`
> Enforced by: `src/lib/baseball/__tests__/stat-layer-contract.test.ts`
> Migration plan: `docs/baseball/stats-migration-plan.md`

## Status note — #379 Phase 0 (2026-07-14): seed/demo reconciliation + tests

This doc and the migration plan named the architecture and the backlog but
had not yet (a) fixed the seed-vs-Stats-Center mismatch issue #379 reports,
(b) implemented the shared legacy adapter, or (c) added the drift/smoke
tests the issue's acceptance criteria ask for. Phase 0 of the #379 design
defers (b) — the shared adapter is a later chunk — but **directly fixes the
reported symptom and adds (c)**:

- **`scripts/seed-baseball-stats.mjs`** now writes BOTH stats layers for
  every `stat_type: 'game'` session it seeds: it still upserts the legacy
  flat/aggregate rows (so the ~30 grandfathered consumers keep showing real
  numbers during the migration window), and it additionally upserts a
  synthetic completed `baseball_games` row + matching
  `baseball_box_score_batting` / `_pitching` line(s), then calls the same
  `recalculate_baseball_season_stats` RPC `actions/games.ts`'s box-score save
  flow calls — not a bespoke insert into `baseball_player_season_stats`.
  Practice sessions have no box-score equivalent yet (see the practice-shape
  open question below) and stay legacy-only. Every write is an upsert;
  nothing is ever deleted and reinserted.
- **`scripts/seed-baseball-demo.ts`**'s doc comment previously claimed Stats
  Center *should* stay empty after seeding — that claim was the root cause
  #379 flagged (a coach running both demo seed scripts still saw a
  contradictory product). The comment now points at
  `seed-baseball-stats.mjs` as its stats-seeding companion and says so
  explicitly.
- **New tests** (`src/contracts/baseball/stats/`):
  `seeded-stats-non-empty.smoke.test.ts` runs the seed script's actual
  reconciled write logic (`seedTeamStats`, exported for this purpose) against
  a fake Supabase client and asserts `getStatsCenter()` returns non-`noData`
  rows for the players the seed claims to have stats for — the exact #379
  symptom as a red/green gate. `command-center-stats-center-drift.test.ts`
  asserts Command Center's (legacy-layer) game-context average and Stats
  Center's (box-score-layer) average do not disagree for the same
  player/team/season, for a fixture built the way the reconciled seed now
  produces data.
- **Not done in this pass** (later #379 phases, per the design's
  sequencing): the shared `legacy-stat-adapters.ts` module, migrating any of
  the grandfathered read-models off direct `baseball_player_aggregates` /
  `baseball_player_stats` reads, and the canonical practice-session shape
  (layer 2 has no practice concept at all today — see
  `docs/baseball/stats-migration-plan.md:80`). Command Center still reads
  the legacy aggregate table directly; the drift test above pins the CURRENT
  cross-surface contract so a later adapter migration can be checked against
  it rather than only against stats-center.ts's own reconcile flag.

## Why this doc exists

BaseballHelm grew three overlapping ways to store the same kind of fact (a
player did X in a game/practice/session), built in three different waves.
Nothing was ever wrong with adding the second and third layers — each solved
a real problem the previous one couldn't. What was missing was a single
place that says, in writing, **which layer is canonical now** and **which
one is being kept alive only for code that hasn't moved off it yet**. This
doc is that place. It does not change any runtime behavior; it names the
status quo and backs the name with a test that keeps it honest.

## TL;DR

| # | Layer | Status | Canonical write path | Canonical read path |
|---|-------|--------|----------------------|----------------------|
| 1 | Legacy flat / aggregate | **DEPRECATED** (grandfathered reads only) | `actions/imports.ts` → `baseball_player_stats`; `actions/stats.ts` → `baseball_player_aggregates` | *(none — direct table reads only; this is exactly the problem)* |
| 2 | Official box-score / season | **CANONICAL** | `actions/games.ts` → `baseball_box_score_batting` / `baseball_box_score_pitching` → `recalculate_baseball_season_stats()` RPC → `baseball_player_season_stats` | `src/lib/baseball/read-models/stats-center.ts` |
| 3 | Elite event-grain | **CANONICAL** | `actions/stat-event-imports.ts` → `baseball_pitch_events` / `baseball_batted_ball_events` / `baseball_swing_events` (+ `baseball_stat_sources` provenance) | `src/lib/baseball/read-models/elite-stat-events.ts` |

**Rule for new code:** every new stat surface reads from layer 2 or layer 3
via the read-model file above it — never directly from a table, and never
from layer 1. `src/lib/baseball/__tests__/stat-layer-contract.test.ts`
enforces the "never from layer 1" half of that rule today (see
[Enforcement](#enforcement)).

---

## Layer 1 — Legacy flat / aggregate (DEPRECATED)

**Tables:** `baseball_player_stats` (one denormalized row per
player/session/stat_type — `'practice' | 'game' | 'other'`, with raw
counting columns), `baseball_player_aggregates` (one row per player/team,
upserted as a derived rollup: `career_avg`, `practice_avg`, `game_avg`,
`pressure_gap`, `recent_trend`, last-5/last-10 averages).

**Who writes it:**
- `src/app/baseball/actions/imports.ts` (`commitImport`) — the legacy CSV
  import path. UPSERTs `baseball_player_stats` keyed on
  `(player_id, team_id, session_date, stat_type)`, with explicit
  create/update conflict handling (never delete-then-reinsert).
- `src/app/baseball/actions/stats.ts` (`recalculatePlayerAggregates` and
  similar) — reads `baseball_player_stats`, derives the season/career/recent
  averages, and upserts `baseball_player_aggregates` keyed on
  `(player_id, team_id)`.

**Who reads it directly today (no read-model in front of it):** ~30 files
across server actions, read-models, the CoachHelm engine, two page
components, and their tests. The full, current, file-by-file list is the
machine-readable manifest at `src/lib/baseball/stat-layer-manifest.ts` —
this doc intentionally doesn't duplicate that list so it can't drift from
it. See `docs/baseball/stats-migration-plan.md` for how each group moves
off this layer.

**Why it isn't deleted yet:** it is still the *only* layer some of the
above surfaces (and the CoachHelm V10 metrics registry derived from them)
know how to read, and it's the only layer the legacy CSV importer writes
to. Deleting the tables today would break those surfaces outright. The
grandfathered allowlist exists precisely so that staying on this layer is a
visible, tracked, intentional choice — not a silent default.

---

## Layer 2 — Official box-score / season (CANONICAL)

**Tables:** `baseball_box_score_batting`, `baseball_box_score_pitching`
(one row per player per game — the honest per-game truth), rolled up by the
`recalculate_baseball_season_stats(p_player_id, p_team_id, p_season_year)`
Postgres function into `baseball_player_season_stats` (one pre-aggregated
row per player/season — does **not** itself distinguish game vs. scrimmage,
which is why the read model below re-derives both splits from the box-score
logs rather than trusting the aggregate blindly).

**Who writes it:** `src/app/baseball/actions/games.ts`. Completing a game
writes the box-score rows, then calls the RPC for every player who appears
in that game's batting or pitching lines.

**Canonical read path:** `src/lib/baseball/read-models/stats-center.ts` —
the Stats Center read model. It:
- Derives OFFICIAL vs. SCRIMMAGE splits from the box-score logs joined to
  `baseball_games.game_type` (the season-stat row alone can't do this).
- Reconciles its derived totals against the stored `baseball_player_season_stats`
  row and flags drift instead of silently trusting either source.
- Is staff-gated server-side (`authorized: false` envelope, not an error,
  for non-staff) — RLS backs every query underneath.

---

## Layer 3 — Elite event-grain (CANONICAL)

**Tables:** `baseball_pitch_events`, `baseball_batted_ball_events`,
`baseball_swing_events` (the three grains the current importer actually
writes), plus `baseball_plate_appearances`, `baseball_fielding_events`,
`baseball_catching_events`, `baseball_baserunning_events`,
`baseball_workload_events` (event-model tables that exist in the schema —
migration `20260624000080_baseball_elite_stat_event_model.sql` — for future
grains), and `baseball_stat_facts` (a generic source-linked metric
escape-hatch table: schema + RLS exist, but **no importer writes to it
yet** — see the drift callout below).

**Who writes it:** `src/app/baseball/actions/stat-event-imports.ts`
(`commitEventImport`). Vendor files (TrackMan / Rapsodo / Blast / Diamond
Kinetics / GameChanger / StatCrew / etc.) are parsed by the adapters in
`src/lib/baseball/adapters/`, mapped grain-by-grain via
`GRAIN_TO_TABLE` in `src/lib/baseball/adapters/event-rows.ts`
(`pitch → baseball_pitch_events`, `batted_ball → baseball_batted_ball_events`,
`swing → baseball_swing_events`), and committed alongside a
`baseball_stat_sources` provenance row (trust tier, source registry) and an
import-run / upload lineage row for rollback.

**Canonical read path:** `src/lib/baseball/read-models/elite-stat-events.ts`
— the per-grain aggregator that turns raw event rows into the derived
metric universe (chase%, zone-swing%, whiff%, CSW%, K9/BB9, velo decay,
pitch-mix board, etc.). Every derived metric carries an honest
`sampleSize` + confidence (via the same `gateSample()` the visuals use — a
thin sample can never report `'high'`), the dominant `trust_tier` /
`data_context` / `source_id` of the rows it was built from, and `null`
(never a fabricated `0`) on a zero denominator. Also staff-gated
server-side, same pattern as Stats Center.

---

## Import paths — one supported entry point per feed type

| Feed type | Entry point (server action) | UI entry point | Target tables | Status |
|---|---|---|---|---|
| Per-game box score | `actions/games.ts` (game completion / box-score upload flow) | Game detail page | `baseball_box_score_batting` / `_pitching` → `baseball_player_season_stats` via RPC | **Canonical** |
| Elite vendor event feeds (TrackMan/Rapsodo/HitTrax/Blast/StatCrew/etc.) | `actions/stat-event-imports.ts` (`commitEventImport`) | Import Center → "Event level" tab → `EventImportWizard` | `baseball_pitch_events` / `baseball_batted_ball_events` / `baseball_swing_events` + `baseball_stat_sources` | **Canonical** |
| Legacy flat CSV (any shape) | `actions/imports.ts` (`commitImport`) | Import Center → "Box score" tab → `ImportWizardClient` | `baseball_player_stats` (always — see drift note below) | **Deprecated.** Must not be the target for new import types. |

`src/components/baseball/import-center/ImportCenterShell.tsx` hosts both UI
entry points side by side ("Box score" mode = the legacy wizard, kept
intact; "Event level" mode = the new wizard) so a coach picks the right one
up front instead of guessing.

### Known drift (documentation debt — not fixed in this pass)

`ImportWizardClient.tsx`'s `DATA_SHAPE_META` labels the "Box score" wizard's
three shape choices with *aspirational* target tables:

- `season_totals` → labeled `baseball_player_season_stats`
- `game_box_score` → labeled `baseball_box_score_batting / baseball_box_score_pitching`
- `event_log` → labeled `baseball_stat_facts`, but actually redirects to the
  Event-level wizard (correct behavior, just a confusing label for the
  table it claims).

None of these labels match reality for the two non-redirected shapes.
`commitImport()` in `actions/imports.ts` has no `dataShape` parameter at
all — every committed row, regardless of which shape the coach picked in
step 1, is written to `baseball_player_stats`. The UI's shape picker only
changes the column template shown to the coach, not where the data lands.
This is exactly the kind of silent layer-mixing this ticket is naming.
Correcting `DATA_SHAPE_META`'s strings (and the redirect copy) to say
`baseball_player_stats` for all three, with a note that `season_totals` /
`game_box_score` shapes should be migrated to `games.ts`'s box-score
pipeline, is a small, separately-reviewable follow-up — intentionally not
bundled into this governance pass so this note's accuracy doesn't depend on
a UI-copy diff landing cleanly.

---

## Canonical read path rule

All **new** stat surfaces must consume the read-model layer in
`src/lib/baseball/read-models/`:

- `stats-center.ts` for box-score / season data.
- `elite-stat-events.ts` for event / fact data.

Never query `baseball_box_score_*`, `baseball_player_season_stats`, the
event-grain tables, or (especially) the deprecated tables directly from a
server action, page, or the CoachHelm engine. If the read-model doesn't yet
expose the shape you need, extend the read-model — don't route around it.

Note that **not every existing file under `read-models/` is itself
canonical yet**: `roster.ts`, `player-today.ts`,
`player-snapshot-cards.ts`, `player-passport.ts`, and `command-center.ts`
currently query `baseball_player_stats` / `baseball_player_aggregates`
directly rather than going through `stats-center.ts`. They are
grandfathered (see the manifest) — being *in* the read-models directory
does not exempt a file from this rule; only `stats-center.ts` and
`elite-stat-events.ts` are the designated canonical entry points today.

## Deprecated compatibility path

`baseball_player_stats` and `baseball_player_aggregates`, written by
`actions/imports.ts` and `actions/stats.ts` respectively, are retained
**only** for the consumers explicitly listed in
`GRANDFATHERED_CONSUMERS` in `src/lib/baseball/stat-layer-manifest.ts`. No
other file may reference either table name.

## Enforcement

`src/lib/baseball/__tests__/stat-layer-contract.test.ts` statically scans
every `.ts`/`.tsx` file under `src/` (excluding the generated Supabase
schema and the manifest/test pair themselves — see
`STAT_LAYER_SCAN_EXCLUDED_FILES`) and asserts:

1. **No new offenders.** Every file that contains the string
   `baseball_player_stats` or `baseball_player_aggregates` must have a
   matching entry in `GRANDFATHERED_CONSUMERS`. A new file that reaches for
   either table fails CI immediately, with the offending path printed in
   the assertion message.
2. **No stale entries.** Every file listed in `GRANDFATHERED_CONSUMERS`
   must still actually reference one of the deprecated tables. Once a
   listed consumer migrates to a canonical read-model, its entry must be
   deleted in the same commit — otherwise the test fails, because the
   manifest is supposed to be a *live* backlog, not a historical record.
3. **No duplicate entries**, so the backlog count stays meaningful.

This intentionally does **not** add a runtime guard or throw inside the
deprecated tables' query path — see the CodeRabbit design rationale in the
issue's coding plan: a static scan grandfathers existing consumers without
touching the live engine's query behavior, while still catching any new
violation in CI.

## See also

- `docs/baseball/stats-migration-plan.md` — the phased plan for moving the
  grandfathered consumers onto the canonical read-models via thin adapters.
- `src/lib/baseball/stat-layer-manifest.ts` — the manifest itself.
- `src/lib/baseball/read-models/stats-center.ts` and
  `src/lib/baseball/read-models/elite-stat-events.ts` — the canonical entry
  points, cross-linked back to this doc in their header comments.
