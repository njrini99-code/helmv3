import type { ChWelcome } from '../data/welcome-shape';
import { failureFor, type SignInFailure } from '../screens/auth/sign-in-state';
import { CREDENTIALS_MESSAGE, NETWORK_MESSAGE, RATE_LIMIT_MESSAGE, STALE_BUNDLE_MESSAGE, UNVERIFIED_MESSAGE } from '@/lib/auth/golf-sign-in-logic';

/**
 * Sample data for /clubhouse-preview/auth: the design's own people and the
 * states its boards draw (design/handoff/auth/screenshots). The date is held
 * still (Tuesday 14 October 2025, 10:00 local) so every screenshot reads the same.
 */
export const PREVIEW_AUTH_NOW = new Date(2025, 9, 14, 10, 0, 0);
const lastSunday = new Date(2025, 9, 12, 21, 12, 0).toISOString();
const lastSundayLate = new Date(2025, 9, 12, 22, 40, 0).toISOString();

const base = { isAdmin: false, clubhouseDashboard: true } as const;

export const PREVIEW_WELCOME_COACH: ChWelcome = {
  ...base,
  name: { status: 'named', display: 'Coach Reyes' },
  lastSeenAt: lastSunday,
  news: {
    first: false,
    failed: false,
    items: [
      { id: 'n1', category: 'messages', title: '4 new messages', body: 'Sofia, Eli and 2 others' },
      { id: 'n2', category: 'announcements', title: 'Jonah posted a round', body: '74 (+2) at Pine Needles' },
      { id: 'n3', category: 'events', title: '5 of 6 RSVPs for Pinehurst', body: 'Eli hasn’t replied yet' },
    ],
  },
};

export const PREVIEW_WELCOME_PLAYER: ChWelcome = {
  ...base,
  name: { status: 'named', display: 'Theo' },
  lastSeenAt: lastSundayLate,
  news: {
    first: false,
    failed: false,
    items: [
      { id: 'p1', category: 'announcements', title: 'Coach Reyes posted pairings', body: 'Pinehurst qualifier · off at 8:42' },
      { id: 'p2', category: 'coachhelm', title: 'New drill assigned', body: 'Lag putting from 30 feet' },
      { id: 'p3', category: 'messages', title: '2 team messages', body: 'Ava and Sofia' },
    ],
  },
};

export const PREVIEW_WELCOME_CAUGHT_UP: ChWelcome = { ...PREVIEW_WELCOME_COACH, news: { first: false, failed: false, items: [] } };
export const PREVIEW_WELCOME_FIRST: ChWelcome = { ...PREVIEW_WELCOME_COACH, lastSeenAt: null, news: { first: true, failed: false, items: [] } };
export const PREVIEW_WELCOME_FAILED: ChWelcome = { ...PREVIEW_WELCOME_COACH, news: { first: false, failed: true, items: [] } };
/** The name lookup failed: the greeting stands alone. */
export const PREVIEW_WELCOME_NO_NAME: ChWelcome = { ...PREVIEW_WELCOME_CAUGHT_UP, name: { status: 'anonymous' } };

/** The sign-in failures the design draws, each as the screen would show it. */
export const PREVIEW_FAILURES: Record<string, SignInFailure> = {
  empty: { message: 'Enter your email and password to sign in.', tone: 'danger', haptic: 'warning', field: 'email', code: 'CH-15101' },
  creds: failureFor(CREDENTIALS_MESSAGE),
  unverified: failureFor(UNVERIFIED_MESSAGE),
  rate: failureFor(RATE_LIMIT_MESSAGE),
  network: failureFor(NETWORK_MESSAGE),
  stale: failureFor(STALE_BUNDLE_MESSAGE),
};
