// =============================================================================
// src/lib/baseball/stat-layer-manifest.ts
//
// Machine-readable backing data for docs/baseball/stats-architecture.md.
//
// This module is the single source of truth for:
//   1. Which BaseballHelm stat tables are DEPRECATED (legacy flat/aggregate
//      layer — see the architecture note for the full three-layer model).
//   2. Which canonical read-model layers replace them.
//   3. The explicit, file-level ALLOWLIST of consumers that are still
//      permitted to reference a deprecated table today ("grandfathered").
//
// `src/lib/baseball/__tests__/stat-layer-contract.test.ts` statically scans
// `src/` and fails the build if:
//   - a file OUTSIDE this allowlist references a deprecated table (a new
//     surface trying to read/write the deprecated layer), or
//   - a file INSIDE this allowlist no longer references a deprecated table
//     (a stale entry — it migrated and should be deleted from this list).
//
// HOW TO USE THIS FILE:
//   - Migrating a consumer off a deprecated table? Delete its entry here in
//     the SAME commit that removes the reference. The contract test enforces
//     this is kept honest in both directions.
//   - Adding new code that needs stat data? Do NOT add an entry here — read
//     from `src/lib/baseball/read-models/stats-center.ts` (box-score/season)
//     or `src/lib/baseball/read-models/elite-stat-events.ts` (event/fact)
//     instead. See docs/baseball/stats-architecture.md.
// =============================================================================

/** The legacy flat/aggregate tables. Retained only for grandfathered reads. */
export const DEPRECATED_STAT_TABLES = [
  'baseball_player_stats',
  'baseball_player_aggregates',
] as const;

export type DeprecatedStatTable = (typeof DEPRECATED_STAT_TABLES)[number];



/**
 * Files the contract test never scans:
 *   - the generated Supabase schema (every real table name appears here by
 *     construction; it is not a "consumer" in any business-logic sense).
 *   - this manifest and the contract test itself, which legitimately hold
 *     the deprecated table name strings as data, not as a read/write call.
 */
export const STAT_LAYER_SCAN_EXCLUDED_FILES = [
  'src/lib/types/database.ts',
  'src/lib/baseball/stat-layer-manifest.ts',
  'src/lib/baseball/__tests__/stat-layer-contract.test.ts',
  // Helm Bridge metadata — lists primaryTable/heartbeatTable names, not a DB consumer.
  'src/lib/admin/feature-registry.ts',
] as const;

export type StatLayerConsumerGroup =
  | 'legacy-import-writer'
  | 'server-action'
  | 'read-model'
  | 'coachhelm-engine'
  | 'page-or-component'
  | 'type-definition'
  | 'test';

export interface GrandfatheredStatLayerConsumer {
  /** Repo-relative path, matching what the contract test's walker produces. */
  path: string;
  group: StatLayerConsumerGroup;
  /** Always 'pending migration' — this list is a live migration backlog. */
  status: 'pending migration';
  /** What it does today, and (where relevant) why it isn't a quick fix. */
  note: string;
}

/**
 * The ~30 current real consumers of the deprecated layer, grouped by surface
 * type. See docs/baseball/stats-migration-plan.md for the phased plan that
 * routes each group onto the canonical read-models via thin adapters.
 */
export const GRANDFATHERED_CONSUMERS: GrandfatheredStatLayerConsumer[] = [
  // --- The legacy writer itself --------------------------------------------
  {
    path: 'src/app/baseball/actions/imports.ts',
    group: 'legacy-import-writer',
    status: 'pending migration',
    note:
      'The legacy flat CSV import (Import Center > "Box score" mode, via ImportWizardClient). commitImport() unconditionally upserts baseball_player_stats regardless of the UI\'s season_totals / game_box_score shape label. Stays the deprecated path until callers move to the games.ts box-score pipeline.',
  },
  {
    path: 'src/components/baseball/import-center/ImportCenterShell.tsx',
    group: 'legacy-import-writer',
    status: 'pending migration',
    note: 'Header comment documents the legacy box-score mode writing baseball_player_stats.',
  },
  {
    path: 'src/components/baseball/source-trust/stamped-trust.ts',
    group: 'legacy-import-writer',
    status: 'pending migration',
    note: 'Provenance column helper for rows committed onto baseball_player_stats by imports.ts.',
  },
  {
    path: 'src/lib/baseball/import-matching.ts',
    group: 'legacy-import-writer',
    status: 'pending migration',
    note: 'Doc comment cross-referencing the existing baseball_player_stats.id a matched row resolves to.',
  },
  {
    path: 'src/lib/baseball/adapters/event-rows.ts',
    group: 'legacy-import-writer',
    status: 'pending migration',
    note: 'Doc comment contrasting this adapter (elite event tables) with the legacy baseball_player_stats columns.',
  },

  // --- Server actions -------------------------------------------------------
  {
    path: 'src/app/baseball/actions/stats.ts',
    group: 'server-action',
    status: 'pending migration',
    note:
      'Reads baseball_player_stats and upserts baseball_player_aggregates (career/practice/game averages, trend). The other half of the legacy write path alongside imports.ts.',
  },
  {
    path: 'src/app/baseball/actions/operational-signals.ts',
    group: 'server-action',
    status: 'pending migration',
    note:
      '#379 Phase 2: loadPlayerHittingSpans\'s season/career OPS baseline now goes through the shared legacy-flat adapter (legacy-stat-adapters.ts) — box-score-era baseball_player_season_stats preferred, legacy baseball_player_aggregates as fallback — instead of a baseball_player_stats stat_type=\'season\' query no writer in this codebase has ever produced (that lookup always returned [], so the cold-streak rule could never fire; now fixed). Still grandfathered: the adapter needs the raw legacy aggregates row fed in as fallback input, and the "recent N games" rolling window + loadGameFacts\'s official-stats existence check still read baseball_player_stats game-type rows directly (no canonical per-game rolling-window primitive exists yet to replace them).',
  },
  {
    path: 'src/app/baseball/actions/practice-effectiveness.ts',
    group: 'server-action',
    status: 'pending migration',
    note: 'Reads baseball_player_stats practice-type rows for before/after practice-effectiveness comparisons.',
  },
  {
    path: 'src/app/baseball/actions/teams.ts',
    group: 'server-action',
    status: 'pending migration',
    note:
      "deleteTeam()'s pre-delete history guard counts rows in baseball_player_stats directly (alongside 10 other tables) to decide whether a team's history would be silently lost by the CASCADE delete. This deliberately targets the deprecated table's own row count — legacy rows written by the still-grandfathered imports.ts/stats.ts writers wouldn't be visible through stats-center.ts's read-model aggregation, so routing this check through the canonical layer would under-count and let a team with real legacy stat history be deleted. Only migrates once imports.ts/stats.ts stop writing baseball_player_stats.",
  },

  // --- Read models (NOT yet behind the canonical entry points) -------------
  //
  // roster.ts, RosterClient.tsx, roster-aggregates-merge.ts (+ its test) all
  // migrated together (#379): the raw legacy-aggregates fetch now lives
  // solely in roster-legacy-aggregates-source.ts (added below), and the merge
  // decision itself was already delegated to legacy-stat-adapters.ts's
  // precedence rule. None of the four files above reference a deprecated
  // stat table anymore.
  {
    path: 'src/lib/baseball/read-models/roster-legacy-aggregates-source.ts',
    group: 'read-model',
    status: 'pending migration',
    note:
      'The sole remaining direct reader of baseball_player_aggregates for the roster surfaces (#379). Fetches the raw legacy row map for a team so legacy-stat-adapters.ts (via roster-aggregates-merge.ts) can resolve its box-score > legacy-fallback > no-data precedence; roster.ts (server) and RosterClient.tsx (browser) both call it instead of querying the deprecated table inline.',
  },
  {
    path: 'src/lib/baseball/read-models/player-today.ts',
    group: 'read-model',
    status: 'pending migration',
    note:
      "#845 review fix (post-#379): the initial #379 migration of this file's \"recent stats\" card onto baseball_box_score_batting/_pitching + baseball_games regressed a legacy-only player (real history captured before the box-score pipeline existed, zero box-score-era games since) from \"shows real recent stats\" to a silent, honest-LOOKING empty list. fetchRecentBoxScoreActivity now falls back to baseball_player_stats ONLY when this player has zero box-score rows (mirroring legacy-stat-adapters.ts's box-score > legacy-fallback > no-data precedence), tagging every entry's sourceLayer so the UI can label an old number honestly. See player-today-honest-loop.test.ts's legacy-fallback describe block.",
  },
  {
    path: 'src/lib/baseball/read-models/player-passport.ts',
    group: 'read-model',
    status: 'pending migration',
    note:
      "#845 review fix (post-#379): the initial #379 migration of the passport's recentActivity/completeness \"Captured stats\" signal onto baseball_box_score_batting/_pitching + baseball_games had the same legacy-only regression as player-today.ts (above). fetchRecentActivity now falls back to baseball_player_stats ONLY when this player has zero box-score rows, restoring the pre-#379 stamped-provenance last-session trust/provenance and tagging recentActivity.sourceLayer so the passport never shows an honest-LOOKING empty count for a legacy-only player.",
  },
  {
    path: 'src/lib/baseball/read-models/player-snapshot-cards.ts',
    group: 'read-model',
    status: 'pending migration',
    note:
      '#379/#845 (partial): exit-velocity fields primarily derive from baseball_batted_ball_events via elite-stat-events.ts\'s own buildHitterMetrics aggregator — closes the former "typed but un-migrated" comment — but fall back to the deprecated baseball_player_stats.exit_velocity column ONLY when this player has zero batted-ball-event rows (#845 review fix: a #379 migration regressed a legacy-only player from "shows a real EV number" to an honest-LOOKING null), mirroring legacy-stat-adapters.ts\'s box-score > legacy-fallback > no-data precedence. Still reads baseball_player_aggregates for (a) the Hitting/Pitching season-average legacy-fallback tier and (b) the game/scrimmage/practice "Performance" card, which has no canonical replacement yet: stats-center.ts exposes official-vs-all splits, not a standalone scrimmage split, and neither canonical layer has a practice-session shape (see docs/baseball/stats-migration-plan.md\'s open practice-shape question). Full migration blocked on that decision, not on adapter availability.',
  },
  {
    path: 'src/lib/baseball/read-models/command-center.ts',
    group: 'read-model',
    status: 'pending migration',
    note:
      '#379 Phase 1: game-context avg/sessions (rosterPulse[].careerAvg/totalSessions) now resolve via legacy-stat-adapters.ts\'s adaptLegacyStatsMap, sourcing box-score/season data from getStatsCenter() (canonical) with the raw legacy row only as fallback + for the still-unreplaced recentTrend field — closing the Command-Center-vs-Stats-Center careerAvg divergence command-center-stats-center-drift.test.ts pinned. Still reads baseball_player_aggregates directly (select expanded to feed the adapter\'s full LegacyAggregateRow shape) because the adapter\'s legacy-fallback tier and recentTrend passthrough require a raw fetch of the deprecated row from SOMEWHERE, and this file is that place for Command Center — same as roster.ts\'s still-pending equivalent. Not deleted from this list: doing so would require either dropping the legacy-fallback tier (a user-facing regression the design forbids) or a new shared raw-fetch module outside this chunk\'s scope; see the #379 command-center-adapter PR body.',
  },

  // --- CoachHelm engine -------------------------------------------------------
  {
    path: 'src/lib/coachhelm/baseball/loaders.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note:
      '#379 Phase 4a: still the input-series loader for the V10 metrics registry, and still cites baseball_player_stats as the DEFAULT/fallback source table for any caller that has not migrated its fetch — after Phase 4b (engine-stat-rows.ts) that is practice-effectiveness.ts plus the legacy-fallback/practice-carve-out rows the engine callers still receive. It now ALSO accepts, additively: (1) a per-row hittingSourceTable/pitchingSourceTable tag a migrated caller sets after normalizing baseball_box_score_batting/_pitching rows (normalizeBoxScoreBattingRow/normalizeBoxScorePitchingRow), which the loader cites verbatim in its source_refs instead of the legacy table; (2) an optional eventDerived input (eventDerivedVelocityFromMetrics) that sources avg exit/pitch velocity from elite-stat-events.ts, winning over the legacy exit_velocity/pitch_velocity scalar per field when present. Retires from this list once every caller has migrated and the legacy-table fallback path is dead code.',
  },
  {
    path: 'src/lib/coachhelm/baseball/generators/v10.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note:
      '#379 Phase 4b: the ONLY remaining cite is practiceEffectivenessGenerator\'s before/after-measurement source ref — honest today because actions/practice-effectiveness.ts still assembles those inputs from baseball_player_stats practice rows (the canonical layers have no practice-session shape; see that action\'s entry above). Migrates together with that action, not before. importQualityGenerator\'s Date.now() window was separately fixed to a caller-supplied nowIso (#811 residual, no table coupling).',
  },
  {
    path: 'src/lib/baseball/coachhelm/engine-stat-rows.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note:
      '#379 Phase 4b: the ONE consolidated stat-row read for the CoachHelm engine (engine-run.ts, outcome-sweep.ts, action-baseline.ts — all migrated off their direct reads onto this). Prefers canonical baseball_box_score_batting/_pitching rows (normalized + source-table tagged via loaders.ts) and reads baseball_player_stats ONLY as (a) the practice carve-out and (b) the legacy-fallback tier for players with zero canonical rows — the design\'s "one place allowed to do it". Retires when Phase 5 retires the legacy writer and the fallback tier has nothing left to serve.',
  },
  {
    path: 'src/lib/coachhelm/baseball/effectiveness/engine.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note:
      '#379 Phase 4b reviewed, deliberately NOT migrated: its before/after source ref cites baseball_player_stats because actions/practice-effectiveness.ts (its only feeder) still computes MeasurementPoints from that table\'s practice/game rows. Re-pointing the cite before the feeder migrates would be dishonest provenance. Blocked on the same practice-session-shape open question as practice-effectiveness.ts.',
  },
  {
    path: 'src/lib/baseball/operational-rule-engine.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note:
      '#379 Phase 4b reviewed, deliberately NOT migrated: player_cold_streak\'s sourceTypes/source-ref label describes the facts operational-signals.ts loads, and that action\'s recent-game rolling window remains a real baseball_player_stats read (its season baseline moves canonical separately, in the Phase 2 chunk). The label follows the data — it updates when the feeder\'s remaining legacy read does.',
  },

  // --- Pages / components -----------------------------------------------------
  // (empty — RosterClient.tsx migrated in #379; it now calls
  // roster-legacy-aggregates-source.ts above instead of querying
  // baseball_player_aggregates inline. Next entrant is the players/[id]
  // profile page, a later #379 chunk.)

  // --- Type definitions (doc-comment references only, no queries) -----------
  {
    path: 'src/lib/types/baseball-coachhelm.ts',
    group: 'type-definition',
    status: 'pending migration',
    note: 'Doc comment on a source-ref type field gives baseball_player_stats as the example source table.',
  },
  {
    path: 'src/lib/types/baseball-imports.ts',
    group: 'type-definition',
    status: 'pending migration',
    note: 'Doc comment cross-referencing the baseball_player_stats.id a row resolves to.',
  },
  {
    path: 'src/lib/types/baseball-signals.ts',
    group: 'type-definition',
    status: 'pending migration',
    note: 'Doc comment example of a signal source_table value.',
  },

  // --- Tests / contract fixtures ----------------------------------------------
  {
    path: 'src/contracts/baseball/product-trust/player-today-honest-loop.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      "#845 review fix. This file's #379 fixture migration onto box-score tables previously removed every reference to the deprecated table; a new describe block now seeds an (empty-by-default, populated per-test) baseball_player_stats + baseball_import_runs fixture to pin fetchRecentBoxScoreActivity's legacy-fallback path in player-today.ts (an already-grandfathered consumer above) — a legacy-only player must see real recentStats, never a silent honest-looking empty. Migrates in lockstep with the production file's own entry.",
  },
  {
    path: 'src/lib/baseball/read-models/__tests__/player-passport-recent-activity.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      "#845 review fix. NEW test file (no prior fixture coverage existed for getPlayerPassport's DB path — player-passport-innings.test.ts only covers the pure summarizePitchingSeason helper). Pins fetchRecentActivity's legacy-fallback path in player-passport.ts (an already-grandfathered consumer above) against a fake baseball_player_stats + baseball_import_runs fixture — a legacy-only player must see real recentActivity data, never a silent honest-looking empty. Migrates in lockstep with the production file's own entry.",
  },
  {
    path: 'src/lib/baseball/read-models/__tests__/command-center.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      'Fake-supabase fixture mirrors command-center.ts (itself grandfathered above), including its baseball_player_aggregates fetch that feeds the #379 shared adapter\'s legacy-fallback tier; migrates when the read-model stops needing a raw legacy fetch.',
  },
  {
    path: 'src/lib/baseball/__tests__/roster-read-model.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      "#379 roster.ts migration. Exercises getRoster() against a fake baseball_player_aggregates table fixture to pin the shared adapter's box-score > legacy-fallback > no-data precedence end to end; references the deprecated table name only as fixture data — roster.ts itself no longer queries it (that now lives solely in roster-legacy-aggregates-source.ts, added above).",
  },
  {
    path: 'src/lib/baseball/read-models/__tests__/roster-legacy-aggregates-source.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      "#379 roster.ts migration. Unit tests for fetchRosterLegacyAggregates() — the one production file still allowed to query baseball_player_aggregates for the roster surfaces — so this fixture use is expected and permanent (mirrors the production entry above), not a stale/migrating consumer.",
  },
  {
    path: 'src/lib/baseball/__tests__/action-baseline.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 4b: pins BOTH tiers of the shared engine stat-row read behind buildActionOutcomeSeed — the legacy-fallback baseline (fake baseball_player_stats rows, no canonical tables seeded) and the canonical-preferred baseline (box-score rows win, legacy game rows dropped). The legacy fixtures are the fallback pin, not staleness; retires with engine-stat-rows.ts.',
  },
  {
    path: 'src/lib/baseball/__tests__/engine-run-coach-triage.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 4b: exercises runBaseballEngineCore (#473 coach-triage skip) against a fake baseball_player_stats table — now the legacy-FALLBACK tier of the shared engine stat-row read (no canonical tables seeded), plus candidate fixtures citing legacy-era provenance. Retires with engine-stat-rows.ts.',
  },
  {
    path: 'src/lib/baseball/__tests__/engine-stat-rows.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 4b: unit tests for engine-stat-rows.ts above — pins the precedence rule (canonical rows replace legacy game rows, practice carve-out, legacy fallback, all-or-nothing canonical degrade), so it necessarily seeds fake baseball_player_stats rows. Retires with engine-stat-rows.ts.',
  },
  {
    path: 'src/lib/baseball/__tests__/outcome-sweep-insight-resolve.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 4b: fake table-name switch pins BOTH tiers of the sweep\'s shared stat-row read — legacy-fallback after-windows (existing tests) and the canonical-preferred, never-blended after-window (new test). Retires with engine-stat-rows.ts.',
  },
  {
    path: 'src/lib/coachhelm/baseball/engine-v10.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 4a: pins loaders.ts\'s legacy-fallback behavior (an unmigrated caller keeps citing baseball_player_stats verbatim in source_refs when no eventDerived/source-table input is supplied) alongside the NEW event-derived-override and box-score-normalization tests — so this legitimately still references the deprecated table by design, not staleness. Retires once loaders.ts drops the legacy-table fallback entirely (tracked on loaders.ts\'s own manifest entry above).',
  },
  {
    path: 'src/lib/baseball/__tests__/engine-run-event-velocity.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#852 residual: pins runBaseballEngineCore threading event-derived velocity (engine-event-derived.ts) into loadAllPlayerMetrics — asserts event-derived avg exit velocity WINS over a legacy baseball_player_stats exit_velocity scalar for the same player, and that a zero-event player keeps their legacy scalar (plus the all-or-nothing degrade on an event-read failure). The legacy fixture rows are the fallback pin, not staleness; retires with loaders.ts\'s legacy-scalar fallback.',
  },
  {
    path: 'src/lib/baseball/__tests__/outcome-sweep-event-velocity.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#852 residual: pins sweepActionOutcomes threading event-derived velocity into its per-action after-window loadPlayerMetrics call — event-derived avg exit velocity wins over the legacy baseball_player_stats scalar for the same player, and a pre-action event is excluded by the after-window filter. The legacy fixture row is the fallback pin, not staleness; retires with loaders.ts\'s legacy-scalar fallback.',
  },
  {
    path: 'src/lib/baseball/__tests__/action-baseline-event-velocity.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#852 residual: pins buildActionOutcomeSeed threading event-derived velocity into its baseline capture — event-derived avg exit velocity wins over the legacy baseball_player_stats scalar for the same player; a zero-event player\'s legacy scalar still seeds the baseline. The legacy fixture row is the fallback pin, not staleness; retires with loaders.ts\'s legacy-scalar fallback.',
  },
  {
    path: 'src/app/baseball/actions/__tests__/imports-registry.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Exercises imports.ts commitImport() against a fake baseball_player_stats table.',
  },
  {
    path: 'src/app/baseball/actions/__tests__/upload-stats-csv.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      'Regression coverage for PR #664 (roster-scoped playerId verification + honest failed-upload status) on uploadStatsCSV in stats.ts, an already-grandfathered consumer above. Uses a table-aware Supabase recorder that inserts into baseball_player_stats and upserts baseball_player_aggregates to mirror that production write path — mirrors imports-registry.test.ts above; production reference is the server-action entry for stats.ts, not a new one.',
  },
  {
    path: 'src/app/baseball/actions/__tests__/operational-signals-cold-streak.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 2 regression coverage, exercised through the real runOperationalSignalDetection action (operational-signals.ts, an already-grandfathered consumer above) — pins the player_cold_streak rule\'s season-baseline fix (box-score-era baseball_player_season_stats preferred, legacy baseball_player_aggregates as fallback) against the dead stat_type=\'season\' query it replaced. Fixture rows reference both deprecated-layer table names as fake-client seed keys, not a new production read; production reference is operational-signals.ts, not a new one.',
  },
  {
    path: 'src/app/baseball/actions/__tests__/practice-effectiveness.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      'Action-level coverage (#825) for practice-effectiveness.ts, an already-grandfathered consumer above. Its fake-supabase fixture seeds an (empty) baseball_player_stats table to mirror that action\'s practice-type read path; migrates in lockstep with the production file. Added to the manifest post-merge — the #825 PR landed without an entry, tripping the contract test\'s scan.',
  },
  {
    path: 'src/contracts/baseball/product-trust.contract.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      "Contains the string only inside a `not.toContain('baseball_player_aggregates')` negative assertion on the command-center PAGE (proving it has already migrated to the adapter). Listed here so the naive string scan does not false-positive on a test that is enforcing the opposite of a violation.",
  },
  {
    path: 'src/contracts/baseball/source-trust/import-stamping.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      'Pins import-source provenance stamping (#377) by exercising imports.ts commitImport() against a fake baseball_player_stats table — mirrors imports-registry.test.ts above; production reference is the legacy-import-writer entry, not a new one.',
  },
  {
    path: 'src/contracts/baseball/source-trust/lineage-and-raw-file.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      'Pins import lineage/raw-file hash recompute (#377) by exercising imports.ts against a fake baseball_player_stats table — mirrors imports-registry.test.ts above; production reference is the legacy-import-writer entry, not a new one.',
  },
  {
    path: 'src/contracts/baseball/stats/seeded-stats-non-empty.smoke.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      '#379 Phase 0 seeded-data smoke test. Exercises scripts/seed-baseball-stats.mjs\'s seedTeamStats() against a fake Supabase client; that script intentionally still writes baseball_player_stats/baseball_player_aggregates (layer 1) ALONGSIDE the new box-score/season writes (layer 2) so grandfathered consumers keep working during the migration window — this test\'s docblock names both deprecated tables as prose, not a new production read. Retires only if the seed script ever stops writing layer 1 (blocked on the same Phase 5 decision as imports.ts).',
  },
  {
    path: 'src/contracts/baseball/stats/command-center-stats-center-drift.test.ts',
    group: 'test',
    status: 'pending migration',
    note:
      "#379 drift test. Runs the real seedTeamStats() reconciliation path (not a hand-built fixture) with a realistic game+practice session mix, then exercises getCommandCenter() (itself grandfathered above) against getStatsCenter()'s box-score-derived numbers for the same player/team/season. UPDATED for #379 Phase 1 (command-center.ts now sources game-context via the shared adapter): pins that Command Center's displayed careerAvg and Stats Center's battingAll.avg now RECONCILE for a player with box-score-era data (previously pinned as a known-open gap). Migrates when command-center.ts stops needing a raw legacy-table fetch.",
  },
] as const;
