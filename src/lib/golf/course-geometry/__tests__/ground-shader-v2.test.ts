/** Task 11 follow-up: atlas SDF classification (ground-shader-v2.ts).
 *
 * Same synthetic-scene pattern field-atlas.test.ts already established for
 * atlas-consuming logic (a hand-placed green + bunker polygon rather than
 * the full hole-7 GeoJSON fixture) — precise, closed-form coordinates for a
 * layout that mirrors hole 7's own green-plus-bunkers composition
 * (bunker-display-mesh.test.ts, hero-patches.test.ts, three-world-v2.test.ts),
 * without needing a metric grid `compileFieldAtlas` never reads for these
 * layers (green/bunker/fairway/water SDFs come from `scene`'s polygons
 * alone). three-world-v2.test.ts additionally exercises the real hole-7
 * fixture end to end (atlas wiring, `atlasBytes`, texture disposal). */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { compileFairwayDirectionField, type FairwayDirectionField } from '../fairway-direction-field';
import { compileFieldAtlas } from '../field-atlas';
import { GREEN_SDF_GRADIENT_STEP_M, GREEN_SURFACE_GLSL_NAMES } from '../green-surface-v2';
import {
  classifySurfaceFromAtlas, FAIRWAY_GRAIN_BINDING, fairwayGrainFactorAt, GROUND_ATLAS_TRACKED_CLASSES, GROUND_SDF_ATLAS_LAYERS,
  groundShaderV2Chunks, maxGroundEdgeBandM, pickFinestAtlas, RELIEF_FIELD_BINDING, type GroundAtlasClass,
} from '../ground-shader-v2';
import { parseGeometryPackage } from '../schema';
import { quantizeSignedDistance, SDF_RANGE_M } from '../surface-distance-field';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { HoleScene, LocalFeature, PointM } from '../types';
import type { PackedFieldAtlas } from '../visual-artifact-v2';
import { MERIDIAN_STYLE } from '../visual-style';

const circle = (cx: number, cy: number, r: number, sides = 96): PointM[] => {
  const ring: PointM[] = [];
  for (let i = 0; i < sides; i++) { const a = (2 * Math.PI * i) / sides; ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  ring.push(ring[0]!);
  return ring;
};
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
function sceneWith(features: LocalFeature[]): HoleScene {
  return {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: null },
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: features.map(f => f.id), routeFeatureId: null, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features, events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
}
const meshWithNoGrid = (): TerrainMesh => ({ metricGrid: undefined }) as unknown as TerrainMesh;

/** A hole-7-like green + greenside bunker, well separated (20 m edge to
 * edge) so every test below is unambiguous: no other tracked feature is
 * ever within a soft-edge band of the points sampled. */
const GREEN_CENTER: PointM = [0, 0], GREEN_R = 10;
const BUNKER_CENTER: PointM = [35, 0], BUNKER_R = 5;
const BOUNDS: [number, number, number, number] = [-20, -20, 50, 20];
const atlas = compileFieldAtlas(
  sceneWith([feature('green-1', 'green', circle(...GREEN_CENTER, GREEN_R)), feature('bunker-1', 'bunker', circle(...BUNKER_CENTER, BUNKER_R))]),
  meshWithNoGrid(), BOUNDS, { targetSize: 512 },
);

describe('GROUND_ATLAS_TRACKED_CLASSES / GROUND_SDF_ATLAS_LAYERS', () => {
  it('tracks exactly the four SDF layers plus the two derived slabs (fringe collar, fairway surround)', () => {
    expect([...GROUND_ATLAS_TRACKED_CLASSES].sort()).toEqual(['bunker', 'fairway', 'fringe', 'green', 'surround', 'water']);
  });
  it('excludes classes the atlas has no SDF for', () => {
    for (const untracked of ['woods', 'tee', 'ground', 'rough', 'apron'] as const) expect(GROUND_ATLAS_TRACKED_CLASSES.has(untracked)).toBe(false);
  });
  it('paints the 0.6 m first-cut surround as a slab of the fairway SDF, never inside the fairway itself', () => {
    const texels = 64 * 64, data = new Uint16Array(texels * 5);
    // A 20 m wide fairway strip (x in [20, 40]) inside a 64 m atlas: fairway
    // SDF is +d inside / -d outside, every other layer far outside.
    const layers = ['green', 'bunker', 'fairway', 'path', 'water'];
    for (let n = 0; n < texels; n++) {
      const x = ((n % 64) + .5); // 1 m texels
      const dFairway = x < 20 ? x - 20 : x > 40 ? 40 - x : Math.min(x - 20, 40 - x);
      for (let l = 0; l < 5; l++) data[l * texels + n] = quantizeSignedDistance(new Float32Array([l === 2 ? dFairway : -60]), SDF_RANGE_M)[0]!;
    }
    const atlas: PackedFieldAtlas = { width: 64, height: 64, boundsM: [0, 0, 64, 64], basis: 'source_derived_visual',
      reliefRGBA16F: new Uint16Array(texels * 4), bentRGBA8: new Uint8Array(texels * 4), semanticRGBA8: new Uint8Array(texels * 4), sdfLayers: { layerNames: layers, data } };
    expect(classifySurfaceFromAtlas(atlas, 30, 32).surfaceClass).toBe('fairway');
    expect(classifySurfaceFromAtlas(atlas, 40.3, 32)).toEqual({ surfaceClass: 'surround', weight: expect.any(Number) });
    expect(classifySurfaceFromAtlas(atlas, 40.3, 32).weight).toBeGreaterThan(0);
    expect(classifySurfaceFromAtlas(atlas, 45, 32)).toEqual({ surfaceClass: 'rough', weight: 0 });
  });
  it('packs the SDF texture in green, bunker, fairway, water order (RGBA)', () => {
    expect(GROUND_SDF_ATLAS_LAYERS).toEqual(['green', 'bunker', 'fairway', 'water']);
  });
});

describe('classifySurfaceFromAtlas (Task 11 follow-up)', () => {
  it('classifies a bunker centroid as sand, fully confident', () => {
    const result = classifySurfaceFromAtlas(atlas, BUNKER_CENTER[0], BUNKER_CENTER[1]);
    expect(result.surfaceClass).toBe('bunker');
    expect(result.weight).toBeCloseTo(1, 6);
  });

  it('classifies 1.5 m outside the bunker outline as turf, not sand', () => {
    const result = classifySurfaceFromAtlas(atlas, BUNKER_CENTER[0] + BUNKER_R + 1.5, BUNKER_CENTER[1]);
    expect(result.surfaceClass).not.toBe('bunker');
    expect(result.surfaceClass).toBe('rough');
    expect(result.weight).toBe(0);
  });

  it('classifies the green interior as green, fully confident', () => {
    const result = classifySurfaceFromAtlas(atlas, GREEN_CENTER[0], GREEN_CENTER[1]);
    expect(result.surfaceClass).toBe('green');
    expect(result.weight).toBeCloseTo(1, 6);
  });

  it('is monotonic across the bunker edge: weight never rises moving outward, and bunker never reappears once the transect leaves it', () => {
    // From 4 m inside the outline to 4 m outside it, straight out along the
    // radius — the true signed distance to a circle changes monotonically
    // along this line, so the soft-edge weight derived from it must too.
    let sawNonBunker = false, previousWeight = Infinity;
    for (let d = -4; d <= 4; d += 0.05) {
      const result = classifySurfaceFromAtlas(atlas, BUNKER_CENTER[0] + BUNKER_R + d, BUNKER_CENTER[1]);
      expect(result.weight).toBeGreaterThanOrEqual(0);
      expect(result.weight).toBeLessThanOrEqual(1);
      if (result.surfaceClass === 'bunker') {
        expect(sawNonBunker).toBe(false); // never returns to bunker after leaving it
        expect(result.weight).toBeLessThanOrEqual(previousWeight + 1e-9);
        previousWeight = result.weight;
      } else {
        sawNonBunker = true;
      }
    }
    expect(sawNonBunker).toBe(true); // the transect actually exits the bunker's band
    expect(previousWeight).toBeLessThan(Infinity); // the transect actually started inside it
  });

  it('is monotonic across the green edge along the same rule', () => {
    let sawOutside = false, previousWeight = Infinity;
    for (let d = -3; d <= 3; d += 0.05) {
      const result = classifySurfaceFromAtlas(atlas, GREEN_CENTER[0] + GREEN_R + d, GREEN_CENTER[1]);
      if (result.surfaceClass === 'green') {
        expect(sawOutside).toBe(false);
        expect(result.weight).toBeLessThanOrEqual(previousWeight + 1e-9);
        previousWeight = result.weight;
      } else {
        sawOutside = true;
      }
    }
    expect(sawOutside).toBe(true);
  });

  it('reaches the derived fringe/apron collar just outside the green before falling to rough', () => {
    // The green edge sits at x = GREEN_R; scan outward and expect at least
    // one sample to read as the fringe collar before the transect goes rough.
    const seen = new Set<GroundAtlasClass>();
    for (let d = 0; d <= 2; d += 0.02) seen.add(classifySurfaceFromAtlas(atlas, GREEN_CENTER[0] + GREEN_R + d, GREEN_CENTER[1]).surfaceClass);
    expect(seen.has('fringe')).toBe(true);
  });

  it('never classifies fringe on the green side of the boundary', () => {
    for (let d = -6; d <= -0.5; d += 0.5) expect(classifySurfaceFromAtlas(atlas, GREEN_CENTER[0] + GREEN_R + d, GREEN_CENTER[1]).surfaceClass).not.toBe('fringe');
  });

  it('is deterministic and stateless (same inputs, same outputs)', () => {
    const a = classifySurfaceFromAtlas(atlas, BUNKER_CENTER[0], BUNKER_CENTER[1]);
    const b = classifySurfaceFromAtlas(atlas, BUNKER_CENTER[0], BUNKER_CENTER[1]);
    expect(a).toEqual(b);
  });

  it('falls back to rough far from every tracked feature', () => {
    const result = classifySurfaceFromAtlas(atlas, -15, -15);
    expect(result).toEqual({ surfaceClass: 'rough', weight: 0 });
  });
});

describe('maxGroundEdgeBandM (Task 11 hero-atlas follow-up)', () => {
  it('is the largest of the per-class edge bands, for the current style', () => {
    const expected = Math.max(MERIDIAN_STYLE.greenComplex.edgeFieldM, MERIDIAN_STYLE.bunker.lipBandM, MERIDIAN_STYLE.fairwayEdge.fieldM);
    expect(maxGroundEdgeBandM()).toBeCloseTo(expected, 6);
    expect(maxGroundEdgeBandM(MERIDIAN_STYLE)).toBe(maxGroundEdgeBandM());
  });
});

describe('pickFinestAtlas (Task 11 hero-atlas follow-up)', () => {
  const bunkerFeature = feature('bunker-1', 'bunker', circle(...BUNKER_CENTER, BUNKER_R));
  const scene = sceneWith([bunkerFeature, feature('green-1', 'green', circle(...GREEN_CENTER, GREEN_R))]);
  const coarse = compileFieldAtlas(scene, meshWithNoGrid(), BOUNDS, { targetSize: 64 }); // ~1.1 m/texel
  const fineBounds: [number, number, number, number] = [BUNKER_CENTER[0] - 8, BUNKER_CENTER[1] - 8, BUNKER_CENTER[0] + 8, BUNKER_CENTER[1] + 8];
  const fine = compileFieldAtlas(scene, meshWithNoGrid(), fineBounds, { targetSize: 256 }); // ~0.0625 m/texel

  it('prefers the finer of two atlases that both contain the point', () => {
    expect(pickFinestAtlas([coarse, fine], BUNKER_CENTER[0], BUNKER_CENTER[1])).toBe(fine);
    expect(pickFinestAtlas([fine, coarse], BUNKER_CENTER[0], BUNKER_CENTER[1])).toBe(fine); // order-independent
  });

  it('returns the only atlas containing the point when just one does', () => {
    const farOutsideFine: PointM = [BOUNDS[0] + 1, BOUNDS[1] + 1];
    expect(pickFinestAtlas([coarse, fine], farOutsideFine[0], farOutsideFine[1])).toBe(coarse);
  });

  it('returns null when no given atlas contains the point, or none are given', () => {
    expect(pickFinestAtlas([coarse, fine], 10_000, 10_000)).toBeNull();
    expect(pickFinestAtlas([], 0, 0)).toBeNull();
  });
});

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
/** Same real hole-7 fixture fairway-direction-field.test.ts's own last test
 * loads (`peek-n-peak-upper-07`) — a hole with a real, partial fairway. */
function loadHole7(): { hole: TerrainMesh; holeScene: HoleScene } {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const hole = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const holeScene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole);
  return { hole, holeScene };
}

describe('GOLF_V2_FAIRWAY wiring (Task 12)', () => {
  it('groundShaderV2Chunks includes the GOLF_V2_FAIRWAY define and fairway-direction-field.ts\'s own uniform/function names', () => {
    const chunks = groundShaderV2Chunks();
    expect(chunks.fragmentHead).toContain('#ifdef GOLF_V2_FAIRWAY');
    expect(chunks.fragmentHead).toContain(`uniform sampler2D ${FAIRWAY_GRAIN_BINDING.sampler}`);
    expect(chunks.fragmentHead).toContain(`uniform vec4 ${FAIRWAY_GRAIN_BINDING.frame}`);
    expect(chunks.fragmentHead).toContain(`uniform vec2 ${FAIRWAY_GRAIN_BINDING.texelM}`);
    expect(chunks.fragmentHead).toContain('vec2 golfV2FairwayGrain(vec2 golfFwWorldXY, vec3 golfFwViewDirWS)');
    expect(chunks.fragmentColor).toContain('#ifdef GOLF_V2_FAIRWAY');
    expect(chunks.fragmentColor).toContain('golfV2FairwayGrain(');
  });

  it('FAIRWAY_GRAIN_BINDING names the real fairway-direction-field.ts uniforms, not a guessed placeholder', () => {
    expect(FAIRWAY_GRAIN_BINDING.define).toBe('GOLF_V2_FAIRWAY');
    expect(FAIRWAY_GRAIN_BINDING.sampler).toBe('golfV2FairwayDirection');
    expect(FAIRWAY_GRAIN_BINDING.frame).toBe('golfV2FairwayDirectionFrame');
    expect(FAIRWAY_GRAIN_BINDING.texelM).toBe('golfV2FairwayDirectionTexelM');
  });

  it('FAIRWAY_GRAIN_BINDING.encode\'s documented frame maps each node to its own texel centre, not golfV2SdfFrame\'s boundsM convention', () => {
    // Pins the convention `FAIRWAY_GRAIN_BINDING.encode` only states in
    // prose: frame.xy = originM - 0.5*spacingM, frame.zw = 1/(columns*
    // spacingM), 1/(rows*spacingM) — NOT boundsM like golfV2SdfFrame. A
    // next worker who instead reused buildGroundSdfTexture's own boundsM-
    // based frame (originM directly, no half-texel nudge) would still
    // compile and render, just with every stripe shifted by half a texel —
    // nothing else in this file or fairway-direction-field.ts's own tests
    // can see that, since both only ever sample at exact node positions
    // (matching gx/gy exactly), never through the texture UV math three-
    // world-v2.ts will actually run.
    const originM: [number, number] = [12.5, -7], spacingM = 2, columns = 11, rows = 9;
    const frame = [originM[0] - 0.5 * spacingM, originM[1] - 0.5 * spacingM, 1 / (columns * spacingM), 1 / (rows * spacingM)] as const;
    for (const c of [0, 1, 5, columns - 1]) for (const r of [0, 1, 4, rows - 1]) {
      const worldX = originM[0] + c * spacingM, worldY = originM[1] + r * spacingM;
      const u = (worldX - frame[0]) * frame[2], v = (worldY - frame[1]) * frame[3];
      expect(u).toBeCloseTo((c + 0.5) / columns, 12); // texel centre, standard GPU sampling convention
      expect(v).toBeCloseTo((r + 0.5) / rows, 12);
    }
  });

  describe('fairwayGrainFactorAt', () => {
    // Direction angle 0 (mow line along +x, so the cross-stripe axis is y),
    // stripePhase 64/255 sits just past the band's positive peak — the same
    // one-node fixture fairway-direction-field.test.ts's own `fairwayGrainAt`
    // test uses, read here through the shader's own weighted blend instead.
    const field: FairwayDirectionField = {
      originM: [0, 0], spacingM: 1, columns: 1, rows: 1,
      active: Uint8Array.from([1]), directionAngle: Uint8Array.from([0]), stripePhase: Uint8Array.from([64]),
      periodWM: 8, skew: 0, sheenPower: 2, sheenFloor: .75, albedoAmplitude: 0.03, roughnessAmplitude: 0.03,
      stats: { activeShare: 1, ms: 0 }, basis: 'illustrative_style',
    };

    it('is exactly 1 at weight 0 — the losing edge of the fairway SDF band — regardless of the sample', () => {
      expect(fairwayGrainFactorAt(field, 0, 0, [0, 1, 0], 0)).toBe(1);
    });

    it('is exactly 1 off-fairway, regardless of weight', () => {
      expect(fairwayGrainFactorAt(field, 500, 500, [0, 1, 0], 1)).toBe(1); // outside the field entirely
      const inactive: FairwayDirectionField = { ...field, active: Uint8Array.from([0]), directionAngle: Uint8Array.from([0]), stripePhase: Uint8Array.from([0]) };
      expect(fairwayGrainFactorAt(inactive, 0, 0, [0, 1, 0], 1)).toBe(1); // on the field, but not an active fairway/tee node
    });

    it('stays within the compiled field\'s own albedo amplitude on-fairway, at full weight', () => {
      const factor = fairwayGrainFactorAt(field, 0, 0, [0, 1, 0], 1);
      expect(factor).not.toBe(1);
      expect(Math.abs(factor - 1)).toBeLessThanOrEqual(field.albedoAmplitude + 1e-9);
    });

    it('scales linearly between 1 and the unfaded factor as weight fades toward the fairway edge', () => {
      const full = fairwayGrainFactorAt(field, 0, 0, [0, 1, 0], 1);
      const half = fairwayGrainFactorAt(field, 0, 0, [0, 1, 0], 0.5);
      expect(half).toBeCloseTo(1 + 0.5 * (full - 1), 9);
    });

    it('alternates sign across one stripe period, at full weight', () => {
      // `field` above is a single node: any (x, y) away from (0, 0) reads as
      // off-the-field (columns/rows of 1 leave no valid grid coordinate but
      // 0), so a spatial sweep needs its own multi-row field — one ramping
      // stripePhase linearly with row, the same periodic pattern
      // compileFairwayDirectionField itself produces along a straight route
      // (fairway-direction-field.test.ts's own "alternates stripes" test),
      // reproduced by hand so this file stays focused on
      // fairwayGrainFactorAt rather than route projection.
      const periodWM = 8, rows = periodWM + 1;
      const rampField: FairwayDirectionField = {
        originM: [0, 0], spacingM: 1, columns: 1, rows,
        active: new Uint8Array(rows).fill(1), directionAngle: new Uint8Array(rows),
        stripePhase: Uint8Array.from({ length: rows }, (_, row) => Math.round(((row / periodWM) % 1) * 255)),
        periodWM, skew: 0, sheenPower: 2, sheenFloor: .75, albedoAmplitude: 0.03, roughnessAmplitude: 0.03,
        stats: { activeShare: 1, ms: 0 }, basis: 'illustrative_style',
      };
      const wave = (y: number) => fairwayGrainFactorAt(rampField, 0, y, [0, 1, 0], 1) - 1;
      // Quarter-period offsets (1, 3, 5, 7 of one 8 m period) rather than
      // 0/2/4/6 — those land exactly on the band's zero crossings (sin(0),
      // sin(π)), a true but uselessly-signed sample for an alternation check.
      const samples = [1, 3, 5, 7].map(wave);
      expect(samples.some(v => v > 0)).toBe(true);
      expect(samples.some(v => v < 0)).toBe(true);
    });
  });

  it('stays within the plan-configured albedo amplitude on-fairway on hole 7 (the real fixture)', () => {
    const { hole, holeScene } = loadHole7();
    const field = compileFairwayDirectionField(hole, holeScene);
    expect(field.stats.activeShare).toBeGreaterThan(0); // hole 7 has a real, partial fairway
    let sampled = 0, maxDeviation = 0;
    for (let i = 0; i < field.active.length; i += 17) { // coarse stride: representative, still fast
      if (!field.active[i]) continue;
      const row = Math.floor(i / field.columns), column = i % field.columns;
      const x = field.originM[0] + column * field.spacingM, y = field.originM[1] + row * field.spacingM;
      const factor = fairwayGrainFactorAt(field, x, y, [0, 0, 1], 1);
      sampled++;
      expect(factor).toBeGreaterThanOrEqual(1 - field.albedoAmplitude - 1e-9);
      expect(factor).toBeLessThanOrEqual(1 + field.albedoAmplitude + 1e-9);
      maxDeviation = Math.max(maxDeviation, Math.abs(factor - 1));
    }
    expect(sampled).toBeGreaterThan(0);
    expect(maxDeviation).toBeGreaterThan(field.albedoAmplitude * 0.1); // live, not squashed to 0 everywhere sampled
  });
});

describe('GOLF_V2_RELIEF wiring (Task 13 §34 run-off)', () => {
  const chunks = groundShaderV2Chunks();
  const runoff = MERIDIAN_STYLE.greenComplex.runoff;

  it('declares the relief sampler behind its own define, with no frame of its own (it rides golfV2SdfFrame)', () => {
    expect(RELIEF_FIELD_BINDING).toEqual({ define: 'GOLF_V2_RELIEF', sampler: 'golfV2Relief' });
    expect(chunks.fragmentHead).toContain(`#ifdef ${RELIEF_FIELD_BINDING.define}\nuniform sampler2D ${RELIEF_FIELD_BINDING.sampler};\n#endif`);
    expect(chunks.fragmentHead).not.toContain('golfV2ReliefFrame');
  });

  it('calls the green-surface run-off function with the relief slope and a four-tap SDF gradient at GREEN_SDF_GRADIENT_STEP_M, then applies runoff.mix toward apron and the apron roughness', () => {
    const block = chunks.fragmentColor.slice(chunks.fragmentColor.indexOf(`#ifdef ${RELIEF_FIELD_BINDING.define}`));
    expect(block).toContain(`texture2DLodEXT(${RELIEF_FIELD_BINDING.sampler}, golfSdfUv, 0.0).rg`);
    expect(block).toContain(`vec2(${GREEN_SDF_GRADIENT_STEP_M.toFixed(4)}) * golfV2SdfFrame.zw`);
    expect(block).toContain(`/ ${(2 * GREEN_SDF_GRADIENT_STEP_M).toFixed(4)}`);
    expect((block.match(/texture2DLodEXT\(golfV2Sdf,/g) ?? []).length).toBe(4);
    // Band 3 is passed explicitly: the function's own hard band gate is replaced by the continuous claim below.
    expect(block).toContain(`${GREEN_SURFACE_GLSL_NAMES.runoff}(3.0, golfDGreen, golfSlopeXY, golfGreenGrad) * golfRunoffClaim * golfRunoffShare`);
    expect(block).toContain(`${runoff.mix.toFixed(4)} * golfRunoff`);
    expect(block).toContain(`${GREEN_SURFACE_GLSL_NAMES.roughness}(2.0), golfRunoff`); // 2 = apron band
    expect(block).toContain(`golfDGreen >= -${runoff.reachM.toFixed(4)}`);
    // No implicit-derivative sampling inside the branch.
    const branch = block.slice(block.indexOf('if (golfDGreen <= 0.0'), block.indexOf('#endif'));
    expect(branch).not.toMatch(/texture2D\(/);
  });

  it('gives run-off only to the untracked rough share of a fragment (V1: rough/ground classes only, surround included, never woods), handed over gradually by the claiming band\'s fading confidence', () => {
    expect(chunks.fragmentColor).toContain('float golfRunoffShare = golfWoods ? 0.0 : (golfWin == 5 ? 1.0 : 1.0 - golfWeight);');
    expect(chunks.fragmentColor).toContain('float golfRunoffClaim = golfGB.band > 2.5 ? 1.0 : 1.0 - golfGB.weight;');
  });
});

describe('GLSL structural sanity for GOLF_V2_FAIRWAY (Task 12 wiring)', () => {
  /** A minimal `#ifdef NAME` / `#endif` preprocessor simulation — enough to
   * check this file's own nesting, not a general C preprocessor (no `#if`,
   * `#else`, or `#ifndef`, none of which `groundShaderV2Chunks` emits). */
  function stripDefines(glsl: string, active: ReadonlySet<string>): string {
    const out: string[] = [], stack: boolean[] = [];
    for (const line of glsl.split('\n')) {
      const open = /^\s*#ifdef\s+(\w+)/.exec(line);
      const close = /^\s*#endif\b/.exec(line);
      if (open) { stack.push(active.has(open[1]!)); continue; }
      if (close) { expect(stack.length).toBeGreaterThan(0); stack.pop(); continue; }
      if (stack.every(Boolean)) out.push(line);
    }
    expect(stack.length).toBe(0); // every #ifdef in this template was closed
    return out.join('\n');
  }

  const chunks = groundShaderV2Chunks();
  const fragment = [chunks.fragmentHead, chunks.fragmentColor, chunks.fragmentRoughness].join('\n');
  const combos: readonly (readonly string[])[] = [
    [], ['GOLF_V2_ATLAS'], ['GOLF_V2_FAIRWAY'], ['GOLF_V2_ATLAS', 'GOLF_V2_FAIRWAY'],
    ['GOLF_V2_RELIEF'], ['GOLF_V2_ATLAS', 'GOLF_V2_RELIEF'], ['GOLF_V2_ATLAS', 'GOLF_V2_FAIRWAY', 'GOLF_V2_RELIEF'],
  ];

  it('has one #endif per #ifdef in the raw (unstripped) fragment template', () => {
    expect((fragment.match(/#ifdef\b/g) ?? []).length).toBe((fragment.match(/#endif\b/g) ?? []).length);
    expect((fragment.match(/#ifdef\b/g) ?? []).length).toBeGreaterThanOrEqual(2); // at least GOLF_V2_ATLAS and GOLF_V2_FAIRWAY
  });

  for (const combo of combos) {
    const label = combo.length ? combo.join(' + ') : 'no defines';
    it(`balances braces and declares no uniform/varying/attribute name twice with [${label}]`, () => {
      const stripped = stripDefines(fragment, new Set(combo));
      const opens = (stripped.match(/\{/g) ?? []).length, closes = (stripped.match(/\}/g) ?? []).length;
      expect(opens).toBe(closes);
      const decls = [...stripped.matchAll(/\b(?:uniform|varying|attribute)\s+\w+\s+(\w+)/g)].map(m => m[1]!);
      expect(new Set(decls).size).toBe(decls.length);
    });

    it(`leaves no dangling fairway-grain reference with [${label}]`, () => {
      const stripped = stripDefines(fragment, new Set(combo));
      if (combo.includes('GOLF_V2_FAIRWAY')) {
        expect(stripped).toContain('golfFwGrain');
      } else {
        expect(stripped).not.toContain('golfFwGrain');
        expect(stripped).not.toContain('golfFwWeight');
        expect(stripped).not.toContain('golfV2FairwayGrain(');
      }
    });

    it(`evaluates the run-off term only with both the atlas and the relief texture bound, with [${label}]`, () => {
      const stripped = stripDefines(fragment, new Set(combo));
      const live = combo.includes('GOLF_V2_ATLAS') && combo.includes('GOLF_V2_RELIEF');
      expect(stripped.includes(`${GREEN_SURFACE_GLSL_NAMES.runoff}(3.0, golfDGreen`)).toBe(live);
      // The sampler is declared exactly when the define is set, and only ever read inside the atlas block.
      expect(stripped.includes(`uniform sampler2D ${RELIEF_FIELD_BINDING.sampler}`)).toBe(combo.includes('GOLF_V2_RELIEF'));
      expect(stripped.includes(`texture2DLodEXT(${RELIEF_FIELD_BINDING.sampler}`)).toBe(live);
    });
  }
});
