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
 * The canonical layers every NEW stat surface must consume. Documentation
 * only — not consumed by the contract test, but kept here so the manifest
 * and the architecture note can never drift apart on what "canonical" means.
 */
export const CANONICAL_STAT_LAYERS = [
  {
    name: 'Official box-score / season layer',
    writePath:
      "src/app/baseball/actions/games.ts -> baseball_box_score_batting / baseball_box_score_pitching -> recalculate_baseball_season_stats() RPC -> baseball_player_season_stats",
    readPath: 'src/lib/baseball/read-models/stats-center.ts',
  },
  {
    name: 'Elite event-grain layer',
    writePath:
      "src/app/baseball/actions/stat-event-imports.ts -> baseball_pitch_events / baseball_batted_ball_events / baseball_swing_events (+ baseball_stat_sources provenance; baseball_stat_facts is the generic escape-hatch table — schema exists, no importer writes to it yet)",
    readPath: 'src/lib/baseball/read-models/elite-stat-events.ts',
  },
] as const;

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
    path: 'src/app/baseball/actions/insights.ts',
    group: 'server-action',
    status: 'pending migration',
    note: 'Reads baseball_player_stats + baseball_player_aggregates as model input for legacy insight generation.',
  },
  {
    path: 'src/app/baseball/actions/operational-signals.ts',
    group: 'server-action',
    status: 'pending migration',
    note: 'Reads baseball_player_stats game-type and season-type rows to derive operational rule inputs.',
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
  {
    path: 'src/lib/baseball/read-models/roster.ts',
    group: 'read-model',
    status: 'pending migration',
    note: 'Joins baseball_player_aggregates onto the roster row shape directly instead of via stats-center.ts.',
  },
  {
    path: 'src/lib/baseball/read-models/player-today.ts',
    group: 'read-model',
    status: 'pending migration',
    note: 'Reads baseball_player_stats for "today" snapshot context.',
  },
  {
    path: 'src/lib/baseball/read-models/player-snapshot-cards.ts',
    group: 'read-model',
    status: 'pending migration',
    note:
      'Reads both baseball_player_aggregates and baseball_player_stats; comment flags exit-velocity fields as "typed but un-migrated".',
  },
  {
    path: 'src/lib/baseball/read-models/player-passport.ts',
    group: 'read-model',
    status: 'pending migration',
    note: 'Reads baseball_player_stats for recent-activity counts on the passport card.',
  },
  {
    path: 'src/lib/baseball/read-models/command-center.ts',
    group: 'read-model',
    status: 'pending migration',
    note: 'Joins baseball_player_aggregates directly onto the command-center member rows.',
  },

  // --- CoachHelm engine -------------------------------------------------------
  {
    path: 'src/lib/coachhelm/baseball/loaders.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Loads baseball_player_stats rows as the input series for the V10 metrics registry below.',
  },
  {
    path: 'src/lib/coachhelm/baseball/metrics/registry.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Derives K-rate, BB-rate, AVG, SLG, OBP, ERA, exit/pitch velocity metrics from baseball_player_stats / baseball_player_aggregates columns.',
  },
  {
    path: 'src/lib/coachhelm/baseball/generators/v10.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Cites baseball_player_stats as a source_ref table on generated insight rows.',
  },
  {
    path: 'src/lib/coachhelm/baseball/generators/index.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Falls back to baseball_player_stats as the default source-ref table label.',
  },
  {
    path: 'src/lib/coachhelm/baseball/effectiveness/engine.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Cites baseball_player_stats as the source table for effectiveness-tracking source refs.',
  },
  {
    path: 'src/lib/baseball/coachhelm/outcome-sweep.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Reads baseball_player_stats to sweep for outcome evidence after an action.',
  },
  {
    path: 'src/lib/baseball/coachhelm/engine-run.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Reads baseball_player_stats as part of an engine run pass.',
  },
  {
    path: 'src/lib/baseball/coachhelm/action-baseline.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Reads baseball_player_stats to compute the pre-action baseline metric.',
  },
  {
    path: 'src/lib/baseball/operational-rule-engine.ts',
    group: 'coachhelm-engine',
    status: 'pending migration',
    note: 'Declares baseball_player_stats as a sourceType for the deterministic operational-signal rules.',
  },

  // --- Pages / components -----------------------------------------------------
  {
    path: 'src/app/baseball/(dashboard)/dashboard/players/[id]/page.tsx',
    group: 'page-or-component',
    status: 'pending migration',
    note: 'Player profile page queries baseball_player_stats and baseball_player_aggregates directly for the page-level data fetch.',
  },
  {
    path: 'src/app/baseball/(dashboard)/dashboard/roster/RosterClient.tsx',
    group: 'page-or-component',
    status: 'pending migration',
    note: 'Roster client queries baseball_player_aggregates directly for the roster grid.',
  },

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
    path: 'src/lib/baseball/__tests__/action-baseline.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Exercises action-baseline.ts against a fake baseball_player_stats table; mirrors production until that file migrates.',
  },
  {
    path: 'src/lib/baseball/__tests__/engine-run-coach-triage.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Exercises runBaseballEngineCore (#473 coach-triage skip) against a fake baseball_player_stats table; mirrors engine-run.ts until that file migrates.',
  },
  {
    path: 'src/lib/baseball/__tests__/ai-policy-enforcement.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Fixture source_ref table name mirrors production usage.',
  },
  {
    path: 'src/lib/baseball/__tests__/outcome-sweep-insight-resolve.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Fake table-name switch mirrors outcome-sweep.ts reading baseball_player_stats.',
  },
  {
    path: 'src/lib/baseball/__tests__/signal-from-insight.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Fixture source_table / source value mirrors production signal provenance.',
  },
  {
    path: 'src/lib/coachhelm/baseball/engine-v10.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Fixture source_refs table mirrors generators/v10.ts.',
  },
  {
    path: 'src/lib/coachhelm/baseball/metrics/registry.role-visibility.test.ts',
    group: 'test',
    status: 'pending migration',
    note: 'Fixture table name mirrors registry.ts visibility-ref shape.',
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
] as const;
