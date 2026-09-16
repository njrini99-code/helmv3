import { describe, expect, it } from 'vitest';
import { enuToWgs84, localOriginFor } from '../geodesy';
import { ESTIMATOR_CONFIG, LocationBuffer, anchorConfidence, finalizeEstimate, maxEigenvalue2, provisionalLocation, type LocationSample } from '../location-estimator';

// SYNTHETIC TEST VECTOR: samples scattered around ENU (50, 30) by fixed offsets.
const origin = localOriginFor({ originWgs84: [-79.744, 42.06], projection: 'wgs84-local-enu-v1' });
function sample(e: number, n: number, tMs: number, acc: number, extra: Partial<LocationSample> = {}): LocationSample {
  const [lon, lat] = enuToWgs84([e, n, 0], origin);
  return { timestampMs: tMs, longitude: lon, latitude: lat, altitudeM: null, horizontalAccuracyM: acc, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic', ...extra };
}
const tap = 10_000;
function buffer(samples: LocationSample[]) { const b = new LocationBuffer(); for (const s of samples) b.push(s); return b; }

describe('one-tap location estimator', () => {
  it('weights the window by accuracy, floors sigma at 1.5 m and keeps every window sample', () => {
    const b = buffer([sample(50.4, 30.2, tap - 1200, 3), sample(49.7, 29.9, tap - 600, 3), sample(50.1, 30.1, tap - 100, 2), sample(49.9, 29.8, tap + 400, 2), sample(50.2, 30.0, tap + 700, 2)]);
    const e = finalizeEstimate(b, tap, origin)!;
    expect(Math.abs(e.positionENU[0] - 50)).toBeLessThan(.3);
    expect(Math.abs(e.positionENU[1] - 30)).toBeLessThan(.3);
    expect(e.sigmaM).toBeGreaterThanOrEqual(1.5);
    expect(e.sigmaM).toBe(Math.max(e.sigmaDeviceM, e.sigmaScatterM, 1.5));
    expect(e.windowSamples).toHaveLength(5);
    expect(e.usedSamples).toBe(5);
    expect(e.poorAccuracy).toBe(false);
    expect(e.covarianceENU2D[0][0]).toBeCloseTo(e.sigmaM ** 2, 9);
    expect(e.basis).toBe('weighted_mean_of_window');
  });
  it('drops stale, non-positive-accuracy and out-of-window samples, and rejects residual outliers', () => {
    const b = buffer([sample(500, 500, tap - 1900, 3), sample(50, 30, tap - 1400, 3, { horizontalAccuracyM: 0 }), sample(50, 30, tap - 1000, 3), sample(50.5, 30, tap - 200, 3),
      sample(80, 60, tap + 200, 3), sample(50, 29.5, tap + 600, 3), sample(50, 30, tap + 900, 1)]);
    const e = finalizeEstimate(b, tap, origin)!;
    expect(e.windowSamples).toHaveLength(4);
    expect(e.rejectedResiduals).toBe(1);
    expect(Math.abs(e.positionENU[0] - 50.2)).toBeLessThan(.3);
  });
  it('still estimates from poor samples and says so, and returns null with none', () => {
    const b = buffer([sample(50, 30, tap - 300, 40), sample(52, 31, tap + 300, 45)]);
    const e = finalizeEstimate(b, tap, origin)!;
    expect(e.poorAccuracy).toBe(true);
    expect(e.sigmaM).toBeGreaterThanOrEqual(40);
    expect(finalizeEstimate(new LocationBuffer(), tap, origin)).toBeNull();
    expect(finalizeEstimate(buffer([sample(50, 30, tap - 5000, 3)]), tap, origin)).toBeNull();
  });
  it('replays deterministically from the same raw packet', () => {
    const samples = [sample(50.3, 30.1, tap - 900, 4), sample(49.8, 30.4, tap - 300, 3), sample(50.0, 29.7, tap + 500, 3)];
    expect(finalizeEstimate(buffer(samples), tap, origin)).toEqual(finalizeEstimate(buffer([...samples].reverse()), tap, origin));
  });
  it('picks the most accurate recent fix for the provisional anchor', () => {
    const b = buffer([sample(50, 30, tap - 1400, 6), sample(50, 30, tap - 900, 2), sample(50, 30, tap - 100, 2), sample(50, 30, tap - 3000, 1)]);
    expect(provisionalLocation(b, tap)?.timestampMs).toBe(tap - 100);
    expect(provisionalLocation(new LocationBuffer(), tap)).toBeNull();
  });
  it('grades confidence from sigma and the lie posterior', () => {
    expect(anchorConfidence(3, .95)).toBe('HIGH');
    expect(anchorConfidence(4.5, .95)).toBe('MEDIUM');
    expect(anchorConfidence(3, .8)).toBe('MEDIUM');
    expect(anchorConfidence(9, .99)).toBe('LOW');
    expect(anchorConfidence(3, .6)).toBe('LOW');
    expect(ESTIMATOR_CONFIG.kAcc).toBe(1);
    expect(maxEigenvalue2([[4, 0], [0, 9]])).toBe(9);
  });
});
