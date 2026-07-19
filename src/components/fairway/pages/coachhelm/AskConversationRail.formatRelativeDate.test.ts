/**
 * Regression test for the Ask page hydration mismatch (React error #418,
 * firing on every load of /golf/dashboard/coachhelm/chat):
 *
 * `formatRelativeDate`'s `>7d` branch used to call
 * `toLocaleDateString(undefined, { month: 'short', day: 'numeric' })` — an
 * UNPINNED locale + timezone. `undefined` resolves the SERVER process's
 * ambient locale/TZ during SSR and the BROWSER's during client hydration, so
 * a thread last updated near a day boundary rendered a DIFFERENT calendar
 * day server-side vs client-side (the same "Jun 1" vs "May 28" class of bug
 * already fixed for calendar times in FairwayBrief.formatAnalyzed).
 *
 * The fix pins BOTH the locale (`en-US`) and the timeZone (`UTC`) explicitly,
 * so the string is a pure function of the ISO input — identical no matter
 * which environment (or which environment's ambient TZ) renders it. This
 * test pins that contract directly by stubbing `TZ` the way the calendar fix
 * test does, standing in for "server env" vs "client env" divergence.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatRelativeDate } from './AskConversationRail';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('AskConversationRail formatRelativeDate (hydration mismatch fix)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('renders the same calendar day regardless of the runtime TZ (>7d branch)', () => {
    // Anchor "now" so the timestamp under test always lands past the 7-day
    // relative window and into the absolute-date branch.
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const iso = '2026-06-01T23:30:00Z';

    vi.stubEnv('TZ', 'UTC');
    const serverLike = formatRelativeDate(iso);

    vi.stubEnv('TZ', 'Etc/GMT+12'); // UTC-12 — a real west-of-UTC browser TZ
    const clientLikeWest = formatRelativeDate(iso);

    vi.stubEnv('TZ', 'Etc/GMT-14'); // UTC+14 — a real east-of-UTC browser TZ
    const clientLikeEast = formatRelativeDate(iso);

    expect(serverLike).toBe('Jun 1');
    expect(clientLikeWest).toBe(serverLike);
    expect(clientLikeEast).toBe(serverLike);
  });

  it('uses en-US month/day formatting regardless of runtime default locale', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const iso = '2026-01-05T00:00:00Z';
    expect(formatRelativeDate(iso)).toBe('Jan 5');
  });

  it('still returns the near-term relative buckets for recent timestamps', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatRelativeDate(new Date(now - 30 * 1000).toISOString())).toBe('now');
    expect(formatRelativeDate(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5m');
    expect(formatRelativeDate(new Date(now - 3 * 60 * 60 * 1000).toISOString())).toBe('3h');
    expect(formatRelativeDate(new Date(now - 2 * DAY_MS).toISOString())).toBe('2d');
  });

  it('returns empty string for an invalid ISO string', () => {
    expect(formatRelativeDate('not-a-date')).toBe('');
  });
});
