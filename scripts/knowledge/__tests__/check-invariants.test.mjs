// node:test fixtures for scripts/knowledge/check-invariants.mjs's pure
// validator. Run directly: node --test scripts/knowledge/__tests__/check-invariants.test.mjs
//
// Mirrors check-journeys.test.mjs's shape: every file citation resolves
// against an in-memory fixture map, so a failure here means the VALIDATOR
// logic is wrong, not that a real citation drifted (the CLI against the
// real registry.yml proves that separately).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInvariantsDoc } from '../check-invariants.mjs';

const REGISTRY_FEATURE_IDS = new Set(['shot_tracking', 'golf_round_lifecycle']);

function fakeFiles(map) {
  return {
    fileTracked: (p) => Object.prototype.hasOwnProperty.call(map, p),
    readFileText: (p) => map[p],
  };
}

function validInvariant(overrides = {}) {
  return {
    id: 'round-graph-orphaned-shots',
    feature_id: 'shot_tracking',
    severity: 'critical',
    status: 'active',
    module: 'src/lib/checks.ts',
    symbol: 'evaluateOrphanedShots',
    runner: 'src/lib/run-checks.ts',
    incident: 'memory/incidents/x/INC-1.md',
    description: 'Every shot must reference a persisted hole.',
    ...overrides,
  };
}

const FILES = {
  'src/lib/checks.ts': 'export function evaluateOrphanedShots(count, ids) { return {}; }',
  'src/lib/run-checks.ts': "const CHECK_DEFS = [{ id: 'round-graph-orphaned-shots' }];",
  'memory/incidents/x/INC-1.md': '# incident',
};

test('a minimal valid invariant passes with zero problems', () => {
  const doc = { invariants: [validInvariant()] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.deepEqual(problems, []);
});

test('rejects a feature_id that is not a registry key', () => {
  const doc = { invariants: [validInvariant({ feature_id: 'not_a_real_feature' })] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('feature_id')));
});

test('rejects a duplicate id', () => {
  const doc = { invariants: [validInvariant(), validInvariant()] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('duplicate id')));
});

test('rejects a module path that is not a tracked file', () => {
  const doc = { invariants: [validInvariant({ module: 'src/lib/does-not-exist.ts' })] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('does not resolve to a tracked file')));
});

test('rejects a symbol that does not appear as an export in module', () => {
  const doc = { invariants: [validInvariant({ symbol: 'evaluateSomethingElse' })] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('was not found')));
});

test('accepts a symbol declared with `export const`', () => {
  const files = { ...FILES, 'src/lib/checks.ts': 'export const evaluateOrphanedShots = (count, ids) => ({});' };
  const doc = { invariants: [validInvariant()] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(files) });
  assert.deepEqual(problems, []);
});

test('rejects a runner that does not cite the id as a wired string literal', () => {
  const files = { ...FILES, 'src/lib/run-checks.ts': 'const CHECK_DEFS = [{ id: "some-other-check" }];' };
  const doc = { invariants: [validInvariant()] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(files) });
  assert.ok(problems.some((p) => p.includes('not provably wired')));
});

test('rejects an invalid severity', () => {
  const doc = { invariants: [validInvariant({ severity: 'urgent' })] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('severity must be one of')));
});

test('rejects an untracked incident citation', () => {
  const doc = { invariants: [validInvariant({ incident: 'memory/incidents/x/does-not-exist.md' })] };
  const problems = validateInvariantsDoc(doc, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('incident')));
});

test('a doc without a top-level invariants array fails', () => {
  const problems = validateInvariantsDoc({}, { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('top-level `invariants` array')));
});
