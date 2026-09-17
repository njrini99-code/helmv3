import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { compileFieldAtlas } from '../field-atlas';
import {
  assertGreenSurfaceSample,
  GREEN_MICRO_NORMAL,
  GREEN_MICRO_NORMAL_MAX_SLOPE,
  GREEN_SURFACE_GLSL_NAMES,
  greenBandsAt,
  greenMicroNormalAt,
  greenSurfaceShaderChunk,
} from '../green-surface-v2';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';
import { MERIDIAN_STYLE } from '../visual-style';

// Helpers below mirror field-atlas.test.ts's (not imported: this test owns
// its own synthetic world, the same file-ownership convention
// bunker-normal-field.test.ts documents).
const circle = (cx: number, cy: number, r: number, n = 256): PointM[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as PointM);
const rectangle = (x0: number, y0: number, x1: number, y1: number): PointM[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
function sceneWith(features: LocalFeature[]): HoleScene {
  return {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: null },
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: features.map(f => f.id), routeFeatureId: null, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features, events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
}
function syntheticGrid(height: (x: number, y: number) => number, half: number, spacingM = 1): MetricTerrainGrid {
  const size = half * 2 + 1, originM: [number, number] = [-half, -half];
  const heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(originM[0] + column * spacingM, originM[1] + row * spacingM));
  return { originM, spacingM, columns: size, rows: size, heightsM };
}
function meshWith(grid?: MetricTerrainGrid): TerrainMesh {
  return { metricGrid: grid } as unknown as TerrainMesh;
}

// A green (r = 8 m, centred at the origin) with fringe outside it (§32) and a
// fairway edge at x = 13 giving an apron neck between fringe and fairway
// (§33). Bounds/targetSize give a 0.1 m texel — fine enough that a 256-gon's
// own facet error against a true circle is negligible against the
// tolerances below.
const GREEN_ONLY = sceneWith([feature('green-1', 'green', circle(0, 0, 8))]);
const GREEN_AND_FAIRWAY = sceneWith([feature('green-1', 'green', circle(0, 0, 8)), feature('fairway-1', 'fairway', rectangle(13, -50, 200, 50))]);
const BOUNDS: [number, number, number, number] = [-15, -15, 25, 15];
const bandAtlas = compileFieldAtlas(GREEN_AND_FAIRWAY, meshWith(), BOUNDS, { targetSize: 400 });

describe('green surface band classification (§27–33)', () => {
  it('reads the green interior as band green at full weight', () => {
    const sample = greenBandsAt(bandAtlas, 0, 0);
    expect(sample.band).toBe('green');
    expect(sample.weight).toBeCloseTo(1, 3);
    expect(sample.roughness).toBeCloseTo(MERIDIAN_STYLE.surface.roughness.green, 6);
    expect(sample.runoff).toBe(0);
    expect(() => assertGreenSurfaceSample(sample)).not.toThrow();
  });

  it('reads ~1 m outside the green outline as fringe, near full confidence', () => {
    // The green edge sits at x = 8; x = 9 is ~1 m outside it.
    const sample = greenBandsAt(bandAtlas, 9, 0);
    expect(sample.band).toBe('fringe');
    expect(sample.weight).toBeGreaterThan(0.9);
    expect(sample.roughness).toBeCloseTo(MERIDIAN_STYLE.surface.roughness.fringe, 6);
    expect(() => assertGreenSurfaceSample(sample)).not.toThrow();
  });

  it('reads the fairway-facing neck beyond the fringe as apron', () => {
    const sample = greenBandsAt(bandAtlas, 12, 0);
    expect(sample.band).toBe('apron');
    expect(sample.weight).toBeGreaterThan(0.9);
    expect(sample.roughness).toBeCloseTo(MERIDIAN_STYLE.surface.roughness.apron, 6);
    expect(() => assertGreenSurfaceSample(sample)).not.toThrow();
  });

  it('falls to rough (weight 0) once past every band', () => {
    const sample = greenBandsAt(bandAtlas, 20, 0);
    expect(sample.band).toBe('rough');
    expect(sample.weight).toBe(0);
    expect(() => assertGreenSurfaceSample(sample)).not.toThrow();
  });

  it('never reports apron away from the fairway-facing side, even within apronGreenM', () => {
    // x = -12: 12 m from the green centre on the side with no fairway at all.
    const sample = greenBandsAt(bandAtlas, -12, 0);
    expect(sample.band).not.toBe('apron');
  });

  it('is deterministic', () => {
    const a = greenBandsAt(bandAtlas, 9, 0), b = greenBandsAt(bandAtlas, 9, 0);
    expect(a).toEqual(b);
  });

  it('reports the unsupported fallback outside the atlas bounds', () => {
    const sample = greenBandsAt(bandAtlas, 1000, 1000);
    expect(sample).toEqual({ band: 'rough', weight: 0, roughness: MERIDIAN_STYLE.surface.roughness.rough, runoff: 0 });
  });
});

describe('green micro-normal (§31)', () => {
  it('reuses wavelengths inside the plan-suggested bands', () => {
    expect(GREEN_MICRO_NORMAL.wavelengthsM[0]).toBeGreaterThanOrEqual(0.25);
    expect(GREEN_MICRO_NORMAL.wavelengthsM[0]).toBeLessThanOrEqual(0.45);
    expect(GREEN_MICRO_NORMAL.wavelengthsM[1]).toBeGreaterThanOrEqual(0.8);
    expect(GREEN_MICRO_NORMAL.wavelengthsM[1]).toBeLessThanOrEqual(1.4);
  });

  it('never exceeds its own analytic bound, and that bound reads as "extremely small" (§31)', () => {
    expect(GREEN_MICRO_NORMAL_MAX_SLOPE).toBeGreaterThan(0);
    const worstTiltDeg = Math.atan(GREEN_MICRO_NORMAL_MAX_SLOPE) * (180 / Math.PI);
    expect(worstTiltDeg).toBeLessThan(2);
    for (let x = -6; x <= 6; x += 0.37) for (let y = -6; y <= 6; y += 0.53) {
      const { dx, dy } = greenMicroNormalAt(x, y);
      expect(Number.isFinite(dx)).toBe(true);
      expect(Number.isFinite(dy)).toBe(true);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(GREEN_MICRO_NORMAL_MAX_SLOPE + 1e-9);
    }
  });

  it('is deterministic and a pure function of position (no Math.random/Date)', () => {
    const a = greenMicroNormalAt(3.14, -2.71), b = greenMicroNormalAt(3.14, -2.71);
    expect(a).toEqual(b);
    const c = greenMicroNormalAt(3.14, -2.71, [100, -50]);
    expect(c).not.toEqual(a); // a seed offset must actually move the field.
  });
});

describe('green run-off darkening (§34)', () => {
  const grid = (dzdx: number) => syntheticGrid((x) => dzdx * x, 30);
  const runoffAtlas = (dzdx: number) => compileFieldAtlas(GREEN_ONLY, meshWith(grid(dzdx)), [-30, -20, 30, 20], { targetSize: 300 });

  it('is 0 on flat ground even close to the green and steep enough elsewhere to qualify', () => {
    const flat = runoffAtlas(0);
    for (const [x, y] of [[15, 0], [-15, 0], [0, 15], [12, 0]] as PointM[]) {
      const sample = greenBandsAt(flat, x, y);
      expect(sample.runoff).toBe(0);
      expect(sample.band).toBe('rough'); // never promoted to 'runoff' without qualifying slope.
    }
  });

  it('is positive — and resolves band ‘runoff’, not ‘rough’ — where the ground actually falls away from the green outward', () => {
    const sloped = runoffAtlas(-0.08); // height decreases with +x: the ground falls away in +x.
    const away = greenBandsAt(sloped, 15, 0); // due east of the green: falling away from it.
    expect(away.band).toBe('runoff');
    expect(away.weight).toBe(away.runoff);
    expect(away.roughness).toBeCloseTo(MERIDIAN_STYLE.surface.roughness.apron, 6);
    expect(away.runoff).toBeGreaterThan(0);
    expect(away.runoff).toBeLessThanOrEqual(1);
    expect(() => assertGreenSurfaceSample(away)).not.toThrow();
  });

  it('is 0 where the same slope instead runs toward the green', () => {
    const sloped = runoffAtlas(-0.08);
    const toward = greenBandsAt(sloped, -15, 0); // due west: this slope climbs toward the green from there, not away.
    expect(toward.band).toBe('rough');
    expect(toward.runoff).toBe(0);
  });

  it('fades to 0 beyond reachM regardless of slope', () => {
    const sloped = runoffAtlas(-0.08);
    const far = greenBandsAt(sloped, 8 + MERIDIAN_STYLE.greenComplex.runoff.reachM + 5, 0);
    expect(far.runoff).toBe(0);
  });

  it('never appears on a band other than rough', () => {
    const sloped = compileFieldAtlas(GREEN_AND_FAIRWAY, meshWith(syntheticGrid(x => -0.08 * x, 30)), BOUNDS, { targetSize: 400 });
    for (const [x, y] of [[0, 0], [9, 0], [12, 0]] as PointM[]) {
      const sample = greenBandsAt(sloped, x, y);
      expect(sample.band).not.toBe('rough');
      expect(sample.runoff).toBe(0);
    }
  });
});

describe('green surface GLSL chunk', () => {
  it('contains the expected self-contained function names', () => {
    const chunk = greenSurfaceShaderChunk();
    expect(chunk.names).toBe(GREEN_SURFACE_GLSL_NAMES);
    expect(chunk.source).toContain(`GolfV2GreenBand ${GREEN_SURFACE_GLSL_NAMES.bands}(`);
    expect(chunk.source).toContain(`float ${GREEN_SURFACE_GLSL_NAMES.roughness}(`);
    expect(chunk.source).toContain(`vec2 ${GREEN_SURFACE_GLSL_NAMES.microNormal}(`);
    expect(chunk.source).toContain(`float ${GREEN_SURFACE_GLSL_NAMES.runoff}(`);
    expect(chunk.source).toContain('struct GolfV2GreenBand');
  });

  it('never references a sampler, uniform or varying (self-contained per the wiring-task contract)', () => {
    const chunk = greenSurfaceShaderChunk();
    expect(chunk.source).not.toMatch(/sampler2D|uniform |varying /);
  });

  it('balances braces (a cheap syntax sanity check)', () => {
    const chunk = greenSurfaceShaderChunk();
    const opens = (chunk.source.match(/\{/g) ?? []).length, closes = (chunk.source.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });

  it('is deterministic for the same style', () => {
    expect(greenSurfaceShaderChunk().source).toBe(greenSurfaceShaderChunk().source);
  });
});

describe('compiles hole 7 (Peek’n Peak Upper, §27–34)', () => {
  const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const hole = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole);

  const greenFeature = scene.features.find(f => f.kind === 'green')!;
  const ring = greenFeature.parts[0]![0]! as readonly PointM[];
  let sx = 0, sy = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { sx += x; sy += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const centroid: PointM = [sx / ring.length, sy / ring.length];
  // §27: the green complex patch is the green polygon plus a 30–45 m influence.
  const pad = 35;
  const atlas = compileFieldAtlas(scene, hole, [minX - pad, minY - pad, maxX + pad, maxY + pad], { targetSize: 512 });

  it('reads the green centroid as band green at full weight', () => {
    const sample = greenBandsAt(atlas, centroid[0], centroid[1]);
    expect(sample.band).toBe('green');
    expect(sample.weight).toBeCloseTo(1, 2);
  });

  it('walks green → fringe → apron → rough along the green’s own fairway-facing neck', () => {
    // Azimuth and radii below are the real hole-7 green/fairway SDF values at
    // this bearing from the green centroid (measured 2026-09-16; see the
    // module header) — a real, coarse, hand-digitized outline actually
    // produces the full §33 sequence here.
    const az = (150 * Math.PI) / 180, dir: PointM = [Math.cos(az), Math.sin(az)];
    const at = (r: number): PointM => [centroid[0] + dir[0] * r, centroid[1] + dir[1] * r];

    const fringe = greenBandsAt(atlas, ...at(10.0));
    expect(fringe.band).toBe('fringe');
    expect(fringe.weight).toBeGreaterThan(0.9);

    const apron = greenBandsAt(atlas, ...at(13.0));
    expect(apron.band).toBe('apron');
    expect(apron.weight).toBeGreaterThan(0.8);

    const rough = greenBandsAt(atlas, ...at(15.5));
    expect(rough.band).toBe('rough');
    expect(rough.weight).toBe(0);
  });

  it('is deterministic and passes the finite-value gate over a grid around the green', () => {
    let checked = 0;
    for (let x = minX - 20; x <= maxX + 20; x += 3) for (let y = minY - 20; y <= maxY + 20; y += 3) {
      const a = greenBandsAt(atlas, x, y), b = greenBandsAt(atlas, x, y);
      expect(a).toEqual(b);
      expect(() => assertGreenSurfaceSample(a)).not.toThrow();
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});
