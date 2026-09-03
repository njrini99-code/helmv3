/**
 * Feature Constellation (Bridge Premium Phase 3, `/admin/reliability`).
 *
 * Nodes come straight from `fetchFeatureHealth()` — no new I/O. Two honest
 * substitutions from the brief's literal spec, both checked and recorded
 * rather than assumed:
 *
 * - SIZE. `FeatureHealth` (the output type `fetchFeatureHealth()` actually
 *   returns) carries no per-feature traffic/volume number — that lives only
 *   on the classifier's internal input shape (`FeatureHealthInputs.
 *   events24h`), which is not exposed to callers. The closest REAL number on
 *   the output is the occurrence count already on each feature's
 *   `topSignatures`, so node size here is "occurrence volume among a
 *   feature's own top signatures", labelled as exactly that — never claimed
 *   as full traffic.
 *
 * - EDGES. `docs/generated/WORLD_MODEL.json` does not exist on this branch
 *   (checked directly). The brief's fallback, `memory/registry.yml`, was
 *   also checked directly and carries no feature-to-feature edge field at
 *   all — its `integrations` list names EXTERNAL systems (`github_actions`,
 *   `codex`), never other features. The one real, mechanically-derivable
 *   relationship in this codebase is `FEATURE_REGISTRY`
 *   (`src/lib/admin/feature-registry.ts`, the ACTUAL runtime registry
 *   `feature-health.ts` classifies against) recording a `primaryTable` and
 *   `heartbeatTable` per feature — two features sharing one of those tables
 *   is a genuine, verifiable fact, not a guess. `edgeSource` on the returned
 *   view says which of the three the caller actually got, so a page can
 *   render an honest note instead of silently passing a substitute off as
 *   the real thing (same discipline `release-ledger.ts`'s `deploySource`
 *   uses for its own fallback).
 */

import type { FeatureHealth, FeatureStatus, FeatureTrend } from '@/lib/admin/data/feature-health';
import { FEATURE_REGISTRY, type FeatureApp, type FeatureKey, type FeatureDef } from '@/lib/admin/feature-registry';

export interface ConstellationNode {
  key: FeatureKey;
  label: string;
  app: FeatureApp;
  status: FeatureStatus;
  trend: FeatureTrend;
  /** Occurrence volume among this feature's own top signatures — see the
   *  module header for why this is the size proxy, not literal traffic. */
  signalVolume: number;
  activeIncidentSignatures: number;
}

export interface ConstellationEdge {
  source: FeatureKey;
  target: FeatureKey;
  /** The table both features share — the fact the edge is drawn from. */
  sharedTable: string;
}

export type ConstellationEdgeSource = 'world-model' | 'shared-table' | 'none';

export interface FeatureConstellationView {
  nodes: readonly ConstellationNode[];
  edges: readonly ConstellationEdge[];
  edgeSource: ConstellationEdgeSource;
}

function tablesFor(def: FeatureDef): readonly string[] {
  return [def.primaryTable, def.heartbeatTable].filter((t): t is string => Boolean(t));
}

/**
 * Every unordered pair of registry entries that share at least one table.
 * O(n^2) over `FEATURE_REGISTRY` (well under 100 entries) — fine for a
 * once-per-request derivation with no I/O.
 */
function edgesFromSharedTables(registry: readonly FeatureDef[]): ConstellationEdge[] {
  const edges: ConstellationEdge[] = [];
  for (let i = 0; i < registry.length; i += 1) {
    for (let j = i + 1; j < registry.length; j += 1) {
      const a = registry[i]!;
      const b = registry[j]!;
      const shared = tablesFor(a).find((t) => tablesFor(b).includes(t));
      if (shared) edges.push({ source: a.key, target: b.key, sharedTable: shared });
    }
  }
  return edges;
}

/** Pure. `features` is `fetchFeatureHealth()`'s already-fetched result. */
export function buildFeatureConstellation(
  features: readonly FeatureHealth[],
  registry: readonly FeatureDef[] = FEATURE_REGISTRY,
): FeatureConstellationView {
  const nodes: ConstellationNode[] = features.map((f) => ({
    key: f.key,
    label: f.label,
    app: f.app,
    status: f.status,
    trend: f.trend,
    signalVolume: f.topSignatures.reduce((sum, s) => sum + s.count, 0),
    activeIncidentSignatures: f.topSignatures.length,
  }));

  const edges = edgesFromSharedTables(registry);

  return {
    nodes,
    edges,
    edgeSource: edges.length > 0 ? 'shared-table' : 'none',
  };
}
