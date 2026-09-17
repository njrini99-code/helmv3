import { describe, expect, it } from 'vitest';
import { MOTION_CONFIG, QUALITY_CONFIG, classifyCaptureMotion, confidenceForMotion, gradeLocationQuality, isApproximateFix, type TimedPoint } from '../location-quality';

const point = (t: number, e: number, n: number, speed: number | null = null): TimedPoint => ({ timestampMs: t, positionENU: [e, n], speedMps: speed });

describe('one-tap location quality', () => {
  it('classifies motion from the median reported speed at the §36 thresholds', () => {
    const at = (speed: number) => classifyCaptureMotion([point(0, 0, 0, speed), point(1000, 0, 0, speed), point(2000, 0, 0, speed)], 3);
    expect(at(0).captureMotion).toBe('stationary');
    expect(at(MOTION_CONFIG.stationarySpeedMps).captureMotion).toBe('stationary');
    expect(at(1.2).captureMotion).toBe('settling');
    expect(at(MOTION_CONFIG.settlingSpeedMps).captureMotion).toBe('settling');
    expect(at(1.81).captureMotion).toBe('moving');
    // The median resists one noisy speed sample; negative or non-finite speeds are ignored.
    expect(classifyCaptureMotion([point(0, 0, 0, .2), point(1000, 0, 0, 5), point(2000, 0, 0, .3), point(2500, 0, 0, -1), point(2600, 0, 0, Number.NaN)], 3).captureMotion).toBe('stationary');
  });
  it('reads displacement beyond the jitter floor when the receiver reports no speed', () => {
    // 4 m of drift inside the 4.5 m floor (1.5 × a 3 m radius) over 2 s: stationary, not settling.
    const drift = classifyCaptureMotion([point(0, 0, 0), point(2000, 4, 0)], 3);
    expect(drift).toEqual({ captureMotion: 'stationary', reportedSpeedMps: null, displacementSpeedMps: 0, displacementM: 4 });
    // 6 m over 2 s clears the floor: 3 m/s is moving.
    expect(classifyCaptureMotion([point(0, 0, 0), point(2000, 6, 0)], 3)).toMatchObject({ captureMotion: 'moving', displacementSpeedMps: 3, displacementM: 6 });
    // A poor fix raises the floor with its radius, so the same 6 m is jitter at 10 m accuracy.
    expect(classifyCaptureMotion([point(0, 0, 0), point(2000, 6, 0)], 10).captureMotion).toBe('stationary');
    // A sharp fix keeps the 3 m floor.
    expect(classifyCaptureMotion([point(0, 0, 0), point(2000, 3.5, 0)], 1).captureMotion).toBe('settling');
    // Under the minimum span there is no positional evidence at all.
    expect(classifyCaptureMotion([point(0, 0, 0), point(400, 4, 0)], 3)).toEqual({ captureMotion: 'unknown', reportedSpeedMps: null, displacementSpeedMps: null, displacementM: null });
    expect(classifyCaptureMotion([], 3).captureMotion).toBe('unknown');
    // Reported speed and displacement are both read; the larger wins.
    expect(classifyCaptureMotion([point(0, 0, 0, .1), point(2000, 6, 0, .1)], 3).captureMotion).toBe('moving');
    expect(classifyCaptureMotion([point(0, 0, 0, 2.5), point(2000, 0, 0, 2.5)], 3).captureMotion).toBe('moving');
  });
  it('drops a moving capture one confidence grade and leaves the rest alone', () => {
    expect(confidenceForMotion('HIGH', 'moving')).toBe('MEDIUM');
    expect(confidenceForMotion('MEDIUM', 'moving')).toBe('LOW');
    expect(confidenceForMotion('LOW', 'moving')).toBe('LOW');
    expect(confidenceForMotion('HIGH', 'settling')).toBe('HIGH');
    expect(confidenceForMotion('HIGH', 'stationary')).toBe('HIGH');
    expect(confidenceForMotion('HIGH', 'unknown')).toBe('HIGH');
  });
  it('grades the live fix for the HUD: good is silent, the rest earn the chip', () => {
    const now = 50_000;
    const fix = (acc: number, ageMs = 1000) => ({ timestampMs: now - ageMs, horizontalAccuracyM: acc });
    expect(gradeLocationQuality(fix(QUALITY_CONFIG.goodAccuracyM), now, 'watching')).toBe('good');
    expect(gradeLocationQuality(fix(12), now, 'watching')).toBe('fair');
    expect(gradeLocationQuality(fix(QUALITY_CONFIG.fairAccuracyM), now, 'watching')).toBe('fair');
    expect(gradeLocationQuality(fix(40), now, 'watching')).toBe('poor');
    expect(gradeLocationQuality(fix(3, QUALITY_CONFIG.staleAfterMs + 1), now, 'watching')).toBe('stale');
    expect(gradeLocationQuality(fix(3), now, 'paused')).toBe('stale');
    expect(gradeLocationQuality(fix(3), now, 'reacquiring')).toBe('stale');
    // A timeout keeps the last good fix until it ages out.
    expect(gradeLocationQuality(fix(3), now, 'timeout')).toBe('good');
    expect(gradeLocationQuality(fix(3), now, 'denied')).toBe('none');
    expect(gradeLocationQuality(fix(3), now, 'unavailable')).toBe('none');
    expect(gradeLocationQuality(null, now, 'watching')).toBe('none');
    expect(gradeLocationQuality(fix(0), now, null)).toBe('none');
    expect(gradeLocationQuality(fix(5), now)).toBe('good');
  });
  it('a reduced-precision fix is approximate at any age, never weak or stale (Peek\u2019n Peak 2026-09-17: Precise Location off on the 9th green)', () => {
    const now = 50_000;
    const fix = (acc: number, ageMs = 1000) => ({ timestampMs: now - ageMs, horizontalAccuracyM: acc });
    expect(isApproximateFix(fix(QUALITY_CONFIG.approximateAccuracyM))).toBe(false);
    expect(isApproximateFix(fix(QUALITY_CONFIG.approximateAccuracyM + 1))).toBe(true);
    expect(gradeLocationQuality(fix(3200), now, 'watching')).toBe('approximate');
    // Reduced precision arrives a few times an hour: an old coarse fix is still coarse, not "weak".
    expect(gradeLocationQuality(fix(3200, 20 * 60_000), now, 'watching')).toBe('approximate');
    expect(gradeLocationQuality(fix(3200), now, 'paused')).toBe('approximate');
    expect(gradeLocationQuality(fix(3200), now, 'denied')).toBe('none');
    expect(gradeLocationQuality(fix(QUALITY_CONFIG.approximateAccuracyM), now, 'watching')).toBe('poor');
  });
});
