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
import { describe, expect, it } from 'vitest';
import { compileFieldAtlas } from '../field-atlas';
import {
  classifySurfaceFromAtlas, GROUND_ATLAS_TRACKED_CLASSES, GROUND_SDF_ATLAS_LAYERS, type GroundAtlasClass,
} from '../ground-shader-v2';
import type { TerrainMesh } from '../terrain';
import type { HoleScene, LocalFeature, PointM } from '../types';

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
  it('tracks exactly the four SDF layers plus the derived fringe collar', () => {
    expect([...GROUND_ATLAS_TRACKED_CLASSES].sort()).toEqual(['bunker', 'fairway', 'fringe', 'green', 'water']);
  });
  it('excludes classes the atlas has no SDF for', () => {
    for (const untracked of ['woods', 'tee', 'surround', 'ground', 'rough', 'apron'] as const) expect(GROUND_ATLAS_TRACKED_CLASSES.has(untracked)).toBe(false);
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
