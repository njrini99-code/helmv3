// Regression test for the Tier-1 states audit (2026-05-28).
//
// Asserts that every Next.js `page.tsx` route in src/app/golf has a
// sibling `loading.tsx` AND `error.tsx`, OR is covered by a sibling
// layout that provides loading/error fallbacks (we treat presence of
// `loading.tsx`/`error.tsx` in a parent route segment as covering
// nested pages — though we still prefer per-page typed fallbacks).
//
// This is the "no blank page during navigation" gate. If you add a new
// page and forget to scaffold a skeleton + error boundary, this test
// will block the PR.
//
// Run via: node --test scripts/__tests__/loading-error-pair-coverage.test.mjs
// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');

// Routes that are intentional exceptions: print views, full-screen
// canvases, intercepting modals, etc. — places where streaming
// fallbacks would visually clash. Keep this list TIGHT and justified.
const ALLOWED_NO_FALLBACK = new Set([
  // No current exceptions — every page must have both states.
]);

function findGolfPages() {
  const out = execFileSync(
    'find',
    ['src/app/golf', '-name', 'page.tsx'],
    { encoding: 'utf8', cwd: repoRoot },
  );
  return out.trim().split('\n').filter(Boolean);
}

function hasFallback(pageDir, kind /* 'loading' | 'error' */) {
  // Climb the route tree looking for a sibling loading.tsx/error.tsx —
  // Next.js bubbles these up across route segments.
  let cur = pageDir;
  const root = resolve(repoRoot, 'src/app');
  // Safety bound to prevent infinite loop
  for (let i = 0; i < 20; i++) {
    if (existsSync(resolve(repoRoot, cur, `${kind}.tsx`))) return true;
    if (resolve(repoRoot, cur) === root) return false;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
  return false;
}

test('every golf page.tsx has a sibling loading.tsx (via own segment or layout)', () => {
  const pages = findGolfPages();
  assert.ok(pages.length > 0, 'expected at least one page.tsx in src/app/golf');

  const missing = [];
  for (const rel of pages) {
    const pageDir = dirname(rel);
    if (ALLOWED_NO_FALLBACK.has(pageDir)) continue;
    if (!hasFallback(pageDir, 'loading')) missing.push(pageDir);
  }

  assert.deepEqual(
    missing,
    [],
    `These pages have no loading.tsx in their segment or any parent — users see blank screen during navigation:\n  - ${missing.join('\n  - ')}`,
  );
});

test('every golf page.tsx has a sibling error.tsx (via own segment or layout)', () => {
  const pages = findGolfPages();
  assert.ok(pages.length > 0, 'expected at least one page.tsx in src/app/golf');

  const missing = [];
  for (const rel of pages) {
    const pageDir = dirname(rel);
    if (ALLOWED_NO_FALLBACK.has(pageDir)) continue;
    if (!hasFallback(pageDir, 'error')) missing.push(pageDir);
  }

  assert.deepEqual(
    missing,
    [],
    `These pages have no error.tsx in their segment or any parent — unhandled errors crash the whole route group:\n  - ${missing.join('\n  - ')}`,
  );
});
