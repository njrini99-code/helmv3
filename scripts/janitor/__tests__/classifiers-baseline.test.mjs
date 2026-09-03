import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as duplicateHelpers from '../classifiers/duplicate-helpers.mjs';
import * as staleDocs from '../classifiers/stale-docs.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'janitor-baseline-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- duplicate-helpers.mjs ---

test('duplicate-helpers: NO_SIGNAL when the baseline file is missing', () => {
  withTmpDir((repoRoot) => {
    const result = duplicateHelpers.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});

test('duplicate-helpers: ZERO_FINDINGS_VERIFIED when baseline total is 0', () => {
  withTmpDir((repoRoot) => {
    writeFileSync(join(repoRoot, '.duplicate-exports-baseline.json'), JSON.stringify({ total: 0, entries: [] }));
    const result = duplicateHelpers.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('duplicate-helpers: FINDINGS when baseline has entries, capped and parsed', () => {
  withTmpDir((repoRoot) => {
    writeFileSync(
      join(repoRoot, '.duplicate-exports-baseline.json'),
      JSON.stringify({
        total: 1,
        entries: ['Thing :: src/app/a.tsx + src/app/b.tsx'],
      }),
    );
    const result = duplicateHelpers.run({ repoRoot });
    assert.equal(result.verdict, FINDINGS);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].summary, /"Thing"/);
    assert.match(result.findings[0].proposedPr, /Thing/);
  });
});

test('duplicate-helpers: NO_SIGNAL when the baseline JSON is malformed', () => {
  withTmpDir((repoRoot) => {
    writeFileSync(join(repoRoot, '.duplicate-exports-baseline.json'), '{not json');
    const result = duplicateHelpers.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});

// --- stale-docs.mjs ---

test('stale-docs: ZERO_FINDINGS_VERIFIED when baseline total is 0', () => {
  withTmpDir((repoRoot) => {
    writeFileSync(join(repoRoot, '.doc-path-baseline.json'), JSON.stringify({ total: 0, entries: [] }));
    const result = staleDocs.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('stale-docs: FINDINGS when baseline has entries', () => {
  withTmpDir((repoRoot) => {
    writeFileSync(
      join(repoRoot, '.doc-path-baseline.json'),
      JSON.stringify({ total: 2, entries: ['docs/dead-one.md', 'docs/dead-two.md'] }),
    );
    const result = staleDocs.run({ repoRoot });
    assert.equal(result.verdict, FINDINGS);
    assert.equal(result.findings.length, 2);
  });
});

test('stale-docs: NO_SIGNAL when the baseline file is missing', () => {
  withTmpDir((repoRoot) => {
    const result = staleDocs.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});
