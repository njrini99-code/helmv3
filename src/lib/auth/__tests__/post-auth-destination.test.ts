/**
 * The bounce set is security-adjacent, not cosmetic.
 *
 * Two failure modes this locks down:
 *
 *  1. Adding `reset-password` (or `callback`, or `complete-signup`) to the set
 *     would break account recovery outright — the recovery link SIGNS THE USER
 *     IN, so an authed-user bounce fires on the one page that must run. That
 *     bug would present as "password reset silently redirects to the dashboard
 *     and the password never changes", which is very hard to attribute.
 *  2. `resolvePostAuthDestination` feeds `NextResponse.redirect`. A permissive
 *     reading of `returnTo` there is an open redirect.
 */
import { describe, it, expect } from 'vitest';
import {
  BOUNCE_WHEN_AUTHED,
  SPORT_HOME,
  isBounceWhenAuthedRoute,
  resolvePostAuthDestination,
} from '../post-auth-destination';

describe('isBounceWhenAuthedRoute', () => {
  it('bounces an authenticated user off the sign-in and sign-up pages', () => {
    expect(isBounceWhenAuthedRoute('/golf/login', 'golf')).toBe(true);
    expect(isBounceWhenAuthedRoute('/golf/signup', 'golf')).toBe(true);
    expect(isBounceWhenAuthedRoute('/baseball/login', 'baseball')).toBe(true);
  });

  it('NEVER bounces the auth routes that require a session to work', () => {
    // Each of these would be a functional regression, not a styling one.
    for (const segment of [
      'reset-password',   // the recovery link is what authenticates
      'callback',         // OAuth / email confirmation must be allowed to run
      'complete-signup',  // authenticated by design
      'welcome',          // the intentional post-sign-in splash
      'forgot-password',  // harmless for a signed-in user; don't change behaviour
      'demo',             // its own entry semantics
    ]) {
      expect(isBounceWhenAuthedRoute(`/golf/${segment}`, 'golf')).toBe(false);
    }
  });

  it('ignores non-sport and dashboard paths', () => {
    expect(isBounceWhenAuthedRoute('/golf/dashboard', 'golf')).toBe(false);
    expect(isBounceWhenAuthedRoute('/admin', null)).toBe(false);
    expect(isBounceWhenAuthedRoute('/', null)).toBe(false);
    // A sport root has no section segment at all.
    expect(isBounceWhenAuthedRoute('/golf', 'golf')).toBe(false);
  });

  it('does not match a segment that merely contains a bounce name', () => {
    expect(isBounceWhenAuthedRoute('/golf/login-help', 'golf')).toBe(false);
    expect(isBounceWhenAuthedRoute('/golf/signups', 'golf')).toBe(false);
  });

  it('keeps the set deliberately small', () => {
    // If this fails, someone widened the set — re-read the doc comment first.
    expect([...BOUNCE_WHEN_AUTHED].sort()).toEqual(['login', 'signup']);
  });
});

describe('resolvePostAuthDestination', () => {
  it('honours a safe internal returnTo', () => {
    expect(
      resolvePostAuthDestination({ sport: 'golf', returnTo: '/golf/dashboard/roster' }),
    ).toBe('/golf/dashboard/roster');
  });

  it('falls back to the sport home when returnTo is absent', () => {
    expect(resolvePostAuthDestination({ sport: 'golf', returnTo: null })).toBe(SPORT_HOME.golf);
    expect(resolvePostAuthDestination({ sport: 'baseball' })).toBe(SPORT_HOME.baseball);
    expect(resolvePostAuthDestination({ sport: 'lifting' })).toBe(SPORT_HOME.lifting);
  });

  it('defaults an unknown sport to golf rather than throwing', () => {
    expect(resolvePostAuthDestination({ sport: null })).toBe(SPORT_HOME.golf);
  });

  it('discards an off-origin returnTo instead of redirecting to it', () => {
    for (const hostile of [
      'https://evil.example/steal',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '',
    ]) {
      expect(resolvePostAuthDestination({ sport: 'golf', returnTo: hostile })).toBe(SPORT_HOME.golf);
    }
  });

  it('never returns the sign-in page itself, which would loop', () => {
    // The middleware also guards on dest !== pathname, but the resolver should
    // not be the thing producing a self-redirect in the first place.
    const dest = resolvePostAuthDestination({ sport: 'golf', returnTo: null });
    expect(dest).not.toBe('/golf/login');
  });
});
