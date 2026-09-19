import { describe, expect, it } from 'vitest';
import { projectToLocal } from '@/lib/golf/course-geometry/project';
import { UNSPECIFIED, ecefToWgs84, enuToWgs84, localOriginFor, toRenderFloat32, wgs84ToEcef, wgs84ToEnu, wgs84ToEnuInFrame, LOCAL_FRAME_RADIUS_M } from '../geodesy';

// SYNTHETIC TEST VECTOR: the package origin is real, the points are made up.
const origin = localOriginFor({ originWgs84: [-79.744, 42.06], projection: 'wgs84-local-enu-v1' });

describe('one-tap geodesy', () => {
  it('keeps the origin height UNSPECIFIED and builds the frame at zero height', () => {
    expect(origin.ellipsoidHeightM).toBe(UNSPECIFIED);
    expect(wgs84ToEnu([-79.744, 42.06, null], origin)).toEqual([0, 0, 0]);
  });
  it('agrees with the package projection on E/N to float precision', () => {
    for (const point of [[-79.7422244, 42.051964], [-79.75, 42.065], [-79.74, 42.055]] as const) {
      const [e, n] = wgs84ToEnu([point[0], point[1], null], origin), [pe, pn] = projectToLocal(point, [-79.744, 42.06]);
      expect(Math.abs(e - pe)).toBeLessThan(1e-6);
      expect(Math.abs(n - pn)).toBeLessThan(1e-6);
    }
  });
  it('round-trips ECEF and ENU below a millimetre', () => {
    const p = [-79.7422244, 42.051964, 480] as const;
    const back = ecefToWgs84(wgs84ToEcef(p));
    expect(Math.abs(back[0] - p[0])).toBeLessThan(1e-9);
    expect(Math.abs(back[1] - p[1])).toBeLessThan(1e-9);
    expect(Math.abs(back[2] - p[2])).toBeLessThan(1e-3);
    const enu = wgs84ToEnu(p, origin), again = enuToWgs84(enu, origin);
    expect(Math.abs(again[0] - p[0])).toBeLessThan(1e-9);
    expect(Math.abs(again[1] - p[1])).toBeLessThan(1e-9);
    expect(Math.abs(again[2] - p[2])).toBeLessThan(1e-3);
  });
  it('measures a northward step in metres and hands the renderer float32', () => {
    const north = enuToWgs84([0, 100, 0], origin);
    const enu = wgs84ToEnu([north[0], north[1], north[2]], origin);
    expect(Math.abs(enu[0])).toBeLessThan(1e-6);
    expect(Math.abs(enu[1] - 100)).toBeLessThan(1e-6);
    expect(Array.from(toRenderFloat32([[1.5, 2.5, 3.5]]))).toEqual([1.5, 2.5, 3.5]);
  });
  it('refuses invalid coordinates and a frame beyond 5 km', () => {
    expect(() => wgs84ToEnu([200, 0, null], origin)).toThrow('Invalid WGS84');
    expect(() => wgs84ToEnu([-79.744, 42.2, null], origin)).toThrow('5 km');
    expect(() => localOriginFor({ originWgs84: [0, 0], projection: 'other' as never })).toThrow('projection');
  });
  it('reports a live fix outside the frame as null instead of throwing (the drive in must not crash the round)', () => {
    // 42.2° N is ~15 km north of the origin: a phone still on the road.
    expect(wgs84ToEnuInFrame([-79.744, 42.2, null], origin)).toBeNull();
    expect(wgs84ToEnuInFrame([200, 0, null], origin)).toBeNull();
    expect(wgs84ToEnuInFrame([Number.NaN, 42.06, null], origin)).toBeNull();
    expect(wgs84ToEnuInFrame([-79.744, 42.06, Number.NaN], origin)).toBeNull();
    const near = wgs84ToEnuInFrame([-79.744, 42.061, null], origin);
    expect(near).not.toBeNull();
    expect(Math.abs(near![1] - 111)).toBeLessThan(1);
    expect(LOCAL_FRAME_RADIUS_M).toBe(5000);
  });
});
