/**
 * Regression test for the durable, unload-safe partial-round save.
 *
 * Incident (2026-06-10): a player tracked 6 holes, the app was backgrounded /
 * the phone locked, the in-flight `void savePartialRound()` server-action fetch
 * was killed by the page freeze, and the round never reached the server — so it
 * never appeared in "Unfinished Rounds" and could not be resumed.
 *
 * `beaconPartialSave` fixes that by sending the unload-time save through
 * `navigator.sendBeacon` (guaranteed delivery during freeze/unload), falling
 * back to a `keepalive` fetch. These tests prove transport selection + that the
 * `{ data, roundId }` envelope the route handler expects is serialized exactly.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { beaconPartialSave, PARTIAL_SAVE_BEACON_ENDPOINT } from './partial-save-beacon';

// Minimal valid-shaped partial-round payload (only transport matters here).
const sampleData = {
  courseName: 'Test Course',
  roundType: 'practice',
  roundDate: '2026-06-16',
  currentHole: 7,
  holesToPlay: 18,
  holes: [],
  inProgressShots: [],
  holeConfigs: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('beaconPartialSave', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses navigator.sendBeacon when it accepts the payload (no fetch)', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const ok = beaconPartialSave(sampleData, 'round-123');

    expect(ok).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith(PARTIAL_SAVE_BEACON_ENDPOINT, expect.any(Blob));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to a keepalive fetch when sendBeacon is unavailable', () => {
    vi.stubGlobal('navigator', {});
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    const ok = beaconPartialSave(sampleData, 'round-123');

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(PARTIAL_SAVE_BEACON_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ data: sampleData, roundId: 'round-123' });
  });

  it('falls back to a keepalive fetch when sendBeacon rejects the payload', () => {
    const sendBeacon = vi.fn().mockReturnValue(false); // e.g. payload over the beacon cap
    vi.stubGlobal('navigator', { sendBeacon });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    const ok = beaconPartialSave(sampleData);

    expect(ok).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    // Omitted roundId (brand-new round) serializes as null, not undefined.
    expect(JSON.parse(init.body)).toEqual({ data: sampleData, roundId: null });
  });

  it('returns false when neither transport is available (localStorage is the backstop)', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', undefined);

    expect(beaconPartialSave(sampleData)).toBe(false);
  });
});
