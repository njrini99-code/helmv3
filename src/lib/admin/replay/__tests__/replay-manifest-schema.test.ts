import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadSchema,
  listManifestFiles,
  loadManifest,
  validateManifest,
  resolveFixtureFiles,
  FIXTURES_DIR,
} from '../../../../../replay/runners/manifest.mjs';

/**
 * A malformed replay manifest must fail CI here rather than silently never
 * running — see replay/README.md's "Manifest -> fixture -> proof" section.
 * This is the meta-test G.5 asks for: it does not run any replay itself
 * (that is run.mjs's job, deliberately not exercised in CI — it spawns a
 * worktree and an npm install), it only proves every committed manifest is
 * shaped correctly and every fixture file it points at actually exists.
 */
describe('replay manifest schema', () => {
  const schema = loadSchema();
  const files = listManifestFiles();

  it('has at least one manifest committed', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f] as const))('%s validates against the schema', (file) => {
    const { manifest } = loadManifest(file);
    const errors = validateManifest(manifest, schema);
    expect(errors).toEqual([]);
  });

  it.each(files.map((f) => [f] as const))('%s requires an explicit sanitization review', (file) => {
    const { manifest } = loadManifest(file);
    expect(manifest.sanitization?.reviewed).toBe(true);
  });

  it.each(files.map((f) => [f] as const))('%s: every declared fixture file exists on disk', (file) => {
    const { manifest } = loadManifest(file);
    for (const { absSource, target } of resolveFixtureFiles(manifest)) {
      expect(existsSync(absSource), `missing fixture source: ${absSource}`).toBe(true);
      expect(target.length, 'fixture target must be non-empty').toBeGreaterThan(0);
    }
  });

  it.each(files.map((f) => [f] as const))('%s: bad_version and fixed_version are distinct SHAs', (file) => {
    const { manifest } = loadManifest(file);
    expect(manifest.bad_version).not.toEqual(manifest.fixed_version);
  });

  it('rejects a manifest missing a required field', () => {
    const broken = { schema_version: 1, replay_id: 'x' };
    const errors = validateManifest(broken, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: string) => e.includes('missing required field'))).toBe(true);
  });

  it('rejects a manifest whose sanitization.reviewed is not literally true', () => {
    const broken = {
      schema_version: 1,
      replay_id: 'x-y',
      incident_id: 'memory/incidents/x/INC-2026-01-01-x.md',
      feature_id: 'x',
      title: 'x',
      bad_version: '0000000',
      fixed_version: '1111111',
      fixture: [{ source: 'a.ts', target: 'src/a.ts' }],
      test_command: 'echo x',
      expected: { bad_version: 'fail', fixed_version: 'pass' },
      sanitization: { reviewed: false, contains_production_data: false },
      created_at: '2026-01-01',
    };
    const errors = validateManifest(broken, schema);
    expect(errors.some((e: string) => e.includes('sanitization.reviewed'))).toBe(true);
  });

  it('fixtures directory contains no file outside a manifest-declared feature/replay_id path', () => {
    // Cheap guard against an orphaned fixture nobody's manifest points at —
    // not exhaustive, but catches the common case of a stray copy-paste.
    const declaredDirs = new Set(
      files
        .map((f) => loadManifest(f).manifest)
        .map((m) => join(FIXTURES_DIR, m.feature_id, m.replay_id)),
    );
    expect(declaredDirs.size).toBe(files.length);
  });
});
