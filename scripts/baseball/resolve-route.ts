// =============================================================================
// scripts/baseball/resolve-route.ts
//
// Shared URL → page.tsx resolution helper for BaseballHelm route validation.
//
// Factored out of `src/app/baseball/actions/__tests__/auth-redirects-resolve.test.ts`
// (the original defect #2 regression guard) so the same logic backs both:
//   - the fast local vitest guard for the readiness matrix's Route(s) column
//     (src/app/baseball/actions/__tests__/readiness-matrix-routes.test.ts), and
//   - the `check:readiness-matrix` CI script (scripts/baseball/check-readiness-matrix.ts).
//
// Handles route groups — parenthesized dirs like "(dashboard)" — which do NOT
// appear in the URL, by walking the tree allowing each URL segment to be
// nested under any number of route-group dirs. Dynamic segments like "[id]"
// are matched literally as real on-disk directory names (Next.js requires the
// bracket syntax on disk too, so a route citing `/players/[id]` resolves
// against a literal `[id]` directory — no special-casing needed beyond
// treating it as an ordinary path segment).
// =============================================================================

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RENDERABLE_FILES = ['page.tsx', 'page.ts', 'route.ts', 'route.tsx', 'default.tsx'];

/**
 * Resolve an in-product href (e.g. "/baseball/dashboard/performance?focus=x")
 * to a route file on disk under `appDir`. Returns true if a page.tsx,
 * route.ts(x), or default.tsx exists for the path (accounting for route
 * groups at any depth).
 */
export function routeExists(href: string, appDir: string): boolean {
  const path = href.split('?')[0]!.split('#')[0]!;
  const segments = path.split('/').filter(Boolean);

  let dirs: string[] = [appDir];

  for (const seg of segments) {
    const next: string[] = [];
    for (const dir of dirs) {
      const direct = join(dir, seg);
      if (existsSync(direct) && statSync(direct).isDirectory()) next.push(direct);
      collectThroughGroups(dir, seg, next);
    }
    if (next.length === 0) return false;
    dirs = next;
  }

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
      collectThroughGroups(groupDir, seg, out);
    }
  }
}

/** True if dir (or a trailing route group within it) has a renderable entry. */
function dirHasRenderable(dir: string): boolean {
  if (RENDERABLE_FILES.some((f) => existsSync(join(dir, f)))) return true;
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

/**
 * Slice out just the "## Matrix" table section of the readiness matrix doc
 * (everything between that heading and the next `## ` heading). Scoping to
 * this section — rather than scanning the whole file — keeps illustrative
 * example paths in prose (e.g. in the Maintenance section's explanation of
 * the convention itself) from being misread as real table rows.
 */
export function extractMatrixTableSection(source: string): string {
  const start = source.indexOf('## Matrix');
  if (start === -1) return source;
  const rest = source.slice(start + '## Matrix'.length);
  const nextHeadingMatch = rest.match(/\n## /);
  const end = nextHeadingMatch ? nextHeadingMatch.index! : rest.length;
  return rest.slice(0, end);
}

/**
 * Extract every `/baseball/...` path cited inside markdown inline code spans
 * (single backticks) in the matrix's table section. Used to pull the
 * Route(s) column out of the readiness matrix without a full markdown-table
 * parser — the matrix's own convention (documented in its Maintenance
 * section) is that every cited route lives inside a single backtick code
 * span and starts with `/baseball/`.
 */
export function extractBaseballRoutesFromMarkdown(source: string): string[] {
  const tableSection = extractMatrixTableSection(source);
  const found = new Set<string>();
  const re = /`(\/baseball\/[^`\s]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableSection)) !== null) {
    found.add(m[1]!);
  }
  return [...found];
}

/**
 * Extract every full GitHub issue URL
 * (`https://github.com/<owner>/<repo>/issues/<n>`) cited in the matrix's
 * table section's Owner Issue column.
 */
export function extractOwnerIssueUrls(source: string): string[] {
  const tableSection = extractMatrixTableSection(source);
  const found = new Set<string>();
  const re = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableSection)) !== null) {
    found.add(m[0]);
  }
  return [...found];
}
