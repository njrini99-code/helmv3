import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat, access } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Regression guard for Wave W2B — Card consolidation (agent W2B).
 *
 * W2B folded two redundant card primitives into the canonical
 * `src/components/ui/card.tsx`:
 *
 *   - `GlassCard` / `GlassStatCard` (src/components/ui/glass-card.tsx)
 *       -> `<Card variant="overlay">` / `<StatCard>`
 *   - `PremiumGlassCard` (src/components/golf/dashboard/premium-components.tsx)
 *       -> `<Card variant="raised">`
 *
 * `glass-card.tsx` was DELETED and every consumer migrated. This test
 * re-asserts that contract so the deleted primitives cannot silently
 * reappear:
 *
 *   1. src/components/ui/glass-card.tsx must NOT exist.
 *   2. No source file under src/ may import `GlassCard`, `GlassStatCard`,
 *      `PremiumGlassCard`, or anything from '@/components/ui/glass-card'.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md (A4 #1 + A2)
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SCAN_DIRS = [join(REPO_ROOT, 'src')];

// TypeScript / TSX product files are in scope.
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// The deleted primitive that must never exist again.
const DELETED_FILE = join(REPO_ROOT, 'src', 'components', 'ui', 'glass-card.tsx');

// Banned import patterns. We match on `import { ... }` statements so that
// prose/comments mentioning the old names (e.g. a migration note) do not
// trip the guard — only an actual re-import is a regression.
const BANNED_PATTERNS = [
  {
    name: "import from '@/components/ui/glass-card'",
    // import ... from '@/components/ui/glass-card'
    re: /from\s+['"]@\/components\/ui\/glass-card['"]/,
  },
  {
    name: 'import of GlassCard',
    // import { ... GlassCard ... } from ...   (word-boundaried so it does
    // not match GlassCardSkeleton or PremiumGlassCard)
    re: /import\s*(?:type\s*)?\{[^}]*\bGlassCard\b[^}]*\}/s,
  },
  {
    name: 'import of GlassStatCard',
    re: /import\s*(?:type\s*)?\{[^}]*\bGlassStatCard\b[^}]*\}/s,
  },
  {
    name: 'import of PremiumGlassCard',
    re: /import\s*(?:type\s*)?\{[^}]*\bPremiumGlassCard\b[^}]*\}/s,
  },
];

/**
 * Allowlist for genuinely-intentional reintroductions. There are NONE after
 * the W2B consolidation — the canonical Card absorbs every surface. If a
 * future case genuinely needs an exception, add a
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

test('src/components/ui/glass-card.tsx no longer exists', async () => {
  let exists = true;
  try {
    await access(DELETED_FILE);
  } catch {
    exists = false;
  }
  assert.equal(
    exists,
    false,
    `Wave W2B deleted ${relative(REPO_ROOT, DELETED_FILE)} — it must not be ` +
      `recreated. Use <Card variant="overlay"> / <StatCard> instead.`,
  );
});

test('no imports of GlassCard / GlassStatCard / PremiumGlassCard remain in src', async () => {
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
    // that merely names the old primitive does not trip the guard — only a
    // real `import { ... }` statement is a regression.
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
      `Found ${violations.length} banned card-primitive import(s).\n` +
      `GlassCard/GlassStatCard/PremiumGlassCard were consolidated into the ` +
      `canonical <Card> in Wave W2B — do not reintroduce them.\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});
