import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { projectToLocal, toScreen, fromScreen, rotate, fitCamera } from '../project';
import { parseGeometryPackage } from '../schema';
import { buildHoleScene } from '../build-scene';
import { inFeature, ringArea } from '../spatial';
import { checkedAnchor } from '../quality';
import type { DiagramEvent, LocalFeature, PointM } from '../types';
import { normalizePersistedShot } from '../normalize';
import data from '@/test/fixtures/course-geometry/cacapon.json';
import { sceneCamera } from '@/components/golf/course-geometry/CourseHoleScene';

const distance = (a: PointM, b: PointM) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pkg = parseGeometryPackage(data);
const square = (id: string, x: number): LocalFeature => ({ id, kind: 'bunker', type: 'Polygon', reviewed: true,
  parts: [[[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]]] });

describe('physical scale, coordinates and topology', () => {
  it('350 yd reference: a known 150 yd collinear segment renders 120px of 280px', () => {
    const camera = { scale: 0.8 / 0.9144, angle: 0, translation: [20, 300] as PointM };
    const start: PointM = [0, 0], end: PointM = [0, 150 * 0.9144], target: PointM = [0, 350 * 0.9144];
    expect(distance(toScreen(start, camera), toScreen(end, camera))).toBeCloseTo(120, 10);
    expect(distance(toScreen(start, camera), toScreen(target, camera))).toBeCloseTo(280, 10);
    expect(distance(start, end) / distance(start, target)).toBeCloseTo(150 / 350, 12);
    expect(distance(end, target)).toBeCloseTo(200 * 0.9144, 10);
  });
  it('same 200 yd remaining permits 150 yd and 180 yd displacements', () => {
    const y = (350 ** 2 + 180 ** 2 - 200 ** 2) / (2 * 350);
    const x = Math.sqrt(180 ** 2 - y ** 2);
    expect(distance([x, y], [0, 350])).toBeCloseTo(200, 10);
    expect(distance([0, 150], [0, 350])).toBe(200);
    expect(distance([0, 0], [x, y])).toBeCloseTo(180, 10);
  });
  it('preserves all distances under rotation/uniform scale and inverse transform', () => {
    fc.assert(fc.property(fc.tuple(fc.double({ min: -500, max: 500, noNaN: true }), fc.double({ min: -500, max: 500, noNaN: true })),
      fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.double({ min: 0.05, max: 5, noNaN: true }),
      (point, angle, scale) => {
        const t = { scale, angle, translation: [22, 37] as PointM };
        expect(distance(toScreen(point, t), toScreen([80, -20], t))).toBeCloseTo(distance(point, [80, -20]) * scale, 8);
        expect(distance(point, fromScreen(toScreen(point, t), t))).toBeLessThan(1e-8);
      }), { seed: 1937, numRuns: 200 });
  });
  it('abstract collinear 20ft/5ft short and long cases keep 15ft/25ft connections', () => {
    // Analytic fixtures only: categorical input alone does not establish these bearings.
    const foot = 0.3048, cup: PointM = [0, 0], start: PointM = [0, -20 * foot];
    for (const [end, length] of [[[0, -5 * foot], 15], [[0, 5 * foot], 25]] as const) {
      expect(distance(end, cup) / foot).toBeCloseTo(5, 12);
      expect(distance(start, end) / foot).toBeCloseTo(length, 12);
    }
    const camera = { scale: 4 / foot, angle: 0, translation: [40, 100] as PointM };
    const leave: PointM = [0, -foot];
    expect(distance(toScreen(leave, camera), toScreen(cup, camera))).toBeCloseTo(4, 12);
    // A readable label 24px away cannot enlarge the one-foot anchor radius.
    const label: PointM = [64, 104];
    expect(distance(label, toScreen(leave, camera))).toBe(24);
    expect(distance(leave, cup) / foot).toBe(1);
  });
  it('projects WGS84 to east/north metres without raw-degree buffers', () => {
    expect(projectToLocal([0, 0], [0, 0])).toEqual([0, 0]);
    expect(projectToLocal([0.001, 0], [0, 0])[0]).toBeCloseTo(111.3194908, 5);
    expect(projectToLocal([0, 0.001], [0, 0])[1]).toBeCloseTo(110.5742758, 5);
    expect(() => projectToLocal([1, 0], [0, 0])).toThrow('5 km');
  });
  it('rejects empty and degenerate cameras', () => {
    expect(() => fitCamera([], 320, 380, 0)).toThrow();
    expect(() => fitCamera([[0, 0]], 320, 380, 0)).toThrow();
    expect(() => fitCamera([[0, 0], [0, 50]], 10, 10, 0)).toThrow();
  });
  it('supports disconnected surfaces and excludes polygon holes', () => {
    const f = square('multi', 0);
    f.type = 'MultiPolygon';
    f.parts[0]!.push([[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]);
    f.parts.push(square('second', 20).parts[0]!);
    expect(inFeature([3, 3], f)).toBe(false);
    expect(inFeature([1, 1], f)).toBe(true);
    expect(inFeature([25, 5], f)).toBe(true);
    expect(inFeature([15, 5], f)).toBe(false);
  });
  it('keeps short-left and long-left signs in the player frame through every rotation', () => {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.77]) {
      const left = rotate([-1, 0], angle), forward = rotate([0, 1], angle);
      for (const [point, sign] of [[[-20, -20], -1], [[-20, 20], 1]] as const) {
        const rotated = rotate(point, angle);
        expect(rotated[0] * left[0] + rotated[1] * left[1]).toBeGreaterThan(0);
        expect(Math.sign(rotated[0] * forward[0] + rotated[1] * forward[1])).toBe(sign);
      }
    }
  });
  it('all 18 holes retain identical geometry and green proportions in every viewport', () => {
    for (const hole of pkg.holes) {
      const scene = buildHoleScene(pkg, hole.key);
      for (const [mode, width, height] of [['review', 320, 380], ['compact', 320, 168], ['strip', 48, 140]] as const) {
        const camera = sceneCamera(scene, width, height, mode);
        for (const f of scene.features) for (const rings of f.parts) for (const ring of rings) {
          for (const point of ring) expect(distance(point, fromScreen(toScreen(point, camera), camera))).toBeLessThan(1e-8);
          if (f.kind === 'green') expect(ringArea(ring.map(p => toScreen(p, camera))) / ringArea(ring)).toBeCloseTo(camera.scale ** 2, 8);
        }
      }
    }
  });
  it('excludes neighboring-hole bunkers and frames the reviewed hole prominently', () => {
    const scene = buildHoleScene(pkg, 'cacapon-07');
    expect(scene.features.filter(f => f.kind === 'bunker').map(f => f.id).sort()).toEqual(
      ['osm-way-885719197', 'osm-way-885719198', 'osm-way-885719199', 'osm-way-885719200']);
    for (const [mode, height] of [['review', 380], ['compact', 320]] as const) {
      const camera = sceneCamera(scene, 320, height, mode);
      const points = scene.features.flatMap(f => f.parts.flat(2)).map(p => toScreen(p, camera));
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      expect((Math.max(...xs) - Math.min(...xs)) / 320).toBeGreaterThan(0.8);
      expect((Math.max(...ys) - Math.min(...ys)) / height).toBeGreaterThan(0.8);
    }
  });
  it('retains the real shared green of holes 4 and 8 and never stretches routes to scorecards', () => {
    expect(pkg.holes[3]!.greenFeatureId).toBe(pkg.holes[7]!.greenFeatureId);
    const changed = structuredClone(pkg); changed.holes[0]!.scorecardYards = 1000;
    expect(buildHoleScene(changed, 'cacapon-01').features).toEqual(buildHoleScene(pkg, 'cacapon-01').features);
  });
  it.each(['duplicate', 'source', 'green', 'ring', 'nan', 'kind'] as const)('rejects malformed %s packages', kind => {
    const bad = structuredClone(data);
    if (kind === 'duplicate') bad.features.push(bad.features[0]!);
    if (kind === 'source') bad.features[0]!.sourceIds = ['missing'];
    if (kind === 'green') bad.holes[0]!.nominalTargetWgs84 = [-78.30, 39.52];
    if (kind === 'ring') bad.features.find(f => f.kind === 'green')!.geometryWgs84.coordinates = [[[-78.296, 39.512], [-78.295, 39.513], [-78.296, 39.513], [-78.295, 39.512], [-78.296, 39.512]]];
    if (kind === 'nan') bad.originWgs84 = [NaN, 39];
    if (kind === 'kind') bad.features[0]!.kind = 'bunker';
    expect(() => parseGeometryPackage(bad)).toThrow();
  });
});

describe('fixture anchor safety at the SVG boundary', () => {
  const evidence = normalizePersistedShot({ shot_number: 2, result: 'sand', distance_to_hole_after: 18, distance_unit_after: 'yards', miss_direction: 'short_left' });
  const event: DiagramEvent = { evidence, anchorM: [5, 5], placement: 'compatible_estimate',
    inferredSurfaceFeatureId: 'b1', candidateFeatureIds: ['b1'], reasons: [] };
  it('retains a supplied compatible anchor inside its reviewed bunker', () => {
    expect(checkedAnchor(event, [square('b1', 0)])).toEqual([5, 5]);
  });
  it('two bunkers, outside-sand, unreviewed, and partial rough/Other have no physical assertion', () => {
    expect(checkedAnchor({ ...event, candidateFeatureIds: ['b1', 'b2'] }, [square('b1', 0), square('b2', 20)])).toBeNull();
    expect(checkedAnchor({ ...event, anchorM: [18, 5] }, [square('b1', 0)])).toBeNull();
    expect(checkedAnchor(event, [{ ...square('b1', 0), reviewed: false }])).toBeNull();
    for (const result of ['rough', 'other', 'hole']) expect(checkedAnchor({ ...event, evidence: { ...evidence, result } }, [square('b1', 0)])).toBeNull();
  });
});
