// =============================================================================
// src/app/baseball/actions/__tests__/auth-redirects-resolve.test.ts
//
// GUARD (defect #2 regression test): every post-login / post-signup landing
// path that auth.ts hands back as `redirectTo` MUST resolve to a real route in
// the App Router. A scoped staff member was previously dropped onto
// /baseball/dashboard/staff — a segment with only an error.tsx and NO page.tsx,
// which renders a 404 in Next.js. This test statically extracts every
// redirectTo string literal from auth.ts and asserts each one maps to an
// existing page.tsx / route.ts (accounting for route groups like (dashboard),
// (onboarding), (auth)) — so a future dead redirect fails CI instead of users.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..'); // → repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');
const AUTH_FILE = join(REPO_ROOT, 'src', 'app', 'baseball', 'actions', 'auth.ts');

/**
 * Resolve an in-product href (e.g. "/baseball/dashboard/performance?focus=x")
 * to a route file on disk. Route groups — parenthesized dirs like "(dashboard)"
 * — do NOT appear in the URL, so we walk the tree allowing each URL segment to
 * be nested under any number of route-group dirs. Returns true if a page.tsx,
 * route.ts(x), or default.tsx exists for the path.
 */
function routeExists(href: string): boolean {
  // Strip query/hash; normalize.
  const path = href.split('?')[0]!.split('#')[0]!;
  const segments = path.split('/').filter(Boolean);

  // Candidate directories that satisfy the path so far (route groups allowed).
  let dirs: string[] = [APP_DIR];

  for (const seg of segments) {
    const next: string[] = [];
    for (const dir of dirs) {
      // direct child
      const direct = join(dir, seg);
      if (existsSync(direct) && statSync(direct).isDirectory()) next.push(direct);
      // child nested under one or more route groups: (group)/seg, (a)/(b)/seg, ...
      collectThroughGroups(dir, seg, next);
    }
    if (next.length === 0) return false;
    dirs = next;
  }

  // A landing route is renderable if any candidate dir has a page/route/default,
  // OR is itself reachable through a trailing route group that has one.
  return dirs.some((d) => dirHasRenderable(d));
}

/** Push dir/(group...)/seg matches into `out`. */
function collectThroughGroups(dir: string, seg: string, out: string[]): void {
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return;
  }
  for (const child of children) {
    if (child.startsWith('(') && child.endsWith(')')) {
      const groupDir = join(dir, child);
      if (!statSync(groupDir).isDirectory()) continue;
      const target = join(groupDir, seg);
      if (existsSync(target) && statSync(target).isDirectory()) out.push(target);
      // recurse through stacked groups
      collectThroughGroups(groupDir, seg, out);
    }
  }
}

/** True if dir (or a trailing route group within it) has a renderable entry. */
function dirHasRenderable(dir: string): boolean {
  const RENDERABLE = ['page.tsx', 'page.ts', 'route.ts', 'route.tsx', 'default.tsx'];
  if (RENDERABLE.some((f) => existsSync(join(dir, f)))) return true;
  // The destination may sit inside a route group at the leaf (rare but valid).
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return false;
  }
  return children.some(
    (c) =>
      c.startsWith('(') &&
      c.endsWith(')') &&
      statSync(join(dir, c)).isDirectory() &&
      dirHasRenderable(join(dir, c)),
  );
}

function extractRedirectLiterals(source: string): string[] {
  const found = new Set<string>();
  // Matches: redirectTo = '...'  |  redirectTo: '...'  |  redirectTo = `...`
  // and the ternary arms `... ? '/x' : '/y'` assigned to redirectTo.
  const lines = source.split('\n');
  for (const line of lines) {
    if (!/redirectTo/.test(line)) continue;
    // pull every single/double/back-quoted in-product path on the line
    const re = /['"`](\/baseball\/[^'"`]+)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      // ignore interpolated template paths (handled by the dynamic-arm test)
      if (!m[1]!.includes('${')) found.add(m[1]!);
    }
  }
  return [...found];
}

describe('auth.ts post-auth redirects resolve to real routes', () => {
  const source = readFileSync(AUTH_FILE, 'utf8');
  const literals = extractRedirectLiterals(source);

  it('extracts the known redirect literals', () => {
    // sanity: we actually found the landing paths (guards against a regex that
    // silently matches nothing and lets dead routes slip through).
    expect(literals.length).toBeGreaterThanOrEqual(4);
    expect(literals).toContain('/baseball/dashboard');
  });

  it('the App Router app dir exists at the resolved path', () => {
    expect(existsSync(APP_DIR)).toBe(true);
  });

  it.each(
    // build the cases lazily so the table is non-empty even if extraction changes
    (readFileSync(AUTH_FILE, 'utf8'), extractRedirectLiterals(readFileSync(AUTH_FILE, 'utf8'))).map(
      (p) => [p] as const,
    ),
  )('redirectTo %s resolves to a real page', (href) => {
    expect(routeExists(href)).toBe(true);
  });

  it('regression: the dead /baseball/dashboard/staff target is gone', () => {
    // It must NOT be a redirect literal AND must not resolve (no page.tsx).
    expect(literals).not.toContain('/baseball/dashboard/staff');
    expect(routeExists('/baseball/dashboard/staff')).toBe(false);
  });

  it('the lifting-only landing /baseball/dashboard/performance is real', () => {
    expect(routeExists('/baseball/dashboard/performance')).toBe(true);
  });
});
