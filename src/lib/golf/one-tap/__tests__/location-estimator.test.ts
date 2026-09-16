import { describe, expect, it } from 'vitest';
import { enuToWgs84, localOriginFor } from '../geodesy';
import { ESTIMATOR_CONFIG, LocationBuffer, anchorConfidence, finalizeEstimate, floorCovariance, maxEigenvalue2, minEigenvalue2, provisionalLocation, type LocationSample } from '../location-estimator';

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
    expect(e.sigmaM).toBeGreaterThanOrEqual(Math.max(e.sigmaDeviceM, e.sigmaScatterM, 1.5));
    expect(e.sigmaM ** 2).toBeCloseTo(maxEigenvalue2(e.covarianceENU2D), 9);
    expect(e.windowSamples).toHaveLength(5);
    expect(e.usedSamples).toBe(5);
    expect(e.poorAccuracy).toBe(false);
    expect(e.basis).toBe('weighted_mean_of_window');
    expect(e.captureMotion).toBe('stationary');
  });
  it('fuses the full weighted scatter with the calibrated device term, cross-covariance included (§35)', () => {
    // Equal-weight fixes on the NE diagonal about (50, 30): scatter is rank one along the diagonal.
    const b = buffer([sample(48, 28, tap - 1200, 3), sample(52, 32, tap - 800, 3), sample(49, 29, tap - 400, 3), sample(51, 31, tap + 200, 3)]);
    const e = finalizeEstimate(b, tap, origin)!;
    expect(e.covarianceScatterENU2D[0][0]).toBeCloseTo(2.5, 2);
    expect(e.covarianceScatterENU2D[1][1]).toBeCloseTo(2.5, 2);
    expect(e.covarianceScatterENU2D[0][1]).toBeCloseTo(2.5, 2);
    expect(e.covarianceScatterENU2D[1][0]).toBe(e.covarianceScatterENU2D[0][1]);
    expect(e.covarianceDeviceENU2D).toEqual([[9, 0], [0, 9]]);
    expect(e.covarianceENU2D[0][0]).toBeCloseTo(11.5, 2);
    expect(e.covarianceENU2D[0][1]).toBeCloseTo(2.5, 2);
    expect(e.sigmaM).toBeCloseTo(Math.sqrt(14), 2);
    expect(e.sigmaScatterM).toBeCloseTo(Math.sqrt(2.5), 2);
    // The NW diagonal flips the sign of the cross term.
    const f = finalizeEstimate(buffer([sample(48, 32, tap - 1200, 3), sample(52, 28, tap - 800, 3), sample(49, 31, tap - 400, 3), sample(51, 29, tap + 200, 3)]), tap, origin)!;
    expect(f.covarianceScatterENU2D[0][1]).toBeCloseTo(-2.5, 2);
    expect(f.covarianceENU2D[0][1]).toBeCloseTo(-2.5, 2);
  });
  it('floors the smallest axis at 1.5 m without losing orientation', () => {
    const e = finalizeEstimate(buffer([sample(50, 30, tap - 600, .5), sample(50, 30, tap - 200, .5), sample(50, 30, tap + 300, .5)]), tap, origin)!;
    expect(e.covarianceENU2D).toEqual([[2.25, 0], [0, 2.25]]);
    expect(e.sigmaM).toBe(1.5);
    const floored = floorCovariance([[11.5, 2.5], [2.5, 11.5]], 1.5);
    expect(floored).toEqual([[11.5, 2.5], [2.5, 11.5]]);
    const raised = floorCovariance([[2.5, 2.5], [2.5, 2.5]], 1.5);
    expect(minEigenvalue2(raised)).toBeCloseTo(2.25, 9);
    expect(raised[0][1]).toBe(2.5);
  });
  it('retains the reported radius separately from the calibrated device term and flags kAcc provisional', () => {
    const b = buffer([sample(50, 30, tap - 600, 3), sample(50.2, 30.1, tap - 200, 4), sample(49.9, 30, tap + 300, 3)]);
    const e = finalizeEstimate(b, tap, origin, { ...ESTIMATOR_CONFIG, kAcc: 2 })!;
    expect(e.reportedRadiusM).toBe(3);
    expect(e.medianAccuracyM).toBe(3);
    expect(e.sigmaDeviceM).toBe(6);
    expect(e.covarianceDeviceENU2D).toEqual([[36, 0], [0, 36]]);
    expect(e.kAcc).toBe(2);
    expect(finalizeEstimate(b, tap, origin)!.kAccCalibration).toBe('provisional');
    expect(ESTIMATOR_CONFIG.kAcc).toBe(1);
    expect(ESTIMATOR_CONFIG.kAccCalibration).toBe('provisional');
  });
  it('reads capture motion from reported speed and from displacement (§36)', () => {
    const still = (speed: number | null) => buffer([sample(50, 30.2, tap - 1200, 3, { speedMps: speed }), sample(50.3, 30, tap - 500, 3, { speedMps: speed }), sample(49.9, 29.9, tap + 300, 3, { speedMps: speed })]);
    expect(finalizeEstimate(still(.3), tap, origin)!.captureMotion).toBe('stationary');
    expect(finalizeEstimate(still(1.2), tap, origin)!.captureMotion).toBe('settling');
    expect(finalizeEstimate(still(2.5), tap, origin)!.captureMotion).toBe('moving');
    // No reported speed: fixes within the jitter floor are stationary…
    expect(finalizeEstimate(still(null), tap, origin)!.captureMotion).toBe('stationary');
    // …a single fix is unknown…
    expect(finalizeEstimate(buffer([sample(50, 30, tap - 100, 3)]), tap, origin)!.captureMotion).toBe('unknown');
    // …and a 6 m march over 2.1 s is moving even though every fix is inside the residual limit.
    const march = buffer([sample(44, 30, tap - 1400, 3), sample(46, 30, tap - 700, 3), sample(48, 30, tap, 3), sample(50, 30, tap + 700, 3)]);
    const e = finalizeEstimate(march, tap, origin)!;
    expect(e.usedSamples).toBe(4);
    expect(e.captureMotion).toBe('moving');
    expect(e.motion.displacementM).toBeCloseTo(6, 2);
    expect(e.motion.displacementSpeedMps).toBeCloseTo(6 / 2.1, 2);
    expect(e.motion.reportedSpeedMps).toBeNull();
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
    // §36: a moving capture saves one grade lower; settling keeps its grade.
    expect(anchorConfidence(3, .95, ESTIMATOR_CONFIG, 'moving')).toBe('MEDIUM');
    expect(anchorConfidence(4.5, .95, ESTIMATOR_CONFIG, 'moving')).toBe('LOW');
    expect(anchorConfidence(3, .95, ESTIMATOR_CONFIG, 'settling')).toBe('HIGH');
    expect(maxEigenvalue2([[4, 0], [0, 9]])).toBe(9);
    expect(maxEigenvalue2([[11.5, 2.5], [2.5, 11.5]])).toBeCloseTo(14, 9);
    expect(minEigenvalue2([[11.5, 2.5], [2.5, 11.5]])).toBeCloseTo(9, 9);
  });
});
