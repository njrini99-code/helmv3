import { describe, expect, it } from 'vitest';
import { PRESENTATION_CONFIG, acceptPlayerFix, playerFixFromSample, tickPlayerPresentation, type PlayerFix } from '../player-presentation';
import { enuToWgs84, localOriginFor } from '../geodesy';

const fix = (e: number, n: number, t: number, acc = 3): PlayerFix => ({ positionENU: [e, n], accuracyM: acc, timestampMs: t });

describe('YOU presentation position (§37)', () => {
  it('snaps to the first fix, ignores jitter inside the deadband and eases toward a real move', () => {
    const first = acceptPlayerFix(null, fix(10, 10, 0));
    expect(first).toMatchObject({ positionENU: [10, 10], targetENU: [10, 10], accuracyM: 3, pending: null });
    const jitter = acceptPlayerFix(first, fix(10.6, 10.4, 1000));
    expect(jitter.targetENU).toEqual([10, 10]);
    expect(tickPlayerPresentation(jitter, 1500)).toBe(jitter);
    const walking = acceptPlayerFix(jitter, fix(14, 10, 2000));
    expect(walking.targetENU).toEqual([14, 10]);
    expect(walking.positionENU).toEqual([10, 10]);
    const half = tickPlayerPresentation(walking, 2000 + PRESENTATION_CONFIG.timeConstantMs);
    expect(half.positionENU[0]).toBeCloseTo(10 + 4 * (1 - Math.exp(-1)), 6);
    expect(half.positionENU[1]).toBe(10);
    const settled = tickPlayerPresentation(half, 2000 + 10 * PRESENTATION_CONFIG.timeConstantMs);
    expect(settled.positionENU).toEqual([14, 10]);
    expect(tickPlayerPresentation(settled, 20_000)).toBe(settled);
    expect(tickPlayerPresentation(walking, 1500)).toBe(walking);
  });
  it('smooths the halo radius and keeps the evidence out of it', () => {
    const a = acceptPlayerFix(null, fix(0, 0, 0, 3));
    const b = acceptPlayerFix(a, fix(0.2, 0, 2000, 9));
    expect(b.accuracyM).toBeCloseTo(3 + 6 * (1 - Math.exp(-1)), 6);
    expect(b.positionENU).toEqual([0, 0]);
  });
  it('gates an implausible jump behind a confirming fix, then snaps instead of walking', () => {
    const at = acceptPlayerFix(null, fix(0, 0, 0));
    // 120 m in one second cannot be a golfer or a cart: hold, remember the fix.
    const held = acceptPlayerFix(at, fix(120, 0, 1000));
    expect(held.positionENU).toEqual([0, 0]);
    expect(held.targetENU).toEqual([0, 0]);
    expect(held.pending).toEqual(fix(120, 0, 1000));
    // A second fix that agrees confirms it: the marker snaps there, no easing.
    const confirmed = acceptPlayerFix(held, fix(123, 1, 2000));
    expect(confirmed).toMatchObject({ positionENU: [123, 1], targetENU: [123, 1], pending: null });
    expect(tickPlayerPresentation(confirmed, 2500)).toBe(confirmed);
    // A second fix that disagrees replaces the pending one and the marker still holds.
    const disagree = acceptPlayerFix(held, fix(-90, 40, 2000));
    expect(disagree.positionENU).toEqual([0, 0]);
    expect(disagree.pending).toEqual(fix(-90, 40, 2000));
    // A plausible large move (a cart over 30 s) snaps at once.
    const cart = acceptPlayerFix(at, fix(150, 0, 30_000));
    expect(cart).toMatchObject({ positionENU: [150, 0], pending: null });
  });
  it('converts a sample to a fix in the hole frame and refuses one without a radius', () => {
    const origin = localOriginFor({ originWgs84: [-79.744, 42.06], projection: 'wgs84-local-enu-v1' });
    const [lon, lat] = enuToWgs84([30, 40, 0], origin);
    const sample = { timestampMs: 5, longitude: lon, latitude: lat, altitudeM: null, horizontalAccuracyM: 4, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' as const };
    const f = playerFixFromSample(sample, origin)!;
    expect(f.positionENU[0]).toBeCloseTo(30, 3);
    expect(f.positionENU[1]).toBeCloseTo(40, 3);
    expect(f).toMatchObject({ accuracyM: 4, timestampMs: 5 });
    expect(playerFixFromSample({ ...sample, horizontalAccuracyM: 0 }, origin)).toBeNull();
  });
});
