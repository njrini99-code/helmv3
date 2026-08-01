// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

// Regression guard for the 2026-05-28 `tranwarm` typo sweep.
// A previous botched find-replace ran `s/translate/tranwarm/g` across src/,
// silently killing 203 Tailwind transform utilities (hover-lift, toast
// slide-in, modal centering, etc.) because `tranwarm-*` is not a valid
// utility class.
//
// This test asserts that the literal token `tranwarm` never reappears in
// src/, docs/, scripts/, or tests/. If you legitimately need this string
// (you almost certainly don't), update the allowlist below.

const ROOTS = ['src', 'docs', 'scripts', 'tests'];

// Files we explicitly skip — only this test file legitimately mentions the token.
const SELF_PATH = 'scripts/__tests__/no-tranwarm-typo.test.mjs';

// Skip large/irrelevant subtrees.
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.cache',
  'dist',
  'build',
  '.git',
]);

// Only scan text-like extensions to avoid binary noise.
const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.md',
  '.mdx',
  '.json',
  '.yml',
  '.yaml',
  '.html',
  '.sh',
  '.sql',
]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (TEXT_EXTS.has(ext)) yield full;
    }
  }
}

test('no `tranwarm` typo anywhere in src/, docs/, scripts/, tests/', async () => {
  const matches = [];

  for (const root of ROOTS) {
    const absRoot = join(repoRoot, root);
    try {
      await stat(absRoot);
    } catch {
      continue;
    }
    for await (const file of walk(absRoot)) {
      const rel = relative(repoRoot, file);
      if (rel === SELF_PATH) continue;
      let content;
      try {
        content = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      if (!content.includes('tranwarm')) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('tranwarm')) {
          matches.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
  }

  assert.equal(
    matches.length,
    0,
    `Found ${matches.length} occurrence(s) of "tranwarm" — this is a botched ` +
      `find-replace of "translate". Fix with:\n\n` +
      `  grep -rl "tranwarm" src/ docs/ scripts/ tests/ | xargs sed -i '' 's/tranwarm/translate/g'\n\n` +
      `Matches:\n${matches.slice(0, 20).join('\n')}` +
      (matches.length > 20 ? `\n... and ${matches.length - 20} more` : '')
  );
});
