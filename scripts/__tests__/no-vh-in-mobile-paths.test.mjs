import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Regression guard for iOS Safari + Capacitor mobile viewport bug.
 *
 * Background: `100vh` on iOS Safari excludes the URL bar, which causes
 * full-height layouts to be cut off (bottom toolbar overlaps content).
 * Tailwind's `min-h-screen` / `h-screen` map to `100vh`, so they have
 * the same problem. The fix is to use `100dvh` / `min-h-dvh` / `h-dvh`,
 * the dynamic-viewport unit that accounts for browser chrome.
 *
 * This test scans mobile-facing source paths (`src/app/golf` and
 * `src/components/golf`) and fails if any banned token reappears.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ui-mobile-audit.md
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SCAN_DIRS = [
  join(REPO_ROOT, 'src', 'app', 'golf'),
  join(REPO_ROOT, 'src', 'components', 'golf'),
];

// File extensions to inspect. Strings + className-bearing files only.
const FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
]);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// Banned literal substrings — these MUST NOT appear in mobile paths.
// Order matters: more specific tokens first so that the error message
// points at the right thing.
const BANNED_TOKENS = ['100vh', 'min-h-screen', 'h-screen'];

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    // Directory may not exist in some checkouts (e.g. partial worktrees).
    if (err.code === 'ENOENT') return files;
    throw err;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (FILE_EXTENSIONS.has(ext)) files.push(full);
    }
  }
  return files;
}

function findBannedHits(content) {
  const hits = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const token of BANNED_TOKENS) {
      let idx = line.indexOf(token);
      while (idx !== -1) {
        hits.push({ line: i + 1, column: idx + 1, token, snippet: line.trim() });
        idx = line.indexOf(token, idx + token.length);
      }
    }
  }
  return hits;
}

test('no 100vh / min-h-screen / h-screen in src/app/golf or src/components/golf', async () => {
  // Ensure the scan directories actually exist — otherwise the test would
  // pass trivially on a misconfigured checkout, which would mask real
  // regressions.
  for (const dir of SCAN_DIRS) {
    const info = await stat(dir).catch(() => null);
    assert.ok(
      info && info.isDirectory(),
      `Expected scan directory to exist: ${dir}`,
    );
  }

  const files = [];
  for (const dir of SCAN_DIRS) {
    await walk(dir, files);
  }

  // Sanity check — make sure the walker actually picked up files. If
  // this fires we have a bug in the test, not in the source.
  assert.ok(files.length > 0, 'Expected to scan at least one source file');

  const violations = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const hits = findBannedHits(content);
    if (hits.length === 0) continue;
    for (const hit of hits) {
      violations.push(
        `${relative(REPO_ROOT, file)}:${hit.line}:${hit.column} → ${hit.token}` +
          `\n    ${hit.snippet}`,
      );
    }
  }

  if (violations.length > 0) {
    const message =
      `Found ${violations.length} banned viewport-unit usage(s) in mobile paths.\n` +
      `Replace 100vh → 100dvh, min-h-screen → min-h-dvh, h-screen → h-dvh.\n` +
      `iOS Safari + Capacitor break with 100vh (it excludes the URL bar).\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});

test('scan directories do not include node_modules or .next', () => {
  // Defense-in-depth: if a future change makes us scan vendored files,
  // we get a clean error rather than a thousand false positives.
  for (const dir of SCAN_DIRS) {
    const parts = relative(REPO_ROOT, dir).split(sep);
    for (const part of parts) {
      assert.ok(
        !SKIP_DIRS.has(part),
        `Scan directory must not be inside skip set: ${dir}`,
      );
    }
  }
});
