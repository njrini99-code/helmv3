/**
 * Every public route under `src/app/golf/(auth)` must own its `loading.tsx`.
 *
 * Without one, Next.js falls back to the nearest parent boundary — here
 * `src/app/golf/loading.tsx`, which renders `FairwayShellSkeleton` wrapping
 * `FairwayDashboardSkeleton`: the full signed-in chrome (nav rail with
 * Dashboard / Team / Calendar, top bar, dashboard card grid) plus an `sr-only`
 * announcement reading "Loading dashboard…".
 *
 * On an unauthenticated page that is wrong twice over — it shows app furniture
 * to someone who has not signed in, and it tells a screen-reader user the
 * dashboard is loading when they are on a marketing or password form.
 *
 * `golf/loading.tsx`'s own docblock already reasons about this. It lists the
 * blast radius as "/golf (a redirect page), /golf/admin/** …, and
 * /golf/(auth)/demo", then asserts one sentence later that "Every auth,
 * onboarding and join route has its own closer loading.tsx and is unaffected".
 * Both cannot be true, and it was `demo` that fell through — the page a
 * prospective COACH lands on ("Step inside a live GolfHelm team"), which is the
 * buyer's first impression and is now also linked from the signup gate
 * (843f7b158).
 *
 * The justification offered there covers admin ("internal-only, strictly better
 * than the retired cream skeleton"). It does not cover a public conversion page.
 *
 * This test is the guard the docblock's claim needed: adding a route under
 * `(auth)` without a loading boundary silently hands it the dashboard skeleton.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AUTH_DIR = join(process.cwd(), 'src/app/golf/(auth)');

/** Route directories under (auth) — anything that renders its own page. */
function routeDirsWithPages(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (existsSync(join(full, 'page.tsx'))) out.push(full);
      walk(full);
    }
  };
  walk(root);
  return out;
}

describe('golf (auth) loading boundaries', () => {
  it('finds the auth route group at all (guards the fixture)', () => {
    expect(existsSync(AUTH_DIR)).toBe(true);
    expect(routeDirsWithPages(AUTH_DIR).length).toBeGreaterThan(3);
  });

  it('gives every (auth) route its own loading.tsx', () => {
    const missing = routeDirsWithPages(AUTH_DIR)
      .filter((dir) => !existsSync(join(dir, 'loading.tsx')))
      .map((dir) => dir.slice(dir.indexOf('src/app')));

    expect(
      missing,
      'these fall back to golf/loading.tsx, which paints the signed-in dashboard '
        + 'chrome and announces "Loading dashboard…" on an unauthenticated page',
    ).toEqual([]);
  });
});
