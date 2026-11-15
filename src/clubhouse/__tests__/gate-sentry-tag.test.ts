/**
 * @vitest-environment node
 *
 * Release review blocker 5: the browser tags a Clubhouse session `ui=clubhouse` (chTagSession, lib/track.ts), and
 * the server tags the request it draws Clubhouse for. Fairway is retired (2026-11-14); the tag stays because the
 * monitoring queries filter on it.
 * The tag goes on the isolation scope, which Sentry's HTTP server integration clones for each incoming request
 * (@sentry/core integrations/http/server-subscription.js), so it covers that request and no other.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const sentry = vi.hoisted(() => ({ setTag: vi.fn(), currentSetTag: vi.fn(), down: false }));
vi.mock('@sentry/nextjs', () => ({
  getIsolationScope: () => {
    if (sentry.down) throw new Error('sentry down');
    return { setTag: sentry.setTag };
  },
  getCurrentScope: () => ({ setTag: sentry.currentSetTag }),
  setTag: sentry.currentSetTag,
}));
const { isClubhouseFor, tagClubhouseRequest } = await import('../gate');

beforeEach(() => {
  sentry.down = false;
  sentry.setTag.mockClear();
  sentry.currentSetTag.mockClear();
});

describe('isClubhouseFor tags the server request ui=clubhouse (blocker 5)', () => {
  it('a coach or player decision tags the request’s isolation scope with the browser’s tag, name and value', async () => {
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(sentry.setTag).toHaveBeenLastCalledWith('ui', 'clubhouse');
    expect(await isClubhouseFor('player')).toBe(true);
    expect(sentry.setTag).toHaveBeenCalledTimes(2);
    // Not the current scope, which a nested withScope would drop before the error is captured.
    expect(sentry.currentSetTag).not.toHaveBeenCalled();
  });

  it('the dashboard layout tags its request directly', () => {
    tagClubhouseRequest();
    expect(sentry.setTag).toHaveBeenCalledWith('ui', 'clubhouse');
  });

  it('no role tags nothing', async () => {
    expect(await isClubhouseFor(null)).toBe(false);
    expect(await isClubhouseFor(undefined)).toBe(false);
    expect(sentry.setTag).not.toHaveBeenCalled();
  });

  it('a Sentry failure never changes the answer', async () => {
    sentry.down = true;
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(() => tagClubhouseRequest()).not.toThrow();
  });
});
