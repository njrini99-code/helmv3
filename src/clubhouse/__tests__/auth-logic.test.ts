import { describe, expect, it } from 'vitest';
import {
  CREDENTIALS_MESSAGE,
  NETWORK_MESSAGE,
  RATE_LIMIT_MESSAGE,
  STALE_BUNDLE_MESSAGE,
  UNEXPECTED_MESSAGE,
  UNVERIFIED_MESSAGE,
  extractJoinCode,
  getErrorMessage,
  invalidFieldFor,
  isStaleBundleError,
  needsOnboardingFor,
  resolveSignInHref,
} from '@/lib/auth/golf-sign-in-logic';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { evaluateFlag } from '@/lib/flags/is-enabled';
import { FLAG_REGISTRY } from '@/lib/flags/registry.generated';
import { formatLastHere, isDashboardDestination, pickWelcomeItems, resolveWelcomeName, shapeWelcomeNews, welcomeDestination } from '../data/welcome-shape';
import { BALL_AT_REST, BALL_MS, BALL_TOTAL_MS, CUP, ballAt } from '../screens/auth/scene-ball';
import { sceneGeometry } from '../screens/auth/scene-geometry';
import { SKY_KEYS, greetingWord, isDarkSky, mixColor, quantizeHour, skyAt } from '../screens/auth/scene-sky';
import { sceneMetrics } from '../screens/auth/GolfScene';
import { failureFor } from '../screens/auth/sign-in-state';
import { welcomeCard, welcomeLine1 } from '../screens/auth/auth-motion';

/** Sign in, welcome and the painted course (P015): the rules that carry no DOM, each found by its number in docs/clubhouse/catalog/auth.md. */

describe('CH-15001 CH-15002 CH-15003 CH-15004 CH-15005 CH-15006 CH-15007 the six sign-in messages, verbatim from getErrorMessage', () => {
  it('maps each server text to the words the design shows', () => {
    expect(getErrorMessage('Invalid login credentials')).toBe('Incorrect email or password. Please check your credentials and try again.');
    expect(getErrorMessage('Email not confirmed')).toBe('Please verify your email address before signing in. Check your inbox for the confirmation link.');
    expect(getErrorMessage('Too many requests')).toBe('Too many sign-in attempts. Please wait a moment and try again.');
    expect(getErrorMessage('rate limit exceeded')).toBe('Too many sign-in attempts. Please wait a moment and try again.');
    expect(getErrorMessage('NetworkError when attempting to fetch')).toBe('Unable to reach the server. Please check your internet connection and try again.');
  });

  it('passes the server own words through: a lockout, and the attempts-remaining warning', () => {
    expect(getErrorMessage('Invalid email or password (2 attempts remaining)')).toBe('Invalid email or password (2 attempts remaining)');
    expect(getErrorMessage('Account locked. Try again in 14 minutes.')).toBe('Account locked. Try again in 14 minutes.');
  });

  it('gives each message its tone, haptic, field and number', () => {
    expect(failureFor(CREDENTIALS_MESSAGE)).toMatchObject({ tone: 'danger', haptic: 'error', field: 'both', code: 'CH-15001' });
    expect(failureFor(UNVERIFIED_MESSAGE)).toMatchObject({ tone: 'warning', haptic: 'warning', field: null, code: 'CH-15002' });
    expect(failureFor(RATE_LIMIT_MESSAGE)).toMatchObject({ tone: 'warning', haptic: 'warning', field: null, code: 'CH-15003' });
    expect(failureFor(NETWORK_MESSAGE)).toMatchObject({ tone: 'danger', haptic: 'error', field: null, code: 'CH-15004' });
    expect(failureFor(STALE_BUNDLE_MESSAGE)).toMatchObject({ tone: 'info', haptic: 'error', field: null, code: 'CH-15005' });
    expect(failureFor(UNEXPECTED_MESSAGE)).toMatchObject({ tone: 'danger', haptic: 'error', field: null, code: 'CH-15006' });
    expect(failureFor('Account locked.')).toMatchObject({ tone: 'danger', haptic: 'error', field: null, code: 'CH-15007' });
  });

  it('marks both fields only for a credentials rejection', () => {
    expect(invalidFieldFor(CREDENTIALS_MESSAGE)).toBe('both');
    expect(invalidFieldFor(RATE_LIMIT_MESSAGE)).toBeNull();
    expect(invalidFieldFor('Invalid email or password (2 attempts remaining)')).toBeNull();
  });

  it('CH-15005 knows a stale bundle by Next own two messages', () => {
    expect(isStaleBundleError('An unexpected response was received from the server.')).toBe(true);
    expect(isStaleBundleError('Failed to find Server Action "abc"')).toBe(true);
    expect(isStaleBundleError('Invalid login credentials')).toBe(false);
  });
});

describe('CH-15902 where a successful sign-in goes (role routing)', () => {
  it('sends an onboarded person through the welcome to the dashboard', () => {
    expect(resolveSignInHref('/golf/dashboard', null)).toBe('/golf/welcome?next=%2Fgolf%2Fdashboard');
    expect(resolveSignInHref(undefined, null)).toBe('/golf/welcome?next=%2Fgolf%2Fdashboard');
  });

  it('honours a safe returnTo only when the person is onboarded', () => {
    expect(resolveSignInHref('/golf/dashboard', '/golf/join/ABC123')).toBe('/golf/welcome?next=%2Fgolf%2Fjoin%2FABC123');
    expect(resolveSignInHref('/golf/dashboard', '/golf/dashboard/roster')).toBe('/golf/welcome?next=%2Fgolf%2Fdashboard%2Froster');
  });

  it('drops a returnTo that is not a safe internal path (open redirect)', () => {
    expect(resolveSignInHref('/golf/dashboard', '//evil.example/x')).toBe('/golf/welcome?next=%2Fgolf%2Fdashboard');
    expect(resolveSignInHref('/golf/dashboard', 'https://evil.example')).toBe('/golf/welcome?next=%2Fgolf%2Fdashboard');
    expect(resolveSignInHref('/golf/dashboard', '/golf\\evil')).toBe('/golf/welcome?next=%2Fgolf%2Fdashboard');
  });

  it('routes a coach or player with no profile to their onboarding, skipping the welcome (there is no name to greet)', () => {
    expect(needsOnboardingFor('/golf/coach')).toBe(true);
    expect(needsOnboardingFor('/golf/player')).toBe(true);
    expect(needsOnboardingFor('/golf/dashboard')).toBe(false);
    expect(resolveSignInHref('/golf/coach', null)).toBe('/golf/coach');
    expect(resolveSignInHref('/golf/player', null)).toBe('/golf/player');
  });

  it('keeps an invite code through onboarding so the new player joins the team on completion', () => {
    expect(resolveSignInHref('/golf/player', '/golf/join/ABC123')).toBe('/golf/player?joinCode=ABC123');
    expect(resolveSignInHref('/golf/player', '/golf/join/AB%20C?x=1')).toBe('/golf/player?joinCode=AB%20C');
    expect(resolveSignInHref('/golf/coach', '/golf/dashboard')).toBe('/golf/coach');
    expect(extractJoinCode('/golf/join/ABC123#top')).toBe('ABC123');
    expect(extractJoinCode('/golf/dashboard')).toBeNull();
  });

  it('sends the super-admin the server named, through the welcome', () => {
    expect(resolveSignInHref('/admin', null)).toBe('/golf/welcome?next=%2Fadmin');
  });
});

describe('CH-15602 the greeting by hour, and the sky it sits on', () => {
  it('follows morning 4:30 to 12, afternoon 12 to 17, evening otherwise', () => {
    expect(greetingWord(4 + 29 / 60)).toBe('Good evening');
    expect(greetingWord(4.5)).toBe('Good morning');
    expect(greetingWord(11 + 59 / 60)).toBe('Good morning');
    expect(greetingWord(12)).toBe('Good afternoon');
    expect(greetingWord(16 + 59 / 60)).toBe('Good afternoon');
    expect(greetingWord(17)).toBe('Good evening');
    expect(greetingWord(0)).toBe('Good evening');
    expect(greetingWord(23.9)).toBe('Good evening');
  });

  it('has the ten keyframes, and lands on each one exactly at its hour', () => {
    expect(SKY_KEYS).toHaveLength(10);
    for (const key of SKY_KEYS.slice(0, -1)) {
      const sky = skyAt(key.h);
      expect(sky.top).toBe(key.top.toLowerCase());
      expect(sky.ambA).toBeCloseTo(key.ambA, 6);
      expect(sky.stars).toBeCloseTo(key.stars, 6);
    }
  });

  it('eases between keyframes with a smoothstep and wraps at 24 hours', () => {
    const mid = skyAt((8.5 + 12.5) / 2);
    expect(mid.top).toBe(mixColor('#C7DCE2', '#9EC3DC', 0.5));
    expect(skyAt(25.5).top).toBe(skyAt(1.5).top);
    expect(skyAt(-2).top).toBe(skyAt(22).top);
  });

  it('turns the type to ivory at dusk and night only', () => {
    expect(isDarkSky(12)).toBe(false);
    expect(isDarkSky(8.5)).toBe(false);
    expect(isDarkSky(18.6)).toBe(false);
    expect(isDarkSky(21.5)).toBe(true);
    expect(isDarkSky(2)).toBe(true);
  });

  it('redraws the sky on a two-minute grid, not on every clock tick', () => {
    expect(quantizeHour(8.5)).toBeCloseTo(8.5, 9);
    expect(quantizeHour(8.5 + 0.5 / 60)).toBeCloseTo(8.5, 9);
    expect(quantizeHour(8.5 + 1.4 / 60)).toBeCloseTo(8.5 + 2 / 60, 9);
  });

  it('draws the same course every time (seeded), with the design counts', () => {
    const a = sceneGeometry();
    expect(sceneGeometry()).toBe(a);
    expect(a.stars).toHaveLength(110);
    expect(a.bloom).toHaveLength(90);
    expect(a.oakL).toHaveLength(14);
    expect(a.oakR).toHaveLength(20);
    expect(a.pine).toHaveLength(8);
    expect(a.bough).toHaveLength(2);
    expect(a.reeds).toHaveLength(26);
  });

  it('pivots both cameras on the hole and keeps the cup visible on narrow phones', () => {
    const desktop = sceneMetrics(1600, 1000, 'wide');
    expect(desktop.unit).toBeCloseTo(1, 6);
    expect(desktop.originX).toBeCloseTo(1052, 6);
    expect(desktop.originY).toBeCloseTo(640, 6);
    const phone = sceneMetrics(760, 1000, 'tall');
    expect(phone.originX).toBeCloseTo(CUP[0] - 650, 6);
    expect(phone.originY).toBeCloseTo(640, 6);
    for (const [width, height] of [[375, 667], [390, 664], [430, 900]]) {
      const m = sceneMetrics(width!, height!, 'tall');
      expect(m.originX).toBeGreaterThan(width! * 0.25);
      expect(m.originX).toBeLessThan(width! * 0.75);
      expect(m.originY).toBeGreaterThan(height! * 0.3);
      expect(m.originY).toBeLessThan(height! * 0.75);
    }
  });
});

describe('CH-15603 the ball: in the air, one hop, a roll, then on the green', () => {
  it('is not there until its delay is up', () => {
    expect(ballAt(0).visible).toBe(false);
    expect(ballAt(BALL_MS.delay - 1).visible).toBe(false);
    expect(ballAt(BALL_MS.delay + 1).visible).toBe(true);
  });

  it('starts in the foreground, large, and shrinks as it flies away', () => {
    const start = ballAt(BALL_MS.delay + 1);
    const late = ballAt(BALL_MS.delay + BALL_MS.flight - 1);
    expect(start.r).toBeGreaterThan(9.9);
    expect(late.r).toBeLessThan(3.5);
    expect(start.y).toBeGreaterThan(1000);
  });

  it('ends in the cup line and stays there', () => {
    const end = ballAt(BALL_TOTAL_MS);
    expect(end).toEqual(BALL_AT_REST);
    expect(end.x).toBe(CUP[0]);
    expect(end.y).toBe(CUP[1] - 3);
    expect(ballAt(BALL_TOTAL_MS + 60_000)).toEqual(BALL_AT_REST);
  });

  it('hops above the green between the flight and the roll', () => {
    const hop = ballAt(BALL_MS.delay + BALL_MS.flight + BALL_MS.hop / 2);
    expect(hop.y).toBeLessThan(648 - 3 - 5);
  });
});

describe('CH-15303 CH-15301 CH-15302 CH-15201 what the welcome shows', () => {
  const item = (over: Partial<UnifiedNotificationItem>): UnifiedNotificationItem => ({
    id: 'a',
    source: 'notifications',
    category: 'messages',
    title: '4 new messages',
    body: 'Sofia, Eli and 2 others',
    action_url: null,
    created_at: '2025-10-13T10:00:00Z',
    read_at: null,
    ...over,
  });

  it('greets a coach as Coach and the last name, a player by first name, anyone else by their account name', () => {
    expect(resolveWelcomeName({ coachFullName: 'Maya Reyes' })).toEqual({ status: 'named', display: 'Coach Reyes' });
    expect(resolveWelcomeName({ playerFirstName: 'Theo' })).toEqual({ status: 'named', display: 'Theo' });
    expect(resolveWelcomeName({ accountName: 'Sam Jones' })).toEqual({ status: 'named', display: 'Sam' });
  });

  it('never says "Coach Coach", or a bare "Coach" with the name missing', () => {
    expect(resolveWelcomeName({ coachFullName: 'Demo Coach' })).toEqual({ status: 'named', display: 'Coach Demo' });
    expect(resolveWelcomeName({ coachFullName: 'Coach' })).toEqual({ status: 'anonymous' });
    expect(resolveWelcomeName({ coachFullName: 'coach coach' })).toEqual({ status: 'anonymous' });
    expect(resolveWelcomeName({ coachFullName: '​‮ ' })).toEqual({ status: 'anonymous' });
  });

  it('stands on the greeting alone when the name lookup found nothing', () => {
    expect(resolveWelcomeName({})).toEqual({ status: 'anonymous' });
    expect(resolveWelcomeName({ playerFirstName: '  ' })).toEqual({ status: 'anonymous' });
  });

  it('lists the newest three unread items and skips what was read', () => {
    const feed = [item({ id: '1' }), item({ id: '2', read_at: '2025-10-13T11:00:00Z' }), item({ id: '3' }), item({ id: '4' }), item({ id: '5' })];
    expect(pickWelcomeItems(feed).map((i) => i.id)).toEqual(['notifications:1', 'notifications:3', 'notifications:4']);
    expect(pickWelcomeItems([item({ title: '   ' })])).toEqual([]);
  });

  it('says nothing new when the read worked and found nothing, and the first time when there is no earlier visit', () => {
    expect(shapeWelcomeNews({ feed: [], lastSeenAt: '2025-10-12T21:12:00Z' })).toEqual({ items: [], first: false, failed: false });
    expect(shapeWelcomeNews({ feed: [], lastSeenAt: null })).toEqual({ items: [], first: true, failed: false });
  });

  it('never claims "all caught up" for updates it could not read', () => {
    expect(shapeWelcomeNews({ feed: null, lastSeenAt: '2025-10-12T21:12:00Z' })).toEqual({ items: [], first: false, failed: true });
  });

  it('words the last visit against the viewer own clock', () => {
    const now = new Date(2025, 9, 14, 10, 0);
    expect(formatLastHere(new Date(2025, 9, 14, 9, 5).toISOString(), now)).toMatch(/^Today at 9:05 ?am$/);
    expect(formatLastHere(new Date(2025, 9, 13, 21, 12).toISOString(), now)).toMatch(/^Yesterday at 9:12 ?pm$/);
    expect(formatLastHere(new Date(2025, 9, 12, 21, 12).toISOString(), now)).toMatch(/^Sunday at 9:12 ?pm$/);
    expect(formatLastHere(new Date(2025, 8, 30, 21, 12).toISOString(), now)).toMatch(/^Sep 30 at 9:12 ?pm$/);
    expect(formatLastHere('not a date', now)).toBeNull();
  });

  it('sends Continue to a safe next, else the dashboard, else the admin console for the legacy admin', () => {
    expect(welcomeDestination('/golf/dashboard/roster', false)).toBe('/golf/dashboard/roster');
    expect(welcomeDestination('/golf/join/ABC123', false)).toBe('/golf/join/ABC123');
    expect(welcomeDestination('//evil.example', false)).toBe('/golf/dashboard');
    expect(welcomeDestination(null, false)).toBe('/golf/dashboard');
    expect(welcomeDestination(null, true)).toBe('/admin');
    expect(welcomeDestination('//evil.example', true)).toBe('/admin');
  });

  it('folds into the dashboard canvas only when the destination is a dashboard page', () => {
    expect(isDashboardDestination('/golf/dashboard')).toBe(true);
    expect(isDashboardDestination('/golf/dashboard/stats?player=1')).toBe(true);
    expect(isDashboardDestination('/golf/join/ABC123')).toBe(false);
    expect(isDashboardDestination('/admin')).toBe(false);
  });
});

describe('CH-15605 reduced motion: the welcome lands in a millisecond', () => {
  it('keeps the design timings otherwise', () => {
    const still = welcomeCard.show as (c: { reduced: boolean }) => { transition: { duration: number; delay: number } };
    expect(still({ reduced: true }).transition).toEqual({ duration: 0.001, delay: 0 });
    expect(still({ reduced: false }).transition.duration).toBe(0.9);
    expect(still({ reduced: false }).transition.delay).toBe(2.25);
    const line = welcomeLine1.show as (c: { reduced: boolean }) => { transition: { duration: number; delay: number } };
    expect(line({ reduced: true }).transition.duration).toBe(0.001);
    expect(line({ reduced: false }).transition.delay).toBe(0.64);
  });
});

describe('the front door flag defaults off in production', () => {
  it('is registered, off in production, on for preview and development', () => {
    const flag = FLAG_REGISTRY.find((f) => f.feature_id === 'golf_clubhouse_front_door');
    expect(flag).toBeDefined();
    expect(flag?.default).toBe(false);
    expect(evaluateFlag('golf_clubhouse_front_door', { environment: 'production', skipTelemetry: true }).value).toBe(false);
    expect(evaluateFlag('golf_clubhouse_front_door', { environment: 'development', skipTelemetry: true }).value).toBe(true);
    expect(evaluateFlag('golf_clubhouse_front_door', { environment: 'preview', skipTelemetry: true }).value).toBe(true);
  });
});
