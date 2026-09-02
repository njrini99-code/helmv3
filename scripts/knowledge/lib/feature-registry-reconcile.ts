/**
 * feature-registry-reconcile.ts — the PURE half of knowledge:registry-check.
 *
 * No imports, deliberately. The entry script parses YAML and imports the
 * runtime registry; this file only decides, so every refusal can be tested
 * without a fixture and without pulling an untyped dependency into the
 * TypeScript program. Same split as scripts/lib/worktree-lifecycle.mjs.
 *
 * The reasoning behind the crosswalk it validates is
 * memory/decisions/ADR-2026-08-30-helm-knowledge-authority.md.
 */

/** Classifications a runtime key may carry when no semantic feature owns it. */
const UNOWNED_CLASSIFICATIONS = new Set([
  'observability_only', // telemetry surface with no product feature behind it
  'platform', // infrastructure, not a user-facing feature
  'excluded', // deliberately outside the semantic model
  'feature_awareness_gap', // a real product feature with no registry entry YET
]);

export type Problem = { kind: string; detail: string };

export interface ObservabilityBlock {
  feature_keys?: unknown;
  covered_by?: unknown;
  reason?: unknown;
}

export interface FeatureEntry {
  criticality?: unknown;
  observability?: ObservabilityBlock;
}

export interface Registry {
  features?: Record<string, FeatureEntry>;
  observability_keys_unowned?: Record<string, { classification?: unknown; reason?: unknown }>;
}

export function reconcile(reg: Registry, runtimeKeys: Set<string>): Problem[] {
  const problems: Problem[] = [];
  const features = reg.features ?? {};
  const unowned = reg.observability_keys_unowned ?? {};

  // key -> the feature(s) claiming it
  const claims = new Map<string, string[]>();

  for (const [id, f] of Object.entries(features)) {
    const obs = f.observability;
    if (!obs) {
      problems.push({
        kind: 'NO_OBSERVABILITY_DECISION',
        detail: `feature '${id}' records no observability block — say which keys it owns, or say it owns none and why`,
      });
      continue;
    }

    const keys = Array.isArray(obs.feature_keys) ? (obs.feature_keys as string[]) : null;
    if (keys === null) {
      problems.push({
        kind: 'MALFORMED_OBSERVABILITY',
        detail: `feature '${id}': observability.feature_keys must be a list (use [] with a reason for none)`,
      });
      continue;
    }

    if (keys.length === 0) {
      // A deliberate "no keys" needs a reason a reader can act on. covered_by
      // is the strongest form: it names where the telemetry actually lands.
      if (typeof obs.reason !== 'string' || obs.reason.trim().length === 0) {
        problems.push({
          kind: 'UNEXPLAINED_ZERO_COVERAGE',
          detail: `feature '${id}' owns no FeatureKey and records no reason`,
        });
      }
      if (obs.covered_by !== undefined && !(obs.covered_by as string in features)) {
        problems.push({
          kind: 'UNKNOWN_COVERED_BY',
          detail: `feature '${id}': covered_by '${String(obs.covered_by)}' is not a registry feature`,
        });
      }
    }

    for (const k of keys) {
      if (!runtimeKeys.has(k)) {
        problems.push({
          kind: 'PHANTOM_FEATURE_KEY',
          detail: `feature '${id}' maps FeatureKey '${k}', which is not in src/lib/admin/feature-registry.ts`,
        });
        continue;
      }
      claims.set(k, [...(claims.get(k) ?? []), id]);
    }
  }

  for (const [k, owners] of claims) {
    if (owners.length > 1) {
      problems.push({
        kind: 'CONTESTED_FEATURE_KEY',
        detail: `FeatureKey '${k}' is claimed by ${owners.join(' and ')} — one owner per key`,
      });
    }
  }

  for (const [k, entry] of Object.entries(unowned)) {
    if (!runtimeKeys.has(k)) {
      problems.push({
        kind: 'PHANTOM_UNOWNED_KEY',
        detail: `observability_keys_unowned lists '${k}', which is not a runtime FeatureKey`,
      });
    }
    if (claims.has(k)) {
      problems.push({
        kind: 'OWNED_AND_UNOWNED',
        detail: `FeatureKey '${k}' is both owned by ${claims.get(k)!.join(', ')} and listed as unowned`,
      });
    }
    if (!UNOWNED_CLASSIFICATIONS.has(String(entry?.classification))) {
      problems.push({
        kind: 'BAD_CLASSIFICATION',
        detail: `unowned key '${k}': classification '${String(entry?.classification)}' is not one of ${[...UNOWNED_CLASSIFICATIONS].join(', ')}`,
      });
    }
    if (typeof entry?.reason !== 'string' || entry.reason.trim().length === 0) {
      problems.push({
        kind: 'UNEXPLAINED_UNOWNED_KEY',
        detail: `unowned key '${k}' records no reason`,
      });
    }
  }

  for (const k of runtimeKeys) {
    if (!claims.has(k) && !(k in unowned)) {
      problems.push({
        kind: 'UNCLASSIFIED_FEATURE_KEY',
        detail: `runtime FeatureKey '${k}' has no semantic owner and no entry in observability_keys_unowned`,
      });
    }
  }

  return problems;
}
