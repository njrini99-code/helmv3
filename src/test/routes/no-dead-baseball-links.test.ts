// =============================================================================
// Every literal internal BaseballHelm link must resolve to something that
// exists — an App Router page/route, or a real file in public/.
//
// WHY THIS, AND WHY NOW. The recruiting sunset moved a lot of ground: routes
// became redirects, nav entries disappeared, and copy that pointed at them
// stayed behind. Two demo-path bugs this run were exactly that shape — the
// Calendar's "Browse prospects" button and four player surfaces still selling
// /dashboard/activate. Those were links to routes that exist but are gated;
// this test catches the harsher case, a link to a route that does not exist at
// all, which 404s rather than redirecting.
//
// A 404 in front of a buyer is not recoverable by explanation. It is also the
// single cheapest class of bug to prevent, because the answer is fully
// determined by the filesystem.
//
// SCOPE AND HONESTY ABOUT IT. Only LITERAL hrefs are checked — a template
// literal with an interpolation (`/baseball/player/${id}`) is skipped, because
// its shape is only knowable at runtime. So a green run means "no hardcoded
// dead link", not "no dead link". Stated here rather than implied, because a
// checker whose limits are undocumented gets read as proving more than it does.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../..');
const APP = join(ROOT, 'src/app');
const PUBLIC = join(ROOT, 'public');

type Segment =
  | { kind: 'lit'; value: string }
  | { kind: 'dyn' }
  | { kind: 'catch' }
  | { kind: 'optcatch' };

const isGroup = (name: string) => name.startsWith('(') && name.endsWith(')');

function collectRoutes(dir: string, segs: Segment[], out: Segment[][]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((e) => e.isFile() && /^(page|route)\.(tsx?|jsx?)$/.test(e.name))) {
    out.push([...segs]);
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // `_private` folders and `@slots` never contribute a URL segment we link to.
    if (e.name === 'node_modules' || e.name.startsWith('_') || e.name.startsWith('@')) continue;

    // Route groups are organisational only — they add no URL segment.
    if (isGroup(e.name)) {
      collectRoutes(join(dir, e.name), segs, out);
      continue;
    }

    let seg: Segment;
    if (/^\[\[\.\.\..+\]\]$/.test(e.name)) seg = { kind: 'optcatch' };
    else if (/^\[\.\.\..+\]$/.test(e.name)) seg = { kind: 'catch' };
    else if (/^\[.+\]$/.test(e.name)) seg = { kind: 'dyn' };
    else seg = { kind: 'lit', value: e.name };

    collectRoutes(join(dir, e.name), [...segs, seg], out);
  }
}

function matchesRoute(pathSegs: string[], route: Segment[]): boolean {
  let i = 0;
  for (const seg of route) {
    if (seg.kind === 'catch') return i < pathSegs.length;
    if (seg.kind === 'optcatch') return true;
    if (i >= pathSegs.length) return false;
    if (seg.kind === 'lit' && seg.value !== pathSegs[i]) return false;
    i++;
  }
  return i === pathSegs.length;
}

const ROUTES: Segment[][] = [];
collectRoutes(APP, [], ROUTES);

function resolvesToRoute(pathname: string): boolean {
  const segs = pathname.split('/').filter(Boolean);
  return ROUTES.some((r) => matchesRoute(segs, r));
}

function resolvesToPublicFile(pathname: string): boolean {
  // e.g. /baseball-manifest.webmanifest, /baseball-aerial.webp
  return existsSync(join(PUBLIC, pathname.replace(/^\//, '')));
}

function collectSourceFiles(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      collectSourceFiles(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
}

// Literal targets only. The `[^"'`\s${]*` class is what excludes interpolated
// template literals — see the scope note in the header.
const LINK_RE =
  /(?:href|router\.(?:push|replace|prefetch)\(|redirect\(|permanentRedirect\()\s*[=(]?\s*["'`](\/[^"'`\s${]*)["'`]/g;

interface DeadLink {
  href: string;
  site: string;
}

function findDeadLinks(files: string[]): DeadLink[] {
  const dead: DeadLink[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(src)) !== null) {
      // The capture group is non-optional in LINK_RE, but noUncheckedIndexedAccess
      // types it as possibly undefined — narrow rather than assert.
      const captured = m[1];
      if (!captured) continue;
      const href = captured.split('?')[0]?.split('#')[0]?.replace(/\/$/, '') || '/';
      if (!href.startsWith('/baseball')) continue;
      if (resolvesToRoute(href) || resolvesToPublicFile(href)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      dead.push({ href, site: `${relative(ROOT, file)}:${line}` });
    }
  }
  return dead;
}

describe('baseball internal links', () => {
  it('discovered a real route table (guards against scanning nothing)', () => {
    // Without this, a broken walk yields zero routes, every link "fails", and
    // the obvious repair is to weaken the test rather than fix the walk.
    expect(ROUTES.length).toBeGreaterThan(150);
  });

  it('resolves known-good paths and rejects known-bad ones', () => {
    // The non-vacuity assertion. A resolver that answers `true` to everything
    // would make the sweep below pass while proving nothing at all — which is
    // exactly how the regex nested-button checker earlier in this project
    // reported 27 confident false positives.
    expect(resolvesToRoute('/baseball/dashboard/roster')).toBe(true);
    expect(resolvesToRoute('/baseball/player/today')).toBe(true);
    // Dynamic segment.
    expect(resolvesToRoute('/baseball/program/some-org-id')).toBe(true);

    expect(resolvesToRoute('/baseball/dashboard/definitely-not-a-route')).toBe(false);
    expect(resolvesToRoute('/baseball/nope/nope')).toBe(false);
    // A prefix of a real route is not a route.
    expect(resolvesToRoute('/baseball/dashboard/roster/not-a-child')).toBe(false);
  });

  it('has no hardcoded link to a baseball route that does not exist', () => {
    const files: string[] = [];
    collectSourceFiles(join(ROOT, 'src'), files);
    expect(files.length).toBeGreaterThan(500);

    const dead = findDeadLinks(files);
    expect(
      dead,
      `Dead baseball links:\n${dead.map((d) => `  ${d.href}  ←  ${d.site}`).join('\n')}`,
    ).toEqual([]);
  }, 60000);
});
