// node:test fixtures for scripts/knowledge/bench.mjs's pure scoring functions.
// Run directly: node --test scripts/knowledge/__tests__/bench.test.mjs
//
// These exercise isRetiredDoc / buildDocEntries / scoreTask / aggregateScores
// against small in-memory fixtures — no shell-out to the real CLIs, no real
// filesystem. That is deliberate: `npm run knowledge:bench` running clean
// against the real gold set proves the CURRENT retrieval path scores well or
// poorly today; these fixtures prove the SCORER's arithmetic is right
// regardless of what today's retrieval path does. K.5's "bench-regression
// test: a known-good knowledge:context run for a fixed task must not
// regress recall below a floor" is the last test in this file, pinned
// against a frozen fixture rather than live retrieval — exactly the
// distinction K.7 draws between a hard gate and a directional live score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetiredDoc, buildDocEntries, scoreTask, aggregateScores } from '../bench.mjs';

test('isRetiredDoc: SUPERSEDED, HISTORICAL, archive prefix, and null-head are each detected', () => {
  assert.equal(isRetiredDoc('docs/x.md', 'STATUS: SUPERSEDED\nsome body'), 'SUPERSEDED');
  assert.equal(isRetiredDoc('docs/x.md', '**Status:** SUPERSEDED — see the replacement'), 'SUPERSEDED');
  assert.equal(isRetiredDoc('docs/x.md', 'STATUS: HISTORICAL\nsome body'), 'HISTORICAL');
  assert.equal(isRetiredDoc('docs/archive/old.md', 'ordinary text, no status line'), 'ARCHIVED');
  assert.equal(isRetiredDoc('archive/old.md', 'ordinary text'), 'ARCHIVED');
  assert.equal(isRetiredDoc('docs/x.md', 'ordinary, current text'), null);
  assert.equal(isRetiredDoc('docs/x.md', null), null);
});

test('buildDocEntries: fixed 3 docs first, then feature docs in order, deduped, missing files marked not-included', () => {
  const mapFeatureRecords = [
    { id: 'feature_a', docs: ['memory/registry.yml', 'memory/features/feature-a.md'] },
    { id: 'feature_b', docs: ['memory/features/feature-a.md', 'memory/features/feature-b.md', 'memory/features/missing.md'] },
  ];
  const files = {
    'AGENTS.md': 'agents content',
    'CLAUDE.md': 'claude content',
    'memory/registry.yml': 'registry content',
    'memory/features/feature-a.md': 'a'.repeat(10),
    'memory/features/feature-b.md': 'b content',
  };
  const entries = buildDocEntries(mapFeatureRecords, {
    root: '/fake',
    maxDocChars: 5000,
    readFileText: (root, p) => files[p],
    fileExists: (root, p) => Object.prototype.hasOwnProperty.call(files, p),
  });

  assert.deepEqual(
    entries.map((e) => e.path),
    ['AGENTS.md', 'CLAUDE.md', 'memory/registry.yml', 'memory/features/feature-a.md', 'memory/features/feature-b.md', 'memory/features/missing.md'],
  );
  assert.equal(entries.find((e) => e.path === 'memory/features/missing.md').included, false);
  assert.equal(entries.find((e) => e.path === 'memory/features/feature-a.md').included, true);
  assert.equal(entries.find((e) => e.path === 'memory/features/feature-a.md').text, 'a'.repeat(10));
});

test('buildDocEntries: truncates a doc to maxDocChars', () => {
  const mapFeatureRecords = [{ id: 'feature_a', docs: [] }];
  const files = { 'AGENTS.md': 'x'.repeat(100), 'CLAUDE.md': 'short', 'memory/registry.yml': 'short' };
  const entries = buildDocEntries(mapFeatureRecords, {
    root: '/fake',
    maxDocChars: 10,
    readFileText: (root, p) => files[p],
    fileExists: (root, p) => Object.prototype.hasOwnProperty.call(files, p),
  });
  assert.equal(entries.find((e) => e.path === 'AGENTS.md').text.length, 10);
});

function baseTask(overrides = {}) {
  return {
    id: 'INC-fixture',
    gold_feature: 'feature_a',
    gold_feature_secondary: [],
    seed_file: 'src/a.ts',
    gold_files: ['src/a-helper.ts'],
    task_description: 'fixture task',
    ...overrides,
  };
}

function docEntry(path, { included = true, text = '' } = {}) {
  return { path, included, text };
}

test('scoreTask: feature_recall_hit true when gold_feature is predicted, wrong_features excludes secondary', () => {
  const task = baseTask({ gold_feature_secondary: ['feature_c'] });
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a', 'feature_c', 'feature_z'],
    mapFeatureRecords: [
      { id: 'feature_a', docs: ['memory/features/feature-a.md'] },
      { id: 'feature_c', docs: [] },
      { id: 'feature_z', docs: [] },
    ],
    registryFeatures: { feature_a: { code: { actions: ['src/a*.ts'] } }, feature_c: { code: {} }, feature_z: { code: {} } },
    docEntries: [docEntry('AGENTS.md'), docEntry('CLAUDE.md'), docEntry('memory/registry.yml'), docEntry('memory/features/feature-a.md')],
    goldDocPath: 'memory/features/feature-a.md',
    retiredLookup: () => null,
  });
  assert.equal(result.feature_recall_hit, true);
  assert.deepEqual(result.wrong_features, ['feature_z']); // feature_c is a declared secondary, not "wrong"
});

test('scoreTask: gold_file_recall uses the FULL registry feature record\'s code globs, not the reduced map projection', () => {
  const task = baseTask({ gold_files: ['src/a-helper.ts', 'src/unrelated.ts'] });
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a'],
    mapFeatureRecords: [{ id: 'feature_a', docs: [] }], // deliberately NO `.code` here — that's the reduced projection
    registryFeatures: { feature_a: { code: { actions: ['src/a*.ts'] } } },
    docEntries: [],
    goldDocPath: null,
    retiredLookup: () => null,
  });
  // src/a-helper.ts matches `src/a*.ts`; src/unrelated.ts does not.
  assert.equal(result.gold_file_recall, 0.5);
});

test('scoreTask: gold_file_recall is null when the task declares no gold_files (excluded from aggregate, not scored 0)', () => {
  const task = baseTask({ gold_files: [] });
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a'],
    mapFeatureRecords: [{ id: 'feature_a', docs: [] }],
    registryFeatures: { feature_a: { code: {} } },
    docEntries: [],
    goldDocPath: null,
    retiredLookup: () => null,
  });
  assert.equal(result.gold_file_recall, null);
});

test('scoreTask: recall_at_k_feature_docs_only excludes the 3 fixed docs from the ranking', () => {
  const task = baseTask();
  // 3 fixed docs, then 6 feature docs — gold doc is the 6th feature doc
  // (index 5), so it is within the top-10 feature-docs-only window but
  // would ALSO be within a naive top-10-of-everything window at index 8.
  // Put it right at the feature-docs boundary to prove the two views can
  // disagree: index 5 among feature docs only (< 10, hit) vs index 8 among
  // the full list (< 10, also hit) — use K=5 instead, where they diverge:
  // feature-docs-only index 5 is a MISS at K=5, full-list index 8 is also a
  // miss at K=5, so pick an index that actually separates the two views.
  const featureDocs = ['d1', 'd2', 'd3', 'd4', 'gold-doc'].map((p) => docEntry(`memory/features/${p}.md`));
  const entries = [docEntry('AGENTS.md'), docEntry('CLAUDE.md'), docEntry('memory/registry.yml'), ...featureDocs];
  // Full-list index of gold doc: 3(fixed) + 4 = 7 -> miss at K=5, hit at K=10.
  // Feature-docs-only index: 4 -> hit at K=5.
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a'],
    mapFeatureRecords: [{ id: 'feature_a', docs: [] }],
    registryFeatures: { feature_a: { code: {} } },
    docEntries: entries,
    goldDocPath: 'memory/features/gold-doc.md',
    retiredLookup: () => null,
  });
  assert.equal(result.recall_at_k_feature_docs_only[5], true, 'gold doc is the 5th feature-specific doc — a hit at K=5 once the fixed 3 are excluded');
  assert.equal(result.recall_at_k_full[5], false, 'gold doc is the 8th doc overall — a miss at K=5 when the fixed 3 count against the budget');
  assert.equal(result.recall_at_k_full[10], true);
});

test('scoreTask: irrelevant_token_rate counts only feature-doc chars owned solely by a non-gold feature', () => {
  const task = baseTask({ gold_feature: 'feature_a', gold_feature_secondary: [] });
  const entries = [
    docEntry('AGENTS.md', { text: 'x'.repeat(1000) }), // fixed doc — excluded from the denominator entirely
    docEntry('memory/features/feature-a.md', { text: 'a'.repeat(30) }), // owned by gold feature -> relevant
    docEntry('memory/features/feature-z.md', { text: 'z'.repeat(70) }), // owned only by non-gold feature -> irrelevant
  ];
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a', 'feature_z'],
    mapFeatureRecords: [
      { id: 'feature_a', docs: ['memory/features/feature-a.md'] },
      { id: 'feature_z', docs: ['memory/features/feature-z.md'] },
    ],
    registryFeatures: { feature_a: { code: {} }, feature_z: { code: {} } },
    docEntries: entries,
    goldDocPath: 'memory/features/feature-a.md',
    retiredLookup: () => null,
  });
  assert.equal(result.total_feature_doc_chars, 100);
  assert.equal(result.irrelevant_chars, 70);
});

test('scoreTask: a doc shared by a gold AND a non-gold feature counts as relevant (any owner in the gold set is enough)', () => {
  const task = baseTask({ gold_feature: 'feature_a' });
  const entries = [docEntry('memory/features/shared.md', { text: 'shared'.repeat(10) })];
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a', 'feature_z'],
    mapFeatureRecords: [
      { id: 'feature_a', docs: ['memory/features/shared.md'] },
      { id: 'feature_z', docs: ['memory/features/shared.md'] },
    ],
    registryFeatures: { feature_a: { code: {} }, feature_z: { code: {} } },
    docEntries: entries,
    goldDocPath: 'memory/features/shared.md',
    retiredLookup: () => null,
  });
  assert.equal(result.irrelevant_chars, 0);
});

test('scoreTask: stale_doc_count and historical_analogue_hit read from the pack\'s included docs only', () => {
  const task = baseTask();
  const entries = [
    docEntry('AGENTS.md'),
    docEntry('docs/archive/old.md'),
    docEntry('memory/incidents/foo/INC-x.md'),
    docEntry('memory/features/missing.md', { included: false }), // a "Missing Doc" entry — not counted as included
  ];
  const result = scoreTask(task, {
    predictedFeatures: [],
    mapFeatureRecords: [],
    registryFeatures: {},
    docEntries: entries,
    goldDocPath: null,
    retiredLookup: (p) => (p === 'docs/archive/old.md' ? 'ARCHIVED' : null),
  });
  assert.equal(result.stale_doc_count, 1);
  assert.equal(result.included_doc_count, 3);
  assert.equal(result.historical_analogue_hit, true);
});

test('aggregateScores: means ignore null gold_file_recall samples rather than treating them as zero', () => {
  const perTask = [
    { feature_recall_hit: true, wrong_features: [], gold_file_recall: 1, irrelevant_chars: 0, total_feature_doc_chars: 10, included_doc_count: 2, stale_doc_count: 0, historical_analogue_hit: false, recall_at_k_full: { 5: true, 10: true }, recall_at_k_feature_docs_only: { 5: true, 10: true } },
    { feature_recall_hit: false, wrong_features: ['x'], gold_file_recall: null, irrelevant_chars: 5, total_feature_doc_chars: 10, included_doc_count: 3, stale_doc_count: 1, historical_analogue_hit: false, recall_at_k_full: { 5: false, 10: false }, recall_at_k_feature_docs_only: { 5: null, 10: null } },
  ];
  const agg = aggregateScores(perTask);
  assert.equal(agg.task_count, 2);
  assert.equal(agg.feature_recall, 0.5);
  assert.equal(agg.wrong_feature_rate, 0.5);
  assert.equal(agg.gold_file_recall, 1); // averaged over the 1 non-null sample only
  assert.equal(agg.gold_file_recall_sample_size, 1);
  assert.equal(agg.irrelevant_token_rate, 5 / 20);
  assert.equal(agg.stale_context_rate, 1 / 5);
  assert.equal(agg.recall_at_5_feature_docs_only, 1); // the null sample is excluded, not counted as a miss
});

// K.5's bench-regression floor test: a frozen, known-good fixture must keep
// scoring at or above a fixed floor. This is intentionally NOT run against
// live retrieval (that is what `npm run knowledge:bench` does, and its
// score is directional per K.7, not gated) — it is a regression guard on
// the SCORER's own arithmetic against data that will never change.
test('bench-regression floor: a fixed known-good fixture scores at or above its frozen floor', () => {
  const task = baseTask({ gold_feature: 'feature_a', gold_feature_secondary: [], gold_files: ['src/a-helper.ts'] });
  const result = scoreTask(task, {
    predictedFeatures: ['feature_a'],
    mapFeatureRecords: [{ id: 'feature_a', docs: ['memory/features/feature-a.md'] }],
    registryFeatures: { feature_a: { code: { actions: ['src/a*.ts'] } } },
    docEntries: [docEntry('AGENTS.md'), docEntry('CLAUDE.md'), docEntry('memory/registry.yml'), docEntry('memory/features/feature-a.md')],
    goldDocPath: 'memory/features/feature-a.md',
    retiredLookup: () => null,
  });
  assert.equal(result.feature_recall_hit, true);
  assert.equal(result.wrong_features.length, 0);
  assert.equal(result.gold_file_recall, 1);
  assert.equal(result.recall_at_k_feature_docs_only[5], true);
});
