import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Regression guard for the Wave W1 design-token sweep of product
 * components (hex / radius / z-index).
 *
 * W0 unified the design tokens (src/styles/tokens.css) and added ESLint
 * guardrails; W1 then swept consumer code in the product component tree
 * onto those tokens:
 *   - raw helm-green hex #16A34A / #16a34a → primary-600 utilities, or
 *     var(--color-primary-600) in inline style / SVG fill/stroke
 *   - raw red #DC2626 → destructive token / var(--color-destructive)
 *   - arbitrary radius rounded-[Npx] → canonical scale (sm/md/lg/xl/2xl/3xl)
 *   - arbitrary z-index z-[N] → tier classes (z-base … z-tooltip)
 *
 * This test scans the four owned component trees and fails if ANY of the
 * banned patterns reappears, so the sweep cannot silently regress.
 *
 * EXCLUDED subtrees (reserved for the Wave 4/5 palette-aware chart sweep):
 *   - src/components/golf/coachhelm/v3/Genome  (Wave 4A)
 *   - src/components/golf/coachhelm/analytics   (Wave 5B)
 *   - src/components/golf/stats                 (Wave 5B)
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md §5
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SCAN_DIRS = [
  join(REPO_ROOT, 'src', 'components', 'golf'),
  join(REPO_ROOT, 'src', 'components', 'baseball'),
  join(REPO_ROOT, 'src', 'components', 'landing'),
  join(REPO_ROOT, 'src', 'components', 'messages'),
];

// Reserved subtrees (absolute paths) that this wave must NOT touch —
// excluded from the scan so their chart-palette hex survives until the
// Wave 4/5 sweep handles them.
const EXCLUDED_DIRS = [
  join(REPO_ROOT, 'src', 'components', 'golf', 'coachhelm', 'v3', 'Genome'),
  join(REPO_ROOT, 'src', 'components', 'golf', 'coachhelm', 'analytics'),
  join(REPO_ROOT, 'src', 'components', 'golf', 'stats'),
];

// Only TypeScript / TSX product files are in scope for this wave.
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// Banned patterns. Each entry: { name, re (per-line, global), fix }.
const BANNED_PATTERNS = [
  {
    name: 'raw helm-green hex #16A34A',
    re: /#16A34A\b/g,
    fix: 'use primary-600 utilities, or var(--color-primary-600) in inline style / SVG.',
  },
  {
    name: 'raw helm-green hex #16a34a',
    re: /#16a34a\b/g,
    fix: 'use primary-600 utilities, or var(--color-primary-600) in inline style / SVG.',
  },
  {
    name: 'raw red hex #DC2626',
    re: /#DC2626\b/gi,
    fix: 'use destructive token, or var(--color-destructive) in inline style / SVG.',
  },
  {
    name: 'arbitrary radius rounded-[Npx]',
    re: /rounded-\[[0-9.]+px\]/g,
    fix: 'snap to the canonical radius scale (rounded-sm/md/lg/xl/2xl/3xl).',
  },
  {
    name: 'arbitrary z-index z-[N]',
    re: /z-\[[0-9]+\]/g,
    fix: 'snap to a z-index tier class (z-base/raised/overlay/modal/toast/toolbar/tooltip).',
  },
];

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
    for (const pattern of BANNED_PATTERNS) {
      pattern.re.lastIndex = 0;
      let match;
      while ((match = pattern.re.exec(line)) !== null) {
        hits.push({
          line: i + 1,
          column: match.index + 1,
          name: pattern.name,
          match: match[0],
          fix: pattern.fix,
          snippet: line.trim(),
        });
        // Guard against zero-length matches (none here, but be safe).
        if (match.index === pattern.re.lastIndex) pattern.re.lastIndex++;
      }
    }
  }
  return hits;
}

test('no banned hex / radius / z-index patterns in product components', async () => {
  // Ensure the scan directories actually exist — otherwise the test would
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
    for (const hit of hits) {
      violations.push(
        `${relative(REPO_ROOT, file)}:${hit.line}:${hit.column} → ${hit.match} (${hit.name})` +
          `\n    ${hit.snippet}` +
          `\n    fix: ${hit.fix}`,
      );
    }
  }

  if (violations.length > 0) {
    const message =
      `Found ${violations.length} banned design-token pattern(s) in product components.\n` +
      `These were swept onto canonical tokens in Wave W1 — do not reintroduce them.\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});

test('reserved chart subtrees are excluded from the scan', () => {
  // Defense-in-depth: the Wave 4/5 chart dirs keep raw palette hex on
  // purpose. If a refactor ever brings them into scope we get a clean
  // failure here rather than spurious violations above.
  for (const dir of EXCLUDED_DIRS) {
    assert.ok(
      isExcluded(dir),
      `Reserved dir should be excluded: ${dir}`,
    );
    assert.ok(
      isExcluded(join(dir, 'SomeChart.tsx')),
      `Files under reserved dir should be excluded: ${dir}`,
    );
  }
  // And a normal owned path must NOT be excluded.
  assert.ok(
    !isExcluded(join(REPO_ROOT, 'src', 'components', 'golf', 'rounds', 'Sparkline.tsx')),
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
