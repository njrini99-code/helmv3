import { describe, it, expect } from 'vitest';
import { parseRegistry, mapFilesToFeatures } from '../registry.mjs';

describe('parseRegistry — coerceScalar inline arrays', () => {
  // Regression fixture: memory/registry.yml carried 16 features using this
  // exact inline form (`feature_keys: [round_tracking, course_library]`)
  // before world-model.mjs's first real read of `observability` through
  // this parser turned up the bug (2026-09-02) — a non-empty inline array
  // fell through to the plain-scalar branch and became the literal string
  // "[round_tracking, course_library]", which a naive `for...of` over it
  // then iterated character by character.
  const fixture = `
version: 1

features:
  golf_round_lifecycle:
    name: Golf Round Lifecycle
    status: active
    owner: platform
    criticality: high
    observability:
      feature_keys: [round_tracking, course_library]
    docs:
      feature: memory/features/golf-round-lifecycle.md
    code:
      routes:
        - src/app/golf/round/**
    review:
      required_docs: []
`;

  it('parses a non-empty inline array into a real array, not a literal string', () => {
    const registry = parseRegistry(fixture);
    const keys = registry.features.golf_round_lifecycle.observability.feature_keys;
    expect(Array.isArray(keys)).toBe(true);
    expect(keys).toEqual(['round_tracking', 'course_library']);
  });

  it('still parses the empty inline array as an empty array', () => {
    const text = fixture.replace(
      'feature_keys: [round_tracking, course_library]',
      'feature_keys: []',
    );
    const registry = parseRegistry(text);
    expect(registry.features.golf_round_lifecycle.observability.feature_keys).toEqual([]);
  });

  it('still parses a single-item inline array', () => {
    const text = fixture.replace(
      'feature_keys: [round_tracking, course_library]',
      'feature_keys: [admin_dashboard]',
    );
    const registry = parseRegistry(text);
    expect(registry.features.golf_round_lifecycle.observability.feature_keys).toEqual(['admin_dashboard']);
  });

  it('does not disturb the block-list form the same key can also take', () => {
    const text = fixture.replace(
      'feature_keys: [round_tracking, course_library]',
      'feature_keys:\n        - round_tracking\n        - course_library',
    );
    const registry = parseRegistry(text);
    expect(registry.features.golf_round_lifecycle.observability.feature_keys).toEqual([
      'round_tracking',
      'course_library',
    ]);
  });

  it('a plain quoted string scalar elsewhere in the same file is unaffected', () => {
    const registry = parseRegistry(fixture);
    expect(registry.features.golf_round_lifecycle.name).toBe('Golf Round Lifecycle');
    expect(registry.features.golf_round_lifecycle.docs.feature).toBe(
      'memory/features/golf-round-lifecycle.md',
    );
  });
});

describe('matchGlob / mapFilesToFeatures — still route correctly after the fix', () => {
  it('a feature whose only change is the array-parsing fix still maps its routes', () => {
    const registry = parseRegistry(`
features:
  golf_round_lifecycle:
    criticality: high
    observability:
      feature_keys: [round_tracking]
    docs:
      feature: memory/features/golf-round-lifecycle.md
    code:
      routes:
        - src/app/golf/round/**
`);
    const [feature] = mapFilesToFeatures(registry, ['src/app/golf/round/page.tsx']);
    expect(feature.id).toBe('golf_round_lifecycle');
  });
});
