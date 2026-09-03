/**
 * Incident -> feature -> object -> repo definition — brief §70.
 *
 * An error envelope names a FEATURE and an OBJECT (an RPC or a relation).
 * This resolves both into places in this repository: the migration that
 * defines the object, the code patterns that would contain the callers, the
 * tests that cover it, and the feature's current-state doc. It is the step
 * between "the Bridge shows a fingerprint" and "here is the file to open".
 *
 * PURE, WITH THE REPOSITORY PASSED IN
 * ------------------------------------
 * `memory/registry.yml` and the migration listing arrive as INPUTS. Nothing
 * here reads the filesystem, so the whole resolution is fixture-testable and
 * a caller may resolve against a registry other than the working tree's.
 *
 * A FEATURE KEY IS NOT A REGISTRY ID
 * -----------------------------------
 * The envelope carries a runtime feature key (`round_tracking`), and the
 * registry is keyed by feature id (`golf_round_lifecycle`). The bridge
 * between them is `observability.feature_keys` in the registry entry, which
 * is why `RegistryFeatureEntry` carries both. Matching only on the id would
 * report every real envelope as unmapped.
 *
 * GAPS ARE REPORTED, NEVER SWALLOWED
 * -----------------------------------
 * An unmapped feature, a feature with no `db:` patterns, a feature with no
 * `tests:`, an object no migration defines, an envelope with no object at
 * all, two features claiming one feature key — each produces a `gaps` entry
 * naming what is missing. Returning an empty result would look identical to
 * a clean resolution, and the registry gap would stay invisible for exactly
 * as long as nobody happened to check.
 *
 * A gap in one dimension does not blank the others: an unmapped feature
 * still resolves the object if a migration declares it.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The subset of a `memory/registry.yml` feature entry this needs. */
export interface RegistryFeatureEntry {
  /** The registry key, e.g. `golf_round_lifecycle`. */
  id: string;
  /** `observability.feature_keys` — the runtime keys envelopes carry. */
  featureKeys: readonly string[];
  /** `docs.feature`, the current-state doc. */
  featureDoc: string | null;
  code: {
    routes?: readonly string[];
    components?: readonly string[];
    api?: readonly string[];
    actions?: readonly string[];
    services?: readonly string[];
    db?: readonly string[];
    tests?: readonly string[];
  };
}

/** One migration file, optionally with the object names the caller
 *  extracted from it. An empty `definedObjects` means "not parsed", not
 *  "defines nothing" — which is why an empty list degrades to the filename
 *  heuristic rather than to a negative answer. */
export interface MigrationListingEntry {
  path: string;
  definedObjects: readonly string[];
}

export interface RepoMappingInput {
  /** The envelope's `feature` — a runtime feature key OR a registry id. */
  feature: string;
  rpc: string | null;
  relation: string | null;
  registry: readonly RegistryFeatureEntry[];
  migrations: readonly MigrationListingEntry[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type RepoMappingGapKind =
  | 'FEATURE_NOT_IN_REGISTRY'
  | 'AMBIGUOUS_FEATURE_KEY'
  | 'FEATURE_HAS_NO_DB_PATTERNS'
  | 'FEATURE_HAS_NO_TESTS'
  | 'NO_OBJECT_SUPPLIED'
  | 'NO_MIGRATION_DEFINES_OBJECT';

export interface RepoMappingGap {
  kind: RepoMappingGapKind;
  detail: string;
}

export type MigrationMatchKind = 'declared_object' | 'feature_db_glob';

export interface MigrationMatch {
  path: string;
  matchedBy: MigrationMatchKind;
}

export interface RepoMappingResult {
  /** `null` when the feature resolves to no registry entry. */
  featureId: string | null;
  featureDoc: string | null;
  object: { kind: 'rpc' | 'relation' | 'unknown'; name: string | null };
  definition: {
    migrations: readonly MigrationMatch[];
    /** `exact` when a migration DECLARES the object; `heuristic` when only
     *  the feature's own db globs matched; `unknown` when nothing did. */
    confidence: 'exact' | 'heuristic' | 'unknown';
  };
  /** Glob patterns from the feature's api/actions/services entries, sorted. */
  callerPatterns: readonly string[];
  testPatterns: readonly string[];
  gaps: readonly RepoMappingGap[];
}

// ---------------------------------------------------------------------------
// Glob
// ---------------------------------------------------------------------------

/**
 * The narrow glob subset `memory/registry.yml` actually uses: `*` inside one
 * path segment, `**` across segments, everything else literal. Regex
 * metacharacters in the pattern are escaped, so `a.b` does not match `axb` —
 * a bug that would silently over-match many real patterns.
 */
export function matchesRepoGlob(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Order matters: consume `**` before the single-star rule sees its stars.
  const source = escaped
    .split('**')
    .map((segment) => segment.split('*').join('[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`).test(path);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function resolveFeature(
  feature: string,
  registry: readonly RegistryFeatureEntry[],
  gaps: RepoMappingGap[],
): RegistryFeatureEntry | null {
  const byId = registry.find((entry) => entry.id === feature);
  if (byId) return byId;

  const byKey = registry.filter((entry) => entry.featureKeys.includes(feature));
  if (byKey.length === 0) {
    gaps.push({
      kind: 'FEATURE_NOT_IN_REGISTRY',
      detail: `'${feature}' is neither a memory/registry.yml feature id nor one of any feature's observability.feature_keys — map it there`,
    });
    return null;
  }
  if (byKey.length > 1) {
    gaps.push({
      kind: 'AMBIGUOUS_FEATURE_KEY',
      detail: `feature key '${feature}' is claimed by ${byKey.map((e) => e.id).join(', ')} — a runtime key should belong to one feature`,
    });
  }
  return byKey[0] ?? null;
}

export function resolveRepoMapping(input: RepoMappingInput): RepoMappingResult {
  const gaps: RepoMappingGap[] = [];
  const entry = resolveFeature(input.feature, input.registry, gaps);

  // Same preference the fingerprint uses: an RPC names the mechanism more
  // precisely than the relation it happens to touch.
  const objectName = input.rpc ?? input.relation ?? null;
  const objectKind: RepoMappingResult['object']['kind'] = input.rpc ? 'rpc' : input.relation ? 'relation' : 'unknown';

  if (objectName === null) {
    gaps.push({
      kind: 'NO_OBJECT_SUPPLIED',
      detail: 'the envelope carried neither an rpc nor a relation, so no repo definition can be resolved',
    });
  }

  const declared: MigrationMatch[] =
    objectName === null
      ? []
      : input.migrations
          .filter((m) => m.definedObjects.includes(objectName))
          .map((m) => ({ path: m.path, matchedBy: 'declared_object' as const }));

  const dbPatterns = entry?.code.db ?? [];
  if (entry && dbPatterns.length === 0) {
    gaps.push({
      kind: 'FEATURE_HAS_NO_DB_PATTERNS',
      detail: `feature '${entry.id}' declares no code.db patterns, so a migration cannot be located heuristically`,
    });
  }

  const heuristic: MigrationMatch[] =
    declared.length > 0
      ? []
      : input.migrations
          .filter((m) => dbPatterns.some((pattern) => matchesRepoGlob(pattern, m.path)))
          .map((m) => ({ path: m.path, matchedBy: 'feature_db_glob' as const }));

  const migrations = declared.length > 0 ? declared : heuristic;
  const confidence: RepoMappingResult['definition']['confidence'] =
    declared.length > 0 ? 'exact' : heuristic.length > 0 ? 'heuristic' : 'unknown';

  if (objectName !== null && migrations.length === 0) {
    gaps.push({
      kind: 'NO_MIGRATION_DEFINES_OBJECT',
      detail: `no supplied migration declares '${objectName}', and no feature db pattern matched — the object may predate the listing, live in a differently-named file, or not exist`,
    });
  }

  const callerPatterns = [...(entry?.code.api ?? []), ...(entry?.code.actions ?? []), ...(entry?.code.services ?? [])]
    .slice()
    .sort();
  const testPatterns = [...(entry?.code.tests ?? [])].slice().sort();

  if (entry && testPatterns.length === 0) {
    gaps.push({
      kind: 'FEATURE_HAS_NO_TESTS',
      detail: `feature '${entry.id}' declares no code.tests patterns, so no regression coverage can be pointed at`,
    });
  }

  return {
    featureId: entry?.id ?? null,
    featureDoc: entry?.featureDoc ?? null,
    object: { kind: objectKind, name: objectName },
    definition: { migrations, confidence },
    callerPatterns,
    testPatterns,
    gaps,
  };
}
