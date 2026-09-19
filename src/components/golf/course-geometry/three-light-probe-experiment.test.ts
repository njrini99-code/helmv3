import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import { relativeLuminance } from '@/lib/golf/course-geometry/visual-style';
import {
  attachNearestProbe, buildFlatBentSkyBaseline, buildLightProbeGrid, buildWoodedStructureScene, captureLightProbeFromScene,
  castOccluderRay, compareToBentSky, detachManagedProbe, estimateProbeAtPosition, fibonacciSphereDirections,
  flatComparisonTerrainGrid, HOLE7_TACTICAL_BOUNDS_M, LIGHT_PROBE_EXPERIMENT_TAG, nearestProbeSample, probeIrradiance,
  reportLightProbeGridCost, SH_BYTES_PER_PROBE, sampleRadiance,
} from './three-light-probe-experiment';

// Everything below runs under `--project unit` (node, no DOM): the point of
// this suite is that it never needs WebGL. The one WebGL-shaped function,
// `captureLightProbeFromScene`, is only exercised through its guard.

describe('LightProbeGenerator addon resolution (de-risked before the rest of this module was written)', () => {
  it('resolves three/examples/jsm/lights/LightProbeGenerator.js and exposes the render-target path', () => {
    expect(typeof LightProbeGenerator.fromCubeRenderTarget).toBe('function');
    expect(typeof LightProbeGenerator.fromCubeTexture).toBe('function');
  });
});

describe('buildWoodedStructureScene', () => {
  it('places 6 canopies and 1 structure inside the given bounds', () => {
    const scene = buildWoodedStructureScene();
    expect(scene.trees.length).toBe(6);
    const [x0, y0, x1, y1] = scene.boundsM;
    for (const tree of scene.trees) {
      expect(tree.positionM[0]).toBeGreaterThan(x0);
      expect(tree.positionM[0]).toBeLessThan(x1);
      expect(tree.positionM[1]).toBeGreaterThan(y0);
      expect(tree.positionM[1]).toBeLessThan(y1);
    }
    expect(scene.structure.centerM[0]).toBeGreaterThan(x0);
    expect(scene.structure.centerM[0]).toBeLessThan(x1);
  });

  it('is deterministic: two builds are deeply equal', () => {
    expect(buildWoodedStructureScene()).toEqual(buildWoodedStructureScene());
  });

  it('defaults to hole 7\'s real tactical bounds', () => {
    expect(buildWoodedStructureScene().boundsM).toEqual(HOLE7_TACTICAL_BOUNDS_M);
  });
});

describe('fibonacciSphereDirections', () => {
  it('returns count unit vectors', () => {
    const directions = fibonacciSphereDirections(64);
    expect(directions.length).toBe(64);
    for (const direction of directions) expect(direction.length()).toBeCloseTo(1, 6);
  });

  it('is deterministic across calls', () => {
    expect(fibonacciSphereDirections(32)).toEqual(fibonacciSphereDirections(32));
  });
});

describe('castOccluderRay', () => {
  const scene = buildWoodedStructureScene();

  it('hits canopy for a ray aimed straight up through a tree', () => {
    const tree = scene.trees[0]!;
    const origin: readonly [number, number, number] = [tree.positionM[0], tree.positionM[1], 2.5];
    expect(castOccluderRay(scene, origin, new THREE.Vector3(0, 0, 1))).toBe('canopy');
  });

  it('hits structure for a ray aimed at the box from well outside it', () => {
    const origin: readonly [number, number, number] = [scene.structure.centerM[0], scene.structure.centerM[1] - 40, 2.5];
    expect(castOccluderRay(scene, origin, new THREE.Vector3(0, 1, 0))).toBe('structure');
  });

  it('reads sky/ground for a point far from every occluder', () => {
    const origin: readonly [number, number, number] = [scene.boundsM[0] + 300, scene.boundsM[1] + 10, 2.5];
    expect(castOccluderRay(scene, origin, new THREE.Vector3(0, 0, 1))).toBe('sky');
    expect(castOccluderRay(scene, origin, new THREE.Vector3(0, 0, -1))).toBe('ground');
  });
});

describe('sampleRadiance', () => {
  it('interpolates sky color by elevation between the authored horizon and zenith swatches', () => {
    // MERIDIAN_STYLE.sky is art-directed, not a physical sky: horizon
    // (#DCE6EF, a pale haze) is the brighter swatch and zenith (#8FB3DA, a
    // deeper blue) the darker one — reusing it verbatim means this
    // experiment inherits that, rather than a "zenith is brightest"
    // assumption of its own.
    const grazing = sampleRadiance('sky', new THREE.Vector3(1, 0, 0.05));
    const overhead = sampleRadiance('sky', new THREE.Vector3(0, 0, 1));
    expect(relativeLuminance([grazing.r, grazing.g, grazing.b])).toBeGreaterThan(relativeLuminance([overhead.r, overhead.g, overhead.b]));
    expect(sampleRadiance('canopy', new THREE.Vector3(0, 0, 1))).toEqual(sampleRadiance('canopy', new THREE.Vector3(1, 0, 0)));
  });
});

describe('estimateProbeAtPosition', () => {
  const scene = buildWoodedStructureScene();
  const OPEN_POSITION: readonly [number, number, number] = [scene.boundsM[0] + 300, scene.boundsM[1] + 10, 2.5];
  const NEAR_TREES_POSITION: readonly [number, number, number] = [scene.boundsM[0] + 65, scene.boundsM[1] + 50, 2.5];

  it('reports a lower open fraction among the canopies than in the open (ordering, not a fixed magnitude)', () => {
    const open = estimateProbeAtPosition(scene, OPEN_POSITION);
    const nearTrees = estimateProbeAtPosition(scene, NEAR_TREES_POSITION);
    expect(open.openFraction).toBeGreaterThan(nearTrees.openFraction);
    expect(open.openFraction).toBeGreaterThan(0.9);
    expect(nearTrees.openFraction).toBeLessThan(0.7);
  });

  it('produces a 9-coefficient SH whose toArray is 27 floats', () => {
    const { sh } = estimateProbeAtPosition(scene, OPEN_POSITION);
    expect(sh.coefficients.length).toBe(9);
    expect(sh.toArray().length).toBe(27);
  });

  it('is deterministic: two estimates at the same position are deeply equal', () => {
    const a = estimateProbeAtPosition(scene, NEAR_TREES_POSITION);
    const b = estimateProbeAtPosition(scene, NEAR_TREES_POSITION);
    expect(a.sh.toArray()).toEqual(b.sh.toArray());
    expect(a.openFraction).toBe(b.openFraction);
  });

  it('the open-sky probe reads brighter (up-normal irradiance) than the near-canopy probe', () => {
    const open = estimateProbeAtPosition(scene, OPEN_POSITION);
    const nearTrees = estimateProbeAtPosition(scene, NEAR_TREES_POSITION);
    const openColor = probeIrradiance(new THREE.LightProbe(open.sh));
    const nearColor = probeIrradiance(new THREE.LightProbe(nearTrees.sh));
    expect(relativeLuminance([openColor.r, openColor.g, openColor.b])).toBeGreaterThan(relativeLuminance([nearColor.r, nearColor.g, nearColor.b]));
  });
});

describe('buildLightProbeGrid', () => {
  const scene = buildWoodedStructureScene();

  it('defaults to an 8x8 grid of real THREE.LightProbe instances inside bounds', () => {
    const grid = buildLightProbeGrid(scene);
    expect(grid.columns).toBe(8);
    expect(grid.rows).toBe(8);
    expect(grid.samples.length).toBe(64);
    expect(grid.basis).toBe('synthetic_experiment_scene');
    for (const sample of grid.samples) {
      expect(sample.probe.isLightProbe).toBe(true);
      expect(sample.positionM[0]).toBeGreaterThanOrEqual(scene.boundsM[0]);
      expect(sample.positionM[0]).toBeLessThanOrEqual(scene.boundsM[2]);
    }
  });

  it('honors a custom resolution', () => {
    const grid = buildLightProbeGrid(scene, { columns: 3, rows: 2 });
    expect(grid.samples.length).toBe(6);
  });

  it('is deterministic: two builds produce identical SH coefficients per cell', () => {
    const a = buildLightProbeGrid(scene, { columns: 3, rows: 3 });
    const b = buildLightProbeGrid(scene, { columns: 3, rows: 3 });
    expect(a.samples.map(s => s.probe.sh.toArray())).toEqual(b.samples.map(s => s.probe.sh.toArray()));
  });
});

describe('nearestProbeSample', () => {
  it('returns the closest cell by XY distance', () => {
    const grid = buildLightProbeGrid(buildWoodedStructureScene(), { columns: 4, rows: 4 });
    const target = grid.samples[5]!.positionM;
    const nearest = nearestProbeSample(grid, [target[0] + 0.1, target[1] - 0.1, target[2]]);
    expect(nearest.positionM).toEqual(target);
  });
});

describe('reportLightProbeGridCost', () => {
  it('reports exact probe count and SH byte payload, no fabricated overhead', () => {
    const grid = buildLightProbeGrid(buildWoodedStructureScene());
    const cost = reportLightProbeGridCost(grid);
    expect(cost.probeCount).toBe(64);
    expect(cost.bytesPerProbe).toBe(SH_BYTES_PER_PROBE);
    expect(cost.bytesPerProbe).toBe(grid.samples[0]!.probe.sh.toArray().length * 4);
    expect(cost.totalShBytes).toBe(64 * 108);
  });
});

describe('flatComparisonTerrainGrid / buildFlatBentSkyBaseline', () => {
  it('builds a schema-shaped flat grid whose heightsM matches columns*rows', () => {
    const grid = flatComparisonTerrainGrid(HOLE7_TACTICAL_BOUNDS_M);
    expect(grid.heightsM.length).toBe(grid.columns * grid.rows);
    expect(grid.heightsM.every(z => z === 0)).toBe(true);
  });

  it('reports full visibility everywhere on flat ground (bent-sky is blind to standing occluders it never receives)', () => {
    const { sky } = buildFlatBentSkyBaseline(HOLE7_TACTICAL_BOUNDS_M);
    for (const value of sky.visibility) expect(value).toBeGreaterThan(0.999);
  });
});

describe('compareToBentSky', () => {
  it('shows the probe grid reading less open than bent-sky at the same XY, near the trees', () => {
    const scene = buildWoodedStructureScene();
    const grid = buildLightProbeGrid(scene, { columns: 8, rows: 8 });
    const { terrain, sky } = buildFlatBentSkyBaseline(scene.boundsM);
    const comparison = compareToBentSky(grid, terrain, sky);
    const nearestToTrees = comparison.reduce((best, sample) => {
      const d = (sample.positionM[0] - (scene.boundsM[0] + 65)) ** 2 + (sample.positionM[1] - (scene.boundsM[1] + 50)) ** 2;
      const bestD = (best.positionM[0] - (scene.boundsM[0] + 65)) ** 2 + (best.positionM[1] - (scene.boundsM[1] + 50)) ** 2;
      return d < bestD ? sample : best;
    });
    expect(nearestToTrees.bentSkyVisibility).toBeGreaterThan(0.999);
    expect(nearestToTrees.probeOpenFraction).toBeLessThan(nearestToTrees.bentSkyVisibility);
  });
});

describe('attachNearestProbe / detachManagedProbe (WebGLLights summing-hazard regression guard)', () => {
  it('keeps exactly one managed LightProbe in the scene across repeated attaches', () => {
    const grid = buildLightProbeGrid(buildWoodedStructureScene(), { columns: 4, rows: 4 });
    const scene = new THREE.Scene();
    const first = attachNearestProbe(scene, grid, grid.samples[0]!.positionM);
    expect(scene.children.filter(c => (c as THREE.LightProbe).isLightProbe).length).toBe(1);
    const second = attachNearestProbe(scene, grid, grid.samples[grid.samples.length - 1]!.positionM);
    const managed = scene.children.filter(c => (c as THREE.LightProbe).isLightProbe);
    expect(managed.length).toBe(1);
    expect(managed[0]).toBe(second);
    expect(managed[0]).not.toBe(first);
    expect(second.userData[LIGHT_PROBE_EXPERIMENT_TAG]).toBe(true);
  });

  it('detachManagedProbe removes it and leaves other scene children alone', () => {
    const grid = buildLightProbeGrid(buildWoodedStructureScene(), { columns: 2, rows: 2 });
    const scene = new THREE.Scene();
    const mesh = new THREE.Object3D();
    scene.add(mesh);
    attachNearestProbe(scene, grid, grid.samples[0]!.positionM);
    detachManagedProbe(scene);
    expect(scene.children.filter(c => (c as THREE.LightProbe).isLightProbe).length).toBe(0);
    expect(scene.children).toContain(mesh);
  });
});

describe('captureLightProbeFromScene (guarded real path)', () => {
  it('resolves to null with no renderer, touching no GPU/DOM API', async () => {
    await expect(captureLightProbeFromScene(null, new THREE.Scene(), [0, 0, 0])).resolves.toBeNull();
    await expect(captureLightProbeFromScene(undefined, new THREE.Scene(), [0, 0, 0])).resolves.toBeNull();
  });
});
