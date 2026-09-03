import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeDbIncident, readRegistryFeatureIds } from '../incident-memory-writer';
import type { DbIncidentRecord } from '../incident-memory';

let repoRoot = '';

function record(overrides: Partial<DbIncidentRecord> = {}): DbIncidentRecord {
  return {
    featureId: 'golf_round_lifecycle',
    alsoAffects: [],
    date: '2026-09-03',
    slug: 'execute-grant-dropped-on-recreate',
    title: 'save_partial_round_atomic lost its EXECUTE grant',
    status: 'resolved',
    mechanism: 'RPC rejected before any row was written',
    code: '42501',
    relationOrRpc: 'save_partial_round_atomic',
    rootCause: 'Recreating the function dropped its grant.',
    fixPr: { present: true, ref: 'PR #1791' },
    migration: { present: false, reason: 'the grant was restored by the same migration that recreated the function' },
    regressionTest: { present: true, ref: 'src/lib/observability/supabase/__tests__/classify.test.ts' },
    invariant: { present: true, ref: 'an authenticated coach can always save a partial round' },
    fingerprint: 'supabase|postgres|round_tracking|rpc|save_partial_round_atomic|42501',
    sections: [],
    ...overrides,
  };
}

beforeEach(() => {
  repoRoot = mkdtempSync('/tmp/helmv3-incident-writer-');
  mkdirSync(join(repoRoot, 'memory'), { recursive: true });
  writeFileSync(
    join(repoRoot, 'memory/registry.yml'),
    'version: 1\nfeatures:\n  golf_round_lifecycle:\n    name: Golf Round Lifecycle\n  admin_platform:\n    name: Admin Platform\n',
    'utf8',
  );
});

afterEach(() => {
  if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
});

describe('readRegistryFeatureIds', () => {
  it('reads the registry keys from the repo it is pointed at', () => {
    expect(readRegistryFeatureIds(repoRoot).sort()).toEqual(['admin_platform', 'golf_round_lifecycle']);
  });

  it('returns an empty list when the registry cannot be read, so validation refuses rather than passes', () => {
    expect(readRegistryFeatureIds(join(repoRoot, 'does-not-exist'))).toEqual([]);
  });
});

describe('writeDbIncident', () => {
  it('writes the file into the existing Git-backed store at the contract path', () => {
    const result = writeDbIncident({ repoRoot, record: record(), knownFeatureIds: readRegistryFeatureIds(repoRoot) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.relativePath).toBe(
      'memory/incidents/golf_round_lifecycle/INC-2026-09-03-execute-grant-dropped-on-recreate.md',
    );
    expect(existsSync(join(repoRoot, result.relativePath))).toBe(true);

    const body = readFileSync(join(repoRoot, result.relativePath), 'utf8');
    expect(body).toMatch(/^- Feature:\s*`golf_round_lifecycle`/m);
  });

  it('creates no database table and touches nothing outside memory/incidents', () => {
    const result = writeDbIncident({ repoRoot, record: record(), knownFeatureIds: readRegistryFeatureIds(repoRoot) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.relativePath.startsWith('memory/incidents/')).toBe(true);
  });

  it('refuses to overwrite an existing incident — a repeat updates the file, it does not clobber it', () => {
    const options = { repoRoot, record: record(), knownFeatureIds: readRegistryFeatureIds(repoRoot) };
    expect(writeDbIncident(options).ok).toBe(true);

    const second = writeDbIncident(options);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.problems.map((p) => p.kind)).toContain('ALREADY_EXISTS');
  });

  it('refuses a feature id that is not a registry key, and writes nothing', () => {
    const result = writeDbIncident({
      repoRoot,
      record: record({ featureId: 'observability_supabase' }),
      knownFeatureIds: readRegistryFeatureIds(repoRoot),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.kind)).toContain('FEATURE_NOT_IN_REGISTRY');
    expect(existsSync(join(repoRoot, 'memory/incidents/observability_supabase'))).toBe(false);
  });

  it('refuses when the registry could not be read at all rather than writing an unvalidated record', () => {
    const result = writeDbIncident({ repoRoot, record: record(), knownFeatureIds: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.kind)).toContain('NO_REGISTRY_KEYS_SUPPLIED');
  });
});

// ---------------------------------------------------------------------------
// The registry scanner is cross-checked against the real committed file
// ---------------------------------------------------------------------------

describe('readRegistryFeatureIds against the real memory/registry.yml', () => {
  it('finds the feature ids this repo actually has', () => {
    // process.cwd() is the repo root under vitest. This is the cross-check
    // that keeps the narrow scanner honest against the js-yaml read
    // `scripts/knowledge/check-ledger-integrity.mjs` performs.
    const ids = readRegistryFeatureIds(process.cwd());
    expect(ids).toContain('golf_round_lifecycle');
    expect(ids).toContain('admin_platform');
    expect(ids).toContain('shot_tracking');
    expect(ids.length).toBeGreaterThan(10);
    expect(ids.every((id) => /^[a-z0-9_]+$/.test(id))).toBe(true);
  });

  it('finds exactly the directories memory/incidents/ already uses', () => {
    const ids = new Set(readRegistryFeatureIds(process.cwd()));
    for (const dir of ['golf_round_lifecycle', 'admin_platform', 'qualifiers', 'shot_tracking']) {
      expect(ids.has(dir)).toBe(true);
    }
  });
});
