// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdir, readFile, stat, access } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Regression guard for Wave W2C — Skeleton consolidation (agent "skeleton").
 *
 * W2C folded three redundant skeleton modules into the canonical
 * `src/components/ui/skeleton.tsx`:
 *
 *   - `src/components/ui/skeleton-loader.tsx`
 *   - `src/components/golf/GolfSkeletons.tsx`
 *   - `src/components/baseball/tasks/TaskSkeleton.tsx`
 *
 * The `Skeleton` primitive now exposes a 5-variant semantic API
 * (`line | block | card | list | chart`) while remaining a strict superset of
 * the two historical primitives. Every specialized compound (page-, card-,
 * row-level skeletons) was carried over as a composition with its exact
 * original layout/shape, and every consumer was re-pointed to
 * `@/components/ui/skeleton`.
 *
 * All three legacy files were DELETED. This test re-asserts that contract so
 * the deleted modules cannot silently reappear:
 *
 *   1. None of the three deleted files may exist again.
 *   2. No source file under src/ may import from any of the deleted module
 *      specifiers.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md (A4 — skeleton)
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SCAN_DIRS = [join(REPO_ROOT, 'src')];

// TypeScript / TSX product files are in scope.
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// The deleted modules that must never exist again.
const DELETED_FILES = [
  join(REPO_ROOT, 'src', 'components', 'ui', 'skeleton-loader.tsx'),
  join(REPO_ROOT, 'src', 'components', 'golf', 'GolfSkeletons.tsx'),
  join(REPO_ROOT, 'src', 'components', 'baseball', 'tasks', 'TaskSkeleton.tsx'),
];

// Banned import specifiers. We match on `from '...'` so that prose/comments
// mentioning the old module names (e.g. a migration note) do not trip the
// guard — only an actual import statement is a regression.
const BANNED_PATTERNS = [
  {
    name: "import from '@/components/ui/skeleton-loader'",
    re: /from\s+['"]@\/components\/ui\/skeleton-loader['"]/,
  },
  {
    name: "import from '@/components/golf/GolfSkeletons'",
    re: /from\s+['"]@\/components\/golf\/GolfSkeletons['"]/,
  },
  {
    name: "import from '@/components/baseball/tasks/TaskSkeleton'",
    re: /from\s+['"]@\/components\/baseball\/tasks\/TaskSkeleton['"]/,
  },
  // Relative-import forms of the same modules (defensive).
  {
    name: "relative import of skeleton-loader",
    re: /from\s+['"][^'"]*\/skeleton-loader['"]/,
  },
  {
    name: "relative import of GolfSkeletons",
    re: /from\s+['"][^'"]*\/GolfSkeletons['"]/,
  },
  {
    name: "relative import of tasks/TaskSkeleton",
    re: /from\s+['"][^'"]*\/tasks\/TaskSkeleton['"]/,
  },
];

/**
 * Allowlist for genuinely-intentional reintroductions. There are NONE after
 * the W2C consolidation — the canonical `Skeleton` (+ its compositions)
 * absorbs every legacy primitive and compound. If a future case genuinely
 * needs an exception, add a
 *   `{ file: '<repo-relative-path>', pattern: '<banned name>' }`
 * entry WITH a comment explaining why. The test still FAILS on any
 * non-allowlisted reintroduction.
 */
const ALLOWLIST = [
  // (intentionally empty)
];

function isAllowlisted(relPath, patternName) {
  return ALLOWLIST.some(
    (entry) => entry.file === relPath && entry.pattern === patternName,
  );
}

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
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

test('deleted skeleton modules no longer exist', async () => {
  for (const file of DELETED_FILES) {
    let exists = true;
    try {
      await access(file);
    } catch {
      exists = false;
    }
    assert.equal(
      exists,
      false,
      `Wave W2C deleted ${relative(REPO_ROOT, file)} — it must not be ` +
        `recreated. Use the canonical @/components/ui/skeleton instead.`,
    );
  }
});

/**
 * Raised from vitest's 5s default.
 *
 * This test walks the entire source tree and READS every matching file — a few
 * thousand of them. That is quick on a warm local disk (the whole 408-file
 * shard it lives in finishes in about a minute) and not reliably quick on a
 * shared CI runner: it timed out at 5,000ms on run 33037507786 while all 407
 * other files in the same shard passed, on a commit that touched nothing it
 * scans for.
 *
 * The assertion is unchanged and the work is no faster — only the budget is
 * now honest about what the test actually does. A time limit a CORRECT run can
 * exceed does not test anything; it fails at random and teaches people to
 * re-run red checks, which is how a real failure eventually gets waved through.
 */
const TREE_WALK_TIMEOUT_MS = 60_000;

test('no imports of the deleted skeleton modules remain in src', { timeout: TREE_WALK_TIMEOUT_MS }, async () => {
  for (const dir of SCAN_DIRS) {
    const info = await stat(dir).catch(() => null);
    assert.ok(info && info.isDirectory(), `Expected scan directory to exist: ${dir}`);
  }

  const files = [];
  for (const dir of SCAN_DIRS) {
    await walk(dir, files);
  }
  assert.ok(files.length > 0, 'Expected to scan at least one source file');

  const violations = [];
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    // Strip block + line comments so a migration note or doc-comment example
    // that merely names the old module does not trip the guard — only a
    // real import statement is a regression.
    const content = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const relPath = relative(REPO_ROOT, file);
    for (const { name, re } of BANNED_PATTERNS) {
      if (re.test(content) && !isAllowlisted(relPath, name)) {
        violations.push(`${relPath} → ${name}`);
      }
    }
  }

  if (violations.length > 0) {
    const message =
      `Found ${violations.length} banned legacy-skeleton import(s).\n` +
      `skeleton-loader.tsx / GolfSkeletons.tsx / TaskSkeleton.tsx were ` +
      `consolidated into the canonical @/components/ui/skeleton in Wave W2C — ` +
      `do not reintroduce them.\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});
