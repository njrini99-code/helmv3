import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Regression guard for the Wave W1.5 arbitrary-font-size sweep of the
 * product component tree (agent W1.5-components).
 *
 * W0 added a canonical 9-step type scale to tailwind.config.ts
 * (display / h1 / h2 / h3 / body-lg / body / body-sm / caption / eyebrow,
 * mirroring --text-* in src/styles/tokens.css). W1.5 then swept consumer
 * code under src/components onto those utilities, mapping every arbitrary
 * `text-[Npx]` override to the nearest canonical step:
 *
 *   10/11 -> eyebrow   12 -> caption   13/14 -> body-sm   15/16 -> body
 *   17 -> body-lg      18/19/20 -> h3   22/24/26 -> h2     28/30/32 -> h1
 *   36/40/44/48 -> display
 *
 *   Outliers below/above the scale snap to the nearest step:
 *     7/8/9 -> eyebrow (scale floor), 34 -> h1, 42/52 -> display.
 *
 * This test scans the owned component subtree and fails if ANY arbitrary
 * `text-[<digits>px]` font-size class reappears, so the sweep cannot
 * silently regress.
 *
 * EXCLUDED subtrees (reserved for other agents / the chart-palette sweep):
 *   - src/components/ui                          (design-system primitives)
 *   - src/components/mockups                     (static design mockups)
 *   - src/components/golf/coachhelm/v3/Genome    (chart sweep)
 *   - src/components/golf/coachhelm/analytics    (chart sweep)
 *   - src/components/golf/stats                  (chart sweep)
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md §5
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

// The whole product component tree is in scope for this wave.
const SCAN_DIRS = [join(REPO_ROOT, 'src', 'components')];

// Reserved subtrees (absolute paths) that this wave must NOT touch —
// excluded from the scan so their primitives / chart-palette sizing
// survive until the agent / wave that owns them handles them.
const EXCLUDED_DIRS = [
  join(REPO_ROOT, 'src', 'components', 'ui'),
  join(REPO_ROOT, 'src', 'components', 'mockups'),
  join(REPO_ROOT, 'src', 'components', 'golf', 'coachhelm', 'v3', 'Genome'),
  join(REPO_ROOT, 'src', 'components', 'golf', 'coachhelm', 'analytics'),
  join(REPO_ROOT, 'src', 'components', 'golf', 'stats'),
];

// Only TypeScript / TSX product files are in scope for this wave.
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// The single banned pattern: an arbitrary Tailwind font-size override.
// Matches `text-[12px]` and prefixed variants (`md:text-[12px]`) alike —
// the per-line scan reports the bare `text-[Npx]` token in every case.
const BANNED_FONT_SIZE = /text-\[[0-9]+px\]/g;

/**
 * Allowlist for genuinely-intentional arbitrary font sizes that cannot use
 * a canonical token. There are NONE in the owned tree after the W1.5 sweep
 * — the swept code maps every arbitrary px to a canonical scale step.
 *
 * If a future case genuinely needs a raw px (e.g. a value driven by brand
 * data that has no token equivalent), add a
 *   `{ file: '<repo-relative-path>', match: 'text-[Npx]' }`
 * entry here WITH a comment explaining why. The test still FAILS on any
 * non-allowlisted reintroduction.
 */
const ALLOWLIST = [
  // (intentionally empty — owned tree is fully tokenized)
];

function isAllowlisted(relPath, match) {
  return ALLOWLIST.some(
    (entry) => entry.file === relPath && entry.match === match,
  );
}

function isExcluded(fullPath) {
  return EXCLUDED_DIRS.some(
    (dir) => fullPath === dir || fullPath.startsWith(dir + sep),
  );
}

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
    if (isExcluded(full)) continue;
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
    BANNED_FONT_SIZE.lastIndex = 0;
    let match;
    while ((match = BANNED_FONT_SIZE.exec(line)) !== null) {
      hits.push({
        line: i + 1,
        column: match.index + 1,
        match: match[0],
        snippet: line.trim(),
      });
      // Guard against zero-length matches (none here, but be safe).
      if (match.index === BANNED_FONT_SIZE.lastIndex) BANNED_FONT_SIZE.lastIndex++;
    }
  }
  return hits;
}

test('no arbitrary text-[Npx] font-size classes in product components', async () => {
  // Ensure the scan directory actually exists — otherwise the test would
  // pass trivially on a misconfigured checkout, masking real regressions.
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

  // Sanity check — make sure the walker actually picked up files. If this
  // fires we have a bug in the test, not in the source.
  assert.ok(files.length > 0, 'Expected to scan at least one source file');

  const violations = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const hits = findBannedHits(content);
    const relPath = relative(REPO_ROOT, file);
    for (const hit of hits) {
      if (isAllowlisted(relPath, hit.match)) continue;
      violations.push(
        `${relPath}:${hit.line}:${hit.column} → ${hit.match}` +
          `\n    ${hit.snippet}` +
          `\n    fix: snap to the canonical type scale (text-display / h1 / h2 / h3 / body-lg / body / body-sm / caption / eyebrow).`,
      );
    }
  }

  if (violations.length > 0) {
    const message =
      `Found ${violations.length} arbitrary text-[Npx] font-size class(es) in product components.\n` +
      `These were swept onto the canonical type scale in Wave W1.5 — do not reintroduce them.\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});

test('reserved subtrees are excluded from the scan', () => {
  // Defense-in-depth: the design-system primitives and chart dirs keep
  // their own sizing on purpose. If a refactor ever brings them into scope
  // we get a clean failure here rather than spurious violations above.
  for (const dir of EXCLUDED_DIRS) {
    assert.ok(isExcluded(dir), `Reserved dir should be excluded: ${dir}`);
    assert.ok(
      isExcluded(join(dir, 'SomeFile.tsx')),
      `Files under reserved dir should be excluded: ${dir}`,
    );
  }
  // And a normal owned path must NOT be excluded.
  assert.ok(
    !isExcluded(join(REPO_ROOT, 'src', 'components', 'golf', 'rounds', 'PremiumRoundHeader.tsx')),
    'Owned product files must not be excluded',
  );
});

test('scan directories do not include node_modules or .next', () => {
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
