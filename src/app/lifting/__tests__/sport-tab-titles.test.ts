import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GAP-R-18: every BaseballHelm and Lift Lab dashboard screen names itself in the tab, under one product suffix each,
 * and Lift Lab's sign-in, onboarding and join pages have their own error and loading boundaries.
 */
const root = process.cwd();
const BASEBALL = join(root, 'src/app/baseball/(dashboard)/dashboard');
const LIFTING = join(root, 'src/app/lifting/(dashboard)/dashboard');

const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : pages(path);
    return name === 'page.tsx' ? [path] : [];
  });
const read = (path: string) => readFileSync(path, 'utf8');
const TITLE = /^\s*(?:export const metadata(?::\s*Metadata)?\s*=\s*\{\s*)?title:\s*'([^']+)'/m;
const titleIn = (path: string) => (existsSync(path) ? (read(path).match(TITLE)?.[1] ?? null) : null);
/** A page that only redirects renders nothing, so it needs no title. */
const renders = (path: string) => /return\s*(?:<|\()/.test(read(path));
/** The page's own title, else the nearest folder layout's, up to the dashboard root. */
const titleFor = (page: string, top: string) => {
  const own = titleIn(page);
  if (own) return own;
  for (let dir = dirname(page); dir.startsWith(top); dir = dirname(dir)) {
    const t = titleIn(join(dir, 'layout.tsx'));
    if (t) return t;
  }
  return null;
};

describe.each([
  ['BaseballHelm', BASEBALL, join(BASEBALL, 'layout.tsx')],
  ['Lift Lab', LIFTING, join(root, 'src/app/lifting/(dashboard)/layout.tsx')],
])('%s tab titles', (product, top, layout) => {
  it('one template adds the product name', () => {
    expect(read(layout)).toContain(`title: { template: '%s · ${product}', default: '${product}' }`);
  });

  it('every screen that renders has a bare title', () => {
    const files = pages(top).filter(renders);
    expect(files.length).toBeGreaterThan(10);
    const missing = files.filter((f) => !titleFor(f, top)).map((f) => relative(root, f));
    expect(missing).toEqual([]);
  });

  it('no page or folder layout carries a brand suffix of its own', () => {
    const files = [...pages(top), ...pages(top).map((p) => join(dirname(p), 'layout.tsx'))].filter(existsSync);
    const branded = [...new Set(files)]
      .map((f) => [relative(root, f), titleIn(f)] as const)
      .filter(([, t]) => t && /Helm|\|/.test(t));
    expect(branded).toEqual([]);
  });
});

describe('Lift Lab sign-in, onboarding and join boundaries', () => {
  it.each(['src/app/lifting/(auth)', 'src/app/lifting/(onboarding)/coach', 'src/app/lifting/join/[token]'])('%s has error.tsx and loading.tsx', (dir) => {
    expect(read(join(root, dir, 'error.tsx'))).toContain('RouteErrorBoundary');
    expect(read(join(root, dir, 'loading.tsx'))).toContain('LiftLabFormLoading');
  });
});
