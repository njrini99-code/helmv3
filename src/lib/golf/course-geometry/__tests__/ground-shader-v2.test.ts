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
  classAlbedoLinear, classifySurfaceFromAtlas, FAIRWAY_GRAIN_BINDING, fairwayGrainFactorAt, GROUND_ATLAS_TRACKED_CLASSES, GROUND_SDF_ATLAS_LAYERS,
  GROUND_SHADER_V2_VERSION, groundShaderV2Chunks, maxGroundEdgeBandM, pickFinestAtlas, RELIEF_FIELD_BINDING, roughHierarchyAt, type GroundAtlasClass, type RoughTier,
} from '../ground-shader-v2';
import { parseGeometryPackage } from '../schema';
import { quantizeSignedDistance, SDF_RANGE_M } from '../surface-distance-field';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { HoleScene, LocalFeature, PointM } from '../types';
import type { PackedFieldAtlas } from '../visual-artifact-v2';
import { SURFACE_CLASS_IDS } from '../visual-artifact';
import { hexToRgb, MERIDIAN_STYLE, srgbToLinear } from '../visual-style';

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

  it('samples the relief texture once, outside any branch, through golfV2SdfFrame\'s uv, and shares the tap between the hierarchy and the run-off', () => {
    expect((chunks.fragmentColor.match(new RegExp(`texture2D(?:LodEXT)?\\(${RELIEF_FIELD_BINDING.sampler}`, 'g')) ?? []).length).toBe(1);
    expect(chunks.fragmentColor).toContain(`vec4 golfRelief = texture2D(${RELIEF_FIELD_BINDING.sampler}, golfSdfUv);`);
    expect(chunks.fragmentColor).toContain('float golfDTee = golfRelief.b;');
    expect(chunks.fragmentColor).toContain('vec2 golfSlopeXY = golfRelief.rg;');
    expect(chunks.fragmentColor).toContain('clamp(golfRelief.a, -1.0, 1.0)');
  });

  it('calls the green-surface run-off function with the relief slope and a four-tap SDF gradient at GREEN_SDF_GRADIENT_STEP_M, then applies runoff.mix toward apron and the apron roughness', () => {
    const block = chunks.fragmentColor.slice(chunks.fragmentColor.indexOf('float golfRunoffClaim'));
    expect(block).toContain('vec2 golfSlopeXY = golfRelief.rg;');
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
      expect(stripped.includes(`texture2D(${RELIEF_FIELD_BINDING.sampler}`)).toBe(live);
      // The rough hierarchy (meridian-ground-v2-7) rides the same pair of defines.
      expect(stripped.includes('float golfDPlay')).toBe(live);
      expect(stripped.includes('golfRoughShare')).toBe(live);
      // The turf-field scales it raises always exist (declared outside every define) so the turf line compiles in every combination.
      expect(stripped).toContain('float golfMacroScale = 1.0, golfMicroScale = 1.0;');
      expect(stripped).toContain('golfMacroScale * golfTurfWeight');
    });
  }
});

describe('GOLF_V2_RELIEF rough hierarchy (fidelity §32–36, plan §48–50; meridian-ground-v2-7)', () => {
  const chunks = groundShaderV2Chunks();
  const rh = MERIDIAN_STYLE.roughHierarchy, tone = MERIDIAN_STYLE.curvatureTone;
  const block = chunks.fragmentColor.slice(chunks.fragmentColor.indexOf('float golfTeeIn'), chunks.fragmentColor.indexOf('GolfV2GreenBand golfGB'));
  const v3 = (v: readonly [number, number, number]) => `vec3(${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)})`;
  const ratio = (key: 'roughFirstCut' | 'roughSecondary' | 'roughOuter'): [number, number, number] => {
    const rough = classAlbedoLinear('rough'), [r, g, b] = hexToRgb(MERIDIAN_STYLE.palette[key]);
    return [srgbToLinear(r) / rough[0], srgbToLinear(g) / rough[1], srgbToLinear(b) / rough[2]];
  };

  it('bumps the shader version for the new program structure', () => {
    expect(GROUND_SHADER_V2_VERSION).toBe('meridian-ground-v2-8');
  });

  it('§20 pad setting: the bank below the hole\'s own green pad darkens toward the green on V1\'s rough classes (rough share + the fairway surround), gated to the own green like the run-off', () => {
    const gc = MERIDIAN_STYLE.greenComplex;
    expect(chunks.fragmentHead).toContain('uniform vec4 golfV2GreenPad;');
    expect(chunks.fragmentHead).toContain('varying float vGolfV2WorldZ;');
    expect(chunks.vertexHead).toContain('varying float vGolfV2WorldZ;');
    expect(chunks.vertexMain).toContain('vGolfV2WorldZ = golfV2WorldPos.z;');
    const body = chunks.fragmentColor;
    expect(body).toContain('float golfOwnGreen = golfV2GreenPad.w > 0.0 && distance(vGolfV2WorldXY, golfV2GreenPad.xy) <= golfV2GreenPad.w ? 1.0 : 0.0;');
    expect(body).toContain('golfRunoffShare *= golfOwnGreen;');
    expect(body).toContain(`float golfPadDrop = clamp((golfV2GreenPad.z - vGolfV2WorldZ) / ${gc.settingDropM.toFixed(4)}, 0.0, 1.0);`);
    expect(body).toContain(`float golfPadReach = 1.0 - clamp(-golfDGreen / ${gc.settingReachM.toFixed(4)}, 0.0, 1.0);`);
    expect(body).toContain('float golfPadShare = golfRoughShare + (golfWin == 5 ? golfWeight * (1.0 - golfTeeIn) * (1.0 - golfWoodsIn) : 0.0);');
    expect(body).toContain(`diffuseColor.rgb *= 1.0 - ${gc.settingShade.toFixed(4)} * golfPadDrop * golfPadReach * golfOwnGreen * golfPadShare;`);
    // Declared after the run-off (V1 order: apron → run-off → setting) and inside the relief block.
    expect(body.indexOf('float golfPadDrop')).toBeGreaterThan(body.indexOf('golfV2GreenRunoff(3.0'));
  });

  it('measures the play distance from the nearest fairway/green/tee (own + context, via the SDFs) and adds the metres outside the atlas, so clamped edge texels never smear a band across far ground', () => {
    expect(block).toContain('float golfDPlay = max(0.0, -max(max(golfDFairway, golfDGreen), golfDTee)) + max(golfOutsideM.x, golfOutsideM.y);');
    expect(block).toContain('vec2 golfOutsideM = max(vec2(0.0), max(-golfSdfUv, golfSdfUv - 1.0)) / golfV2SdfFrame.zw;');
  });

  it('banks the rough with V1\'s own bands and blends, as ratios to the rough albedo (first cut lifts, secondary and outer darken)', () => {
    expect(block).toContain(`smoothstep(${(rh.firstCutM - rh.firstCutBlendM).toFixed(4)}, ${(rh.firstCutM + rh.firstCutBlendM).toFixed(4)}, golfDPlay)`);
    expect(block).toContain(`smoothstep(${(rh.secondaryM - rh.secondaryBlendM).toFixed(4)}, ${(rh.secondaryM + rh.secondaryBlendM).toFixed(4)}, golfDPlay)`);
    expect(block).toContain(`smoothstep(${(rh.outerM - rh.outerBlendM).toFixed(4)}, ${(rh.outerM + rh.outerBlendM).toFixed(4)}, golfDPlay)`);
    const firstCut = ratio('roughFirstCut'), secondary = ratio('roughSecondary'), outer = ratio('roughOuter');
    expect(block).toContain(`vec3 golfTier = mix(mix(mix(${v3(firstCut)}, vec3(1.0), golfToPrimary), ${v3(secondary)}, golfToSecondary), ${v3(outer)}, golfToOuter);`);
    expect(Math.min(...firstCut)).toBeGreaterThan(1); // #6A8A42 over #607D3D
    expect(Math.max(...secondary)).toBeLessThan(1);
    expect(Math.max(...outer)).toBeLessThan(Math.min(...secondary));
    expect(block).toContain('diffuseColor.rgb *= mix(vec3(1.0), golfTier * golfSlopeShade * golfCurvTone, golfRoughShare);');
  });

  it('applies the hierarchy to the fragment\'s untracked share only, minus the tee band (from the SDF) and the woods share (continuous in the interpolated class, no mid-triangle step)', () => {
    expect(block).toContain('float golfTeeIn = smoothstep(-0.0600, 0.0600, golfDTee);');
    expect(block).toContain(`float golfWoodsIn = clamp(golfClass - ${(SURFACE_CLASS_IDS.indexOf('woods') - 1).toFixed(1)}, 0.0, 1.0);`);
    expect(block).toContain('float golfRoughShare = (1.0 - golfWeight) * (1.0 - golfTeeIn) * (1.0 - golfWoodsIn);');
    expect(block).not.toContain('vGolfV2AtlasTrust'); // never gated on the tracked flag (the opposite set) or a discrete class test
  });

  it('darkens steeper secondary/outer ground by slope alone (V1 slopeDarken/slopeFullAt) and tints by landform curvature within the plan\'s 1–4 % luminance', () => {
    expect(block).toContain('float golfSlopeV1 = 1.0 - inversesqrt(1.0 + dot(golfRelief.rg, golfRelief.rg));');
    expect(block).toContain(`float golfSlopeShade = 1.0 - ${rh.slopeDarken.toFixed(4)} * min(1.0, golfSlopeV1 / ${rh.slopeFullAt.toFixed(4)}) * golfToSecondary;`);
    expect(block).toContain(`vec3 golfCurvTone = mix(vec3(1.0), ${v3(tone.concave)}, max(0.0, golfCurv)) * mix(vec3(1.0), ${v3(tone.convex)}, max(0.0, -golfCurv));`);
    const luminance = (v: readonly [number, number, number]) => .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
    expect(1 - luminance(tone.concave)).toBeGreaterThanOrEqual(.01); expect(1 - luminance(tone.concave)).toBeLessThanOrEqual(.04);
    expect(luminance(tone.convex) - 1).toBeGreaterThanOrEqual(.01); expect(luminance(tone.convex) - 1).toBeLessThanOrEqual(.04);
  });

  it('raises the outer rough\'s macro field and the rough/surround/fringe/apron micro cue by class (V1 outerMacroScale, microByClass)', () => {
    const micro = MERIDIAN_STYLE.turf.microByClass;
    expect(block).toContain(`golfMacroScale = mix(1.0, ${rh.outerMacroScale.toFixed(4)}, golfRoughShare * golfToOuter);`);
    expect(block).toContain(`golfMicroScale = mix(1.0, ${micro.rough.toFixed(4)}, golfRoughShare);`);
    expect(block).toContain(`if (golfWin == 5) golfMicroScale = mix(golfMicroScale, ${micro.surround.toFixed(4)}, golfWeight);`);
    expect(block).toContain(`if (golfWin == 4) golfMicroScale = mix(golfMicroScale, ${micro.fringe.toFixed(4)}, golfWeight);`);
    expect(chunks.fragmentColor).toContain(`golfMicroScale = mix(golfMicroScale, ${micro.apron.toFixed(4)}, golfGB.weight * golfWeight);`);
    expect(block).toContain(`golfV2ResolvedRoughness = mix(golfV2ResolvedRoughness, ${MERIDIAN_STYLE.surface.roughness.rough_outer.toFixed(5)}, golfRoughShare * golfToOuter);`);
  });

  it('roughHierarchyAt mirrors the block: inside a playing surface nothing, first cut beside it, primary, secondary and outer by distance, tee excluded by its own band', () => {
    const scene = sceneWith([feature('fairway-1', 'fairway', circle(0, 0, 20)), feature('tee-1', 'tee', circle(60, 0, 4))]);
    const wide = compileFieldAtlas(scene, meshWithNoGrid(), [-70, -70, 70, 70], { targetSize: 560 }); // 0.25 m/texel
    expect(roughHierarchyAt(wide, 0, 0)!.share).toBe(0); // inside the fairway: the winner owns it
    expect(roughHierarchyAt(wide, 60, 0)!.share).toBe(0); // inside the tee: the tee band owns it
    const beside = roughHierarchyAt(wide, 0, -21.5)!; // 1.5 m outside the fairway: first cut, lifted
    expect(beside.tier).toBe('first_cut'); expect(beside.share).toBeCloseTo(1, 2); expect(Math.min(...beside.tint)).toBeGreaterThan(1.1);
    const primary = roughHierarchyAt(wide, 0, -25)!;
    expect(primary.tier).toBe('primary'); expect(primary.tint.every(c => Math.abs(c - 1) < 1e-6)).toBe(true); // no slope, no curvature: the rough albedo itself
    const secondary = roughHierarchyAt(wide, 0, -36)!;
    expect(secondary.tier).toBe('secondary'); expect(secondary.toSecondary).toBeCloseTo(1, 2); expect(Math.max(...secondary.tint)).toBeLessThan(.9);
    const outer = roughHierarchyAt(wide, 0, -60)!;
    expect(outer.tier).toBe('outer'); expect(outer.toOuter).toBeCloseTo(1, 2); expect(Math.max(...outer.tint)).toBeLessThan(Math.min(...secondary.tint));
    const teeSide = roughHierarchyAt(wide, 60, -5.5)!; // 1.5 m outside the tee: first cut again — tee is a playing surface
    expect(teeSide.tier).toBe('first_cut'); expect(teeSide.share).toBeCloseTo(1, 2);
    const onEdge = roughHierarchyAt(wide, 60, -4)!.share; // on the tee outline: half way through the 12 cm band
    expect(onEdge).toBeGreaterThan(.3); expect(onEdge).toBeLessThan(.7);
    expect(roughHierarchyAt(wide, 60, -3.9)!.share).toBe(0); // 10 cm inside: the tee's own
    expect(roughHierarchyAt(wide, 60, -5.5, MERIDIAN_STYLE, 1)!.share).toBe(0); // a woods fragment takes none
    expect(roughHierarchyAt(wide, 200, 200)).toBeNull();
  });

  it('finds every tier on hole 7\'s real whole-hole atlas, on the rough share only', () => {
    const { hole, holeScene } = loadHole7();
    const atlas = compileFieldAtlas(holeScene, hole, hole.renderProfile!.tacticalBoundsM!, { targetSize: 256 });
    const counts: Record<RoughTier, number> = { first_cut: 0, primary: 0, secondary: 0, outer: 0 };
    let rough = 0, total = 0, tinted = 0;
    const [x0, y0, x1, y1] = atlas.boundsM;
    for (let y = y0 + 1; y < y1; y += 2) for (let x = x0 + 1; x < x1; x += 2) {
      const sample = roughHierarchyAt(atlas, x, y);
      if (!sample) continue;
      total++;
      if (sample.share < .5) continue;
      rough++; counts[sample.tier]++;
      if (Math.abs(sample.tint[1]! - 1) > .02) tinted++;
    }
    expect(total).toBeGreaterThan(1000);
    expect(rough / total).toBeGreaterThan(.3); // most of a hole's frame is not fairway/green/sand/water
    for (const tier of Object.keys(counts) as RoughTier[]) expect(counts[tier]).toBeGreaterThan(20);
    expect(tinted / rough).toBeGreaterThan(.3); // the hierarchy is not decorative: a third or more of the rough moves by > 2 %
  });
});
