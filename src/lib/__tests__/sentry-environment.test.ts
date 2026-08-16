import { describe, it, expect } from 'vitest';
import {
  resolveServerEnvironment,
  resolveClientEnvironment,
  isLocalHostname,
  LOCAL_BUILD_ENVIRONMENT,
} from '../sentry-environment';

/**
 * The Sentry `environment` tag, over the matrix that actually occurs.
 *
 * WHY THIS EXISTS. `NODE_ENV === 'production'` in ANY optimized build, so
 * `next build && next start` on a laptop reported `environment: production`. A
 * real `ReferenceError` from an agent QA worktree — stack path
 * `/private/tmp/.../wt-qa/.next/server/...`, origin `http://localhost:3210`,
 * `server_name: Mac.lan`, HeadlessChrome — arrived in Sentry tagged exactly
 * like a live outage and was nearly triaged as one.
 *
 * THE PROPERTY THAT MATTERS MORE THAN THE FIX. Sentry alert rules filter on
 * `environment:production`. Relabelling a genuine production event would
 * silence paging, which is strictly worse than the noise being removed. So the
 * suite is built around one invariant, asserted from both directions:
 *
 *     a real Vercel production event is NEVER relabelled.
 *
 * Every downgrade below requires POSITIVE evidence of a local machine
 * (`VERCEL` absent on the server; a local hostname in the browser). Nothing
 * here ever infers production — only away from it.
 */

describe('resolveServerEnvironment — the matrix', () => {
  it('VERCEL set + VERCEL_ENV=production -> production', () => {
    expect(resolveServerEnvironment({ VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production' }))
      .toBe('production');
  });

  it('no VERCEL + NODE_ENV=production -> NOT production (the bug)', () => {
    // `next build && next start` on a laptop, and every agent QA worktree.
    const result = resolveServerEnvironment({ NODE_ENV: 'production' });
    expect(result).not.toBe('production');
    expect(result).toBe(LOCAL_BUILD_ENVIRONMENT);
  });

  it('no VERCEL + NODE_ENV=development -> development', () => {
    expect(resolveServerEnvironment({ NODE_ENV: 'development' })).toBe('development');
  });
});

describe('resolveServerEnvironment — a real Vercel event is never relabelled', () => {
  // The whole point. If any of these ever downgrade, alerting goes quiet.
  const VERCEL_CASES: Array<[string, Record<string, string>]> = [
    ['production', { VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production' }],
    ['preview', { VERCEL: '1', VERCEL_ENV: 'preview', NODE_ENV: 'production' }],
    ['development', { VERCEL: '1', VERCEL_ENV: 'development', NODE_ENV: 'development' }],
  ];
  for (const [expected, env] of VERCEL_CASES) {
    it(`VERCEL_ENV=${expected} is passed through verbatim`, () => {
      expect(resolveServerEnvironment(env)).toBe(expected);
    });
  }

  it('VERCEL set but VERCEL_ENV missing still never downgrades a prod build', () => {
    // Legitimate on some Vercel contexts. Absence of VERCEL_ENV alone must not
    // be read as "not Vercel" — that is why the gate is VERCEL, not VERCEL_ENV.
    expect(resolveServerEnvironment({ VERCEL: '1', NODE_ENV: 'production' })).toBe('production');
  });

  it('an empty NODE_ENV falls back to development, not production', () => {
    expect(resolveServerEnvironment({})).toBe('development');
  });
});

describe('isLocalHostname', () => {
  const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'Mac.local', 'foo.localhost',
    '192.168.1.46', '10.0.0.4', '172.16.5.9', '169.254.1.1'];
  for (const h of LOCAL) {
    it(`${h} is local`, () => expect(isLocalHostname(h)).toBe(true));
  }

  // These MUST be false — a false positive here relabels a real page.
  const DEPLOYED = ['helmsportslabs.com', 'www.helmsportslabs.com',
    'helmv3-git-main.vercel.app', 'helmv3.vercel.app', '172.15.0.1', '11.0.0.1'];
  for (const h of DEPLOYED) {
    it(`${h} is NOT local`, () => expect(isLocalHostname(h)).toBe(false));
  }

  it('undefined/empty is not local — unknown must never downgrade', () => {
    expect(isLocalHostname(undefined)).toBe(false);
    expect(isLocalHostname('')).toBe(false);
  });
});

describe('resolveClientEnvironment — the browser cannot read VERCEL', () => {
  // next.config.mjs inlines NEXT_PUBLIC_VERCEL_ENV from VERCEL_ENV || NODE_ENV
  // at BUILD time, so a local `next build` bakes the literal "production" into
  // the bundle. Only the runtime hostname can tell the truth.
  it('production build served from localhost -> downgraded', () => {
    expect(resolveClientEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'production' }, 'localhost'))
      .toBe(LOCAL_BUILD_ENVIRONMENT);
  });

  it('production build served from the real domain -> production, untouched', () => {
    expect(resolveClientEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'production' }, 'helmsportslabs.com'))
      .toBe('production');
  });

  it('a preview deployment keeps its own label', () => {
    expect(resolveClientEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'preview' }, 'helmv3-abc.vercel.app'))
      .toBe('preview');
  });

  it('an unknown hostname never downgrades', () => {
    expect(resolveClientEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'production' }, undefined))
      .toBe('production');
  });

  it('development stays development', () => {
    expect(resolveClientEnvironment({ NODE_ENV: 'development' }, 'localhost')).toBe('development');
  });
});
