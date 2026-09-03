import { describe, it, expect } from 'vitest';
import {
  resolveRepoMapping,
  matchesRepoGlob,
  type RegistryFeatureEntry,
  type MigrationListingEntry,
} from '../repo-mapping';

const REGISTRY: RegistryFeatureEntry[] = [
  {
    id: 'golf_round_lifecycle',
    featureKeys: ['round_tracking', 'course_library'],
    featureDoc: 'memory/features/golf-round-lifecycle.md',
    code: {
      actions: ['src/app/golf/actions/golf.ts', 'src/app/golf/actions/round-*.ts'],
      services: ['src/lib/golf/**'],
      api: ['src/app/api/golf/rounds/**'],
      db: ['supabase/migrations/*golf_round*.sql', 'supabase/migrations/*golf_shot*.sql'],
      tests: ['src/app/golf/actions/__tests__/golf-schemas.test.ts'],
    },
  },
  {
    id: 'admin_platform',
    featureKeys: ['admin_dashboard'],
    featureDoc: 'memory/features/admin-platform.md',
    code: { services: ['src/lib/admin/**'], db: [], tests: [] },
  },
];

const MIGRATIONS: MigrationListingEntry[] = [
  {
    path: 'supabase/migrations/20260501120000_golf_round_atomic_save.sql',
    definedObjects: ['save_partial_round_atomic', 'golf_rounds'],
  },
  { path: 'supabase/migrations/20260602090000_golf_shot_indexes.sql', definedObjects: ['golf_shots'] },
  { path: 'supabase/migrations/20260703110000_admin_events.sql', definedObjects: ['admin_events'] },
  // A migration with no extracted object list — the caller could not or did
  // not parse it. Filename matching is the only route left.
  { path: 'supabase/migrations/20260801100000_golf_round_review_recap.sql', definedObjects: [] },
];

describe('matchesRepoGlob', () => {
  it('matches a single-star pattern within one path segment', () => {
    expect(matchesRepoGlob('supabase/migrations/*golf_round*.sql', 'supabase/migrations/20260501_golf_round_x.sql')).toBe(
      true,
    );
    expect(matchesRepoGlob('supabase/migrations/*golf_round*.sql', 'supabase/migrations/sub/a_golf_round.sql')).toBe(false);
  });

  it('matches a double-star pattern across segments', () => {
    expect(matchesRepoGlob('src/lib/golf/**', 'src/lib/golf/rounds/save.ts')).toBe(true);
    expect(matchesRepoGlob('src/lib/golf/**', 'src/lib/baseball/save.ts')).toBe(false);
  });

  it('matches a literal path exactly', () => {
    expect(matchesRepoGlob('src/app/golf/actions/golf.ts', 'src/app/golf/actions/golf.ts')).toBe(true);
    expect(matchesRepoGlob('src/app/golf/actions/golf.ts', 'src/app/golf/actions/golf.test.ts')).toBe(false);
  });

  it('treats regex metacharacters in a pattern as literals', () => {
    expect(matchesRepoGlob('src/a.b/c.ts', 'src/axb/c.ts')).toBe(false);
  });
});

describe('resolving the feature', () => {
  it('resolves a runtime feature KEY to its registry id, not just an exact id match', () => {
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: 'save_partial_round_atomic',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });
    expect(result.featureId).toBe('golf_round_lifecycle');
    expect(result.featureDoc).toBe('memory/features/golf-round-lifecycle.md');
  });

  it('resolves an exact registry id too', () => {
    const result = resolveRepoMapping({
      feature: 'admin_platform',
      rpc: null,
      relation: 'admin_events',
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });
    expect(result.featureId).toBe('admin_platform');
  });

  it('REPORTS a registry gap rather than silently returning nothing when the feature is unmapped', () => {
    const result = resolveRepoMapping({
      feature: 'observability_supabase',
      rpc: 'helm_debug_read_db_health_history',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });

    expect(result.featureId).toBeNull();
    expect(result.gaps.map((g) => g.kind)).toContain('FEATURE_NOT_IN_REGISTRY');
    expect(result.gaps[0]?.detail).toContain('observability_supabase');
  });

  it('still resolves the OBJECT when the feature is unmapped — one gap does not blank the whole answer', () => {
    const result = resolveRepoMapping({
      feature: 'not_a_feature',
      rpc: 'save_partial_round_atomic',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });
    expect(result.definition.migrations.map((m) => m.path)).toContain(
      'supabase/migrations/20260501120000_golf_round_atomic_save.sql',
    );
  });

  it('reports an ambiguous feature key rather than picking silently', () => {
    const ambiguous: RegistryFeatureEntry[] = [
      ...REGISTRY,
      { id: 'other_feature', featureKeys: ['round_tracking'], featureDoc: null, code: {} },
    ];
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: null,
      relation: 'golf_rounds',
      registry: ambiguous,
      migrations: MIGRATIONS,
    });
    expect(result.gaps.map((g) => g.kind)).toContain('AMBIGUOUS_FEATURE_KEY');
    expect(result.featureId).toBe('golf_round_lifecycle'); // deterministic: first in input order
  });
});

describe('resolving the object definition', () => {
  it('prefers a migration that DECLARES the object, and marks the match exact', () => {
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: 'save_partial_round_atomic',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });

    expect(result.definition.confidence).toBe('exact');
    expect(result.definition.migrations).toEqual([
      { path: 'supabase/migrations/20260501120000_golf_round_atomic_save.sql', matchedBy: 'declared_object' },
    ]);
  });

  it('falls back to the feature db globs and marks the match heuristic', () => {
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: 'round_review_recap_persist',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });

    expect(result.definition.confidence).toBe('heuristic');
    expect(result.definition.migrations.map((m) => m.path)).toContain(
      'supabase/migrations/20260801100000_golf_round_review_recap.sql',
    );
    expect(result.definition.migrations.every((m) => m.matchedBy === 'feature_db_glob')).toBe(true);
  });

  it('is unknown, and says so, when nothing defines the object', () => {
    const result = resolveRepoMapping({
      feature: 'admin_platform',
      rpc: 'a_function_nothing_defines',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });

    expect(result.definition.confidence).toBe('unknown');
    expect(result.definition.migrations).toEqual([]);
    expect(result.gaps.map((g) => g.kind)).toContain('NO_MIGRATION_DEFINES_OBJECT');
  });

  it('reports a gap when neither an rpc nor a relation was supplied', () => {
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: null,
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });
    expect(result.gaps.map((g) => g.kind)).toContain('NO_OBJECT_SUPPLIED');
    expect(result.object.kind).toBe('unknown');
  });

  it('prefers the rpc over the relation when both are present, matching the fingerprint rule', () => {
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: 'save_partial_round_atomic',
      relation: 'golf_shots',
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });
    expect(result.object).toEqual({ kind: 'rpc', name: 'save_partial_round_atomic' });
  });
});

describe('callers and tests', () => {
  it('returns the feature code patterns that would contain the call sites', () => {
    const result = resolveRepoMapping({
      feature: 'round_tracking',
      rpc: 'save_partial_round_atomic',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });

    expect(result.callerPatterns).toEqual([
      'src/app/api/golf/rounds/**',
      'src/app/golf/actions/golf.ts',
      'src/app/golf/actions/round-*.ts',
      'src/lib/golf/**',
    ]);
    expect(result.testPatterns).toEqual(['src/app/golf/actions/__tests__/golf-schemas.test.ts']);
  });

  it('reports a feature with no db patterns and a feature with no tests as gaps', () => {
    const result = resolveRepoMapping({
      feature: 'admin_platform',
      rpc: null,
      relation: 'admin_events',
      registry: REGISTRY,
      migrations: MIGRATIONS,
    });

    const kinds = result.gaps.map((g) => g.kind);
    expect(kinds).toContain('FEATURE_HAS_NO_DB_PATTERNS');
    expect(kinds).toContain('FEATURE_HAS_NO_TESTS');
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const input = {
      feature: 'round_tracking',
      rpc: 'save_partial_round_atomic',
      relation: null,
      registry: REGISTRY,
      migrations: MIGRATIONS,
    };
    const snapshot = JSON.stringify(input);
    resolveRepoMapping(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
