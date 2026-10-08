import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseRegistry, mapFilesToFeatures, selectContextDocs, docRetiredStatus } from '../registry.mjs';

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

describe('selectContextDocs — capped, primary-first, STATUS-filtered', () => {
  function withRepo(files, fn) {
    const root = mkdtempSync(join(tmpdir(), 'ctxdocs-'));
    try {
      for (const [path, body] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), body);
      }
      return fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const feature = (id, docGroups, matched = 1) => ({
    id,
    matchedFiles: Array.from({ length: matched }, (_, i) => `f${i}.ts`),
    docs: Object.values(docGroups).flat(),
    docGroups,
  });

  it('returns at most three docs, primary docs before incident docs', () => {
    withRepo(
      Object.fromEntries(
        ['a.md', 'b.md', 'c.md', 'd.md', 'inc1.md', 'inc2.md'].map((p) => [p, '# doc\n']),
      ),
      (root) => {
        const { docs } = selectContextDocs(
          [feature('x', { feature: 'a.md', flows: ['b.md'], incidents: ['inc1.md', 'inc2.md'] })],
          root,
        );
        expect(docs).toEqual(['a.md', 'b.md', 'inc1.md']);
      },
    );
  });

  it('lists the strongest-matching feature primary first', () => {
    withRepo({ 'weak.md': 'x', 'strong.md': 'x' }, (root) => {
      const { docs } = selectContextDocs(
        [feature('weak', { feature: 'weak.md' }, 1), feature('strong', { feature: 'strong.md' }, 5)],
        root,
      );
      expect(docs).toEqual(['strong.md', 'weak.md']);
    });
  });

  it.each(['STALE', 'HISTORICAL', 'SUPERSEDED', 'RETIRED'])(
    'skips a doc whose banner says %s and reports why',
    (word) => {
      withRepo(
        {
          'old.md': `# Title\n\n> **STATUS: ${word} — replaced by AGENTS.md**\n`,
          'new.md': '# Title\n',
        },
        (root) => {
          const result = selectContextDocs(
            [feature('x', { feature: 'old.md', flows: ['new.md'] })],
            root,
          );
          expect(result.docs).toEqual(['new.md']);
          expect(result.skipped).toEqual([{ path: 'old.md', status: word }]);
        },
      );
    },
  );

  it('recognises the plain and bold-key banner forms and ignores a status past the header', () => {
    withRepo(
      {
        'plain.md': 'STATUS: SUPERSEDED\n\nbody',
        'bold.md': '**Status:** HISTORICAL\n\nbody',
        'live.md': `${'filler line\n'.repeat(200)}> **STATUS: STALE**\n`,
      },
      (root) => {
        expect(docRetiredStatus(root, 'plain.md')).toBe('SUPERSEDED');
        expect(docRetiredStatus(root, 'bold.md')).toBe('HISTORICAL');
        expect(docRetiredStatus(root, 'live.md')).toBeNull();
      },
    );
  });

  it('drops docs that do not exist', () => {
    withRepo({ 'real.md': 'x' }, (root) => {
      const { docs } = selectContextDocs([feature('x', { feature: 'gone.md', flows: ['real.md'] })], root);
      expect(docs).toEqual(['real.md']);
    });
  });
});
