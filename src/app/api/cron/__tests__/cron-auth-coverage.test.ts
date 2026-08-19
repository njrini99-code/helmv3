import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_REGISTRY } from '@/lib/admin/cron-registry';

/**
 * Sibling to cron-job-log-coverage: every registered cron must refuse an
 * unauthenticated caller.
 *
 * Cron routes are public HTTP endpoints. The only thing between
 * `/api/cron/<name>` and an anonymous request is the CRON_SECRET check, and
 * these routes do real work — bulk deletes, mass UPDATEs, sending email. A new
 * cron added without a guard is an open write endpoint, and nothing else in
 * CI would notice.
 *
 * Audited 2026-07-31: 17/17 guarded (13 via requireCronAuth, 4 inline). This
 * test exists so that stays true, not because it was ever false.
 *
 * TIGHTENED 2026-08-19: the inline escape hatch is GONE. It used to accept any
 * route that merely mentioned `process.env.CRON_SECRET` alongside a 401, and
 * every route taking that path compared the header with `!==`. String `!==`
 * short-circuits at the first differing byte, so response latency leaks a
 * prefix-match oracle against CRON_SECRET — precisely the flaw
 * `cronSecretMatches` was written to eliminate with `timingSafeEqual`. The
 * detector was therefore certifying as "guarded" the one pattern the helper
 * exists to replace.
 *
 * The last three inline routes (log-retention, integrity-check,
 * event-reminders) were converted in the same change, so requiring the helper
 * costs nothing today and stops the leaky shape from reappearing.
 *
 * WHY A SHAPE CHECK. Calling each GET with a bad token would be stronger, but
 * every route pulls in its own Supabase/LLM/email dependencies, which is why
 * the behavioural test (shared-auth.test.ts) covers only three hand-mocked
 * routes. A shape check has no mocking cost, so it can cover ALL of them — and
 * "someone shipped a cron with no guard" is exactly the failure it catches.
 * The two together are the real contract: shape for breadth, behaviour for depth.
 */
describe('cron auth coverage', () => {
  const routeSource = (path: string) =>
    readFileSync(join(process.cwd(), 'src/app', path, 'route.ts'), 'utf8');

  it('every registered cron route enforces an auth guard', () => {
    const unguarded = CRON_REGISTRY.map((e) => e.path).filter((path) => {
      const src = routeSource(path);
      // The helper is now the ONLY accepted guard. Inline comparison against
      // process.env.CRON_SECRET is not equivalent: it is not constant-time.
      return !/requireCronAuth\s*\(/.test(src);
    });

    expect(unguarded).toEqual([]);
  });

  it('no cron route compares the secret inline', () => {
    // A route can satisfy the guard check above AND still carry a leftover
    // hand-rolled comparison. This catches a half-finished conversion, where
    // the helper is added but the timing-leaky branch is never removed.
    const inlineComparers = CRON_REGISTRY.map((e) => e.path).filter((path) =>
      /process\.env\.CRON_SECRET/.test(routeSource(path)),
    );

    expect(inlineComparers).toEqual([]);
  });

  it('the registry is non-empty and every entry resolves to a route file', () => {
    // Guards against the whole suite passing vacuously if the registry is ever
    // emptied or a path is renamed without the file moving.
    expect(CRON_REGISTRY.length).toBeGreaterThan(0);
    for (const entry of CRON_REGISTRY) {
      expect(() => routeSource(entry.path)).not.toThrow();
    }
  });
});
