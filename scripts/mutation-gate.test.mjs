// node:test suite for scripts/mutation-gate.mjs.
//
// Runs standalone, no vitest/CI wiring dependency:
//   node --test scripts/mutation-gate.test.mjs
// (also wired as `npm run test:mutation-gate` and as a CircleCI step in the
// stryker-coachhelm job, run BEFORE the real Stryker invocation — a broken
// gate should fail fast with a clear message rather than mid-run.)
//
// Fixtures are written to a temp dir per test (never the repo's own
// config/mutation-gate.json or reports/mutation/mutation.json) so this suite
// cannot depend on — or corrupt — real repo state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeMutationScore, runGate, PASS, FAIL, UNKNOWN } from './mutation-gate.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-gate-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mutantsReport(statuses) {
  return {
    schemaVersion: '1.0',
    files: {
      'src/lib/coachhelm/v2/example.ts': {
        language: 'typescript',
        mutants: statuses.map((status, i) => ({ id: String(i), status, mutatorName: 'Fake' })),
      },
    },
  };
}

// --- computeMutationScore: pure function, no filesystem ---

test('computeMutationScore: all killed scores 100', () => {
  const result = computeMutationScore(mutantsReport(['Killed', 'Killed', 'Timeout']));
  assert.equal(result.score, 100);
  assert.equal(result.totalValid, 3);
  assert.equal(result.totalMutants, 3);
});

test('computeMutationScore: mixed statuses computes the documented formula', () => {
  // Killed=2, Timeout=1, Survived=1, NoCoverage=2 -> valid=6, killed=3 -> 50%
  const result = computeMutationScore(
    mutantsReport(['Killed', 'Killed', 'Timeout', 'Survived', 'NoCoverage', 'NoCoverage']),
  );
  assert.equal(result.score, 50);
  assert.equal(result.totalValid, 6);
});

test('computeMutationScore: Ignored/CompileError/RuntimeError excluded from denominator', () => {
  const result = computeMutationScore(
    mutantsReport(['Killed', 'Ignored', 'CompileError', 'RuntimeError']),
  );
  // Only "Killed" is valid+killed; totalValid = 1 (Killed only, the others are excluded)
  assert.equal(result.totalValid, 1);
  assert.equal(result.score, 100);
});

test('computeMutationScore: zero valid mutants returns null score, not zero', () => {
  const result = computeMutationScore(mutantsReport(['Ignored', 'CompileError']));
  assert.equal(result.score, null);
  assert.equal(result.totalValid, 0);
});

test('computeMutationScore: throws on a non-Stryker shape', () => {
  assert.throws(() => computeMutationScore({ notAReport: true }), /missing "files"/);
  assert.throws(() => computeMutationScore(null), /missing "files"/);
});

// --- runGate: file I/O + verdict wiring ---

test('runGate: PASS when score >= floor', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'mutation.json');
    const configPath = join(dir, 'mutation-gate.json');
    writeFileSync(reportPath, JSON.stringify(mutantsReport(['Killed', 'Killed', 'Killed', 'Survived'])));
    writeFileSync(configPath, JSON.stringify({ floor: 50 }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.verdict, PASS);
    assert.equal(result.score, 75);
  });
});

test('runGate: FAIL when score < floor (the regression case)', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'mutation.json');
    const configPath = join(dir, 'mutation-gate.json');
    // 1 killed out of 4 valid = 25%, floor 40 -> FAIL
    writeFileSync(
      reportPath,
      JSON.stringify(mutantsReport(['Killed', 'Survived', 'Survived', 'NoCoverage'])),
    );
    writeFileSync(configPath, JSON.stringify({ floor: 40 }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.verdict, FAIL);
    assert.equal(result.score, 25);
  });
});

test('runGate: UNKNOWN when the report file is missing (Stryker crash / never ran)', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'does-not-exist.json');
    const configPath = join(dir, 'mutation-gate.json');
    writeFileSync(configPath, JSON.stringify({ floor: 40 }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.verdict, UNKNOWN);
    assert.match(result.message, /not found/);
  });
});

test('runGate: UNKNOWN when the report is not valid JSON', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'mutation.json');
    const configPath = join(dir, 'mutation-gate.json');
    writeFileSync(reportPath, '{not json');
    writeFileSync(configPath, JSON.stringify({ floor: 40 }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.verdict, UNKNOWN);
  });
});

test('runGate: UNKNOWN when the config is missing a numeric floor', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'mutation.json');
    const configPath = join(dir, 'mutation-gate.json');
    writeFileSync(reportPath, JSON.stringify(mutantsReport(['Killed'])));
    writeFileSync(configPath, JSON.stringify({ scope: 'no floor here' }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.verdict, UNKNOWN);
  });
});

test('runGate: UNKNOWN (never a silent pass) when zero valid mutants — e.g. an empty `mutate` glob', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'mutation.json');
    const configPath = join(dir, 'mutation-gate.json');
    writeFileSync(reportPath, JSON.stringify({ schemaVersion: '1.0', files: {} }));
    writeFileSync(configPath, JSON.stringify({ floor: 40 }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.verdict, UNKNOWN);
  });
});

test('runGate: score exactly at the floor is a PASS (>=, not >)', () => {
  withTmpDir((dir) => {
    const reportPath = join(dir, 'mutation.json');
    const configPath = join(dir, 'mutation-gate.json');
    writeFileSync(reportPath, JSON.stringify(mutantsReport(['Killed', 'Killed', 'Survived', 'Survived'])));
    writeFileSync(configPath, JSON.stringify({ floor: 50 }));

    const result = runGate({ reportPath, configPath });
    assert.equal(result.score, 50);
    assert.equal(result.verdict, PASS);
  });
});

// --- The real committed config file: sanity-check its own shape ---

test('the committed config/mutation-gate.json has a numeric floor between 0 and 100', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('../config/mutation-gate.json', import.meta.url));
  const config = JSON.parse(readFileSync(path, 'utf-8'));
  assert.equal(typeof config.floor, 'number');
  assert.ok(config.floor > 0 && config.floor < 100, `floor ${config.floor} should be a real percentage`);
});
