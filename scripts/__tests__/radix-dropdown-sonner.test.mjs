import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat, access } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Regression guard for Wave W2F — DropdownMenu + Toast consolidation
 * (agent "dropdown").
 *
 * W2F finished folding two hand-rolled primitives into their canonical,
 * accessible replacements:
 *
 *   - hand-rolled <Dropdown> / <DropdownItem> / <DropdownSeparator> /
 *     <DropdownLabel> (src/components/ui/dropdown.tsx)
 *       -> Radix <DropdownMenu> (src/components/ui/dropdown-menu.tsx)
 *   - hand-rolled <ToastNotification> / <ToastContainer>
 *     (src/components/ui/toast-notification.tsx)
 *       -> Sonner (src/components/ui/sonner.tsx, Toaster in
 *          src/app/layout.tsx)
 *
 * Both hand-rolled files were DELETED. Every consumer had already been
 * migrated to the canonical primitives in prior waves (the deleted files
 * carried zero imports). Radix gives us keyboard nav, focus management
 * and ARIA correctness for free; Sonner gives us an accessible toast
 * region. This test re-asserts the contract so the deleted primitives
 * cannot silently reappear:
 *
 *   1. src/components/ui/dropdown.tsx must NOT exist.
 *   2. src/components/ui/toast-notification.tsx must NOT exist.
 *   3. No source file under src/ may import from '@/components/ui/dropdown'
 *      (the hand-rolled module — NOT '@/components/ui/dropdown-menu', which
 *      is the canonical Radix wrapper and stays) or from
 *      '@/components/ui/toast-notification'.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md (A4 + A7)
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SCAN_DIRS = [join(REPO_ROOT, 'src')];

// TypeScript / TSX product files are in scope.
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// The deleted primitives that must never exist again.
const DELETED_FILES = [
  join(REPO_ROOT, 'src', 'components', 'ui', 'dropdown.tsx'),
  join(REPO_ROOT, 'src', 'components', 'ui', 'toast-notification.tsx'),
];

// Banned import patterns. We match on `from '...'` import sources so that
// prose/comments mentioning the old modules (e.g. a migration note) do not
// trip the guard — only an actual import statement is a regression.
//
// NB: the dropdown pattern is anchored so it matches ONLY the hand-rolled
// '@/components/ui/dropdown' module and NOT the canonical Radix wrapper
// '@/components/ui/dropdown-menu' (note the closing quote after `dropdown`).
const BANNED_PATTERNS = [
  {
    name: "import from '@/components/ui/dropdown' (hand-rolled)",
    // from '@/components/ui/dropdown'  (with closing quote — excludes -menu)
    re: /from\s+['"]@\/components\/ui\/dropdown['"]/,
  },
  {
    name: "import from '@/components/ui/toast-notification' (legacy)",
    re: /from\s+['"]@\/components\/ui\/toast-notification['"]/,
  },
];

/**
 * Allowlist for genuinely-intentional reintroductions. There are NONE after
 * the W2F consolidation — Radix DropdownMenu + Sonner are the canonical
 * accessible primitives. If a future case genuinely needs an exception, add
 * a
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

test('src/components/ui/dropdown.tsx and toast-notification.tsx no longer exist', async () => {
  for (const deleted of DELETED_FILES) {
    let exists = true;
    try {
      await access(deleted);
    } catch {
      exists = false;
    }
    assert.equal(
      exists,
      false,
      `Wave W2F deleted ${relative(REPO_ROOT, deleted)} — it must not be ` +
        `recreated. Use the Radix <DropdownMenu> (src/components/ui/dropdown-menu.tsx) ` +
        `or Sonner (src/components/ui/sonner.tsx) instead.`,
    );
  }
});

test('no imports of the hand-rolled dropdown / toast-notification modules remain in src', async () => {
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
    // that merely names the old module does not trip the guard — only a real
    // `from '...'` import source is a regression.
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
      `Found ${violations.length} banned hand-rolled-primitive import(s).\n` +
      `The hand-rolled <Dropdown> and <ToastNotification> were consolidated ` +
      `into Radix <DropdownMenu> + Sonner in Wave W2F — do not reintroduce ` +
      `them.\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});
