// =============================================================================
// src/app/baseball/actions/__tests__/readiness-matrix-routes.test.ts
//
// GUARD (issue #376): every route cited in the Route(s) column of
// docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md MUST resolve to a
// real page.tsx/route.ts in the App Router — otherwise the matrix is
// documenting a feature against a route that doesn't exist (or no longer
// exists after a rename). This mirrors the route-resolution convention from
// auth-redirects-resolve.test.ts, but reads from the matrix doc instead of
// auth.ts's redirectTo literals.
//
// Fast, local, no GitHub API access — the remote owner-issue check lives in
// scripts/baseball/check-readiness-matrix.ts and the advisory CI workflow
// .github/workflows/baseball-readiness-matrix.yml, not here.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { routeExists, extractBaseballRoutesFromMarkdown } from '../../../../../scripts/baseball/resolve-route';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..'); // → repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');
const MATRIX_FILE = join(
  REPO_ROOT,
  'docs',
  'operations',
  'BASEBALLHELM_FEATURE_READINESS_MATRIX.md',
);

describe('BaseballHelm readiness matrix routes resolve to real pages', () => {
  it('the matrix doc exists', () => {
    expect(existsSync(MATRIX_FILE)).toBe(true);
  });

  const source = readFileSync(MATRIX_FILE, 'utf8');
  const routes = extractBaseballRoutesFromMarkdown(source);

  it('extracts a non-trivial number of routes from the matrix', () => {
    // sanity: guards against a regex that silently matches nothing and lets
    // every route reference slip through unchecked.
    expect(routes.length).toBeGreaterThanOrEqual(20);
    expect(routes).toContain('/baseball/dashboard/roster');
  });

  it.each(routes.map((r) => [r] as const))('matrix route %s resolves to a real page', (href) => {
    expect(routeExists(href, APP_DIR)).toBe(true);
  });

  it('the hidden Notifications alias still resolves (it is a real redirect page)', () => {
    expect(routeExists('/baseball/dashboard/settings/notifications', APP_DIR)).toBe(true);
  });
});
