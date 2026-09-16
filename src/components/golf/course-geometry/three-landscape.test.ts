import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildThreeLandscape, DEFAULT_THREE_LANDSCAPE_PALETTE } from './three-landscape';
import { MERIDIAN_STYLE } from '@/lib/golf/course-geometry/visual-style';
import { compileVisualArtifact, linearAlbedo, SURFACE_CLASS_IDS } from '@/lib/golf/course-geometry/visual-artifact';
import { installTerrainDebugView } from './terrain-debug';
import { pilotPackage, pilotScene } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import { inFeature } from '@/lib/golf/course-geometry/spatial';
import { boundaryDistance } from '@/lib/golf/course-geometry/display-outline';
import { parseTerrainMesh, terrainHeight, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { LocalFeature, PointM } from '@/lib/golf/course-geometry/types';

const referenceMesh = parseTerrainMesh(source, pilotPackage);
function slopeMesh(): TerrainMesh {
  return { ...referenceMesh, vertices: [0, 0, 100, 100, 0, 110, 0, 100, 100,
    100, 0, 110, 100, 100, 110, 0, 100, 100],
    triangleFeatures: [0, 0], triangleMaterials: [0, 0], featureIds: ['terrain-context'],
    featureKinds: ['ground'], referenceElevationM: 100, sourceNormals: undefined, metricGrid: undefined,
    contextFeatureIds: undefined, renderProfile: undefined };
}
function square(id: string, kind: LocalFeature['kind'], min: number, max: number): LocalFeature {
  return { id, kind, reviewed: true, type: 'Polygon',
    parts: [[[[min, min], [max, min], [max, max], [min, max], [min, min]]]] };
}

describe('Three landscape source and rendering invariants', () => {
  it('keeps elevation colors attached to source positions when clockwise triangles are rewound', () => {
    const mesh = slopeMesh();
    mesh.vertices.splice(3, 6, 0, 100, 100, 100, 0, 110);
    const landscape = buildThreeLandscape({ ...pilotScene('cacapon-07', false), features: [] }, mesh);
    const world = new THREE.Scene(); world.add(landscape.group);
    const release = installTerrainDebugView(world, landscape, mesh, 'wireframe-elevation',
      { shadowMap: { enabled: true } } as THREE.WebGLRenderer);
    const geometry = landscape.terrain.geometry, position = geometry.getAttribute('position'), color = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i++) {
      const expected = new THREE.Color().setHSL(.68 - .6 * (position.getZ(i) - 100) / 10, .7, .5);
      expect(color.getX(i)).toBeCloseTo(expected.r, 6);
      expect(color.getY(i)).toBeCloseTo(expected.g, 6);
      expect(color.getZ(i)).toBeCloseTo(expected.b, 6);
    }
    release(); landscape.dispose();
  });

  it('softens the canopy floor contrast without moving its accepted terrain footprint', () => {
    const scene = { ...pilotScene('cacapon-07', false), features: [] }, mesh = slopeMesh();
    mesh.featureKinds = ['woods'];
    const sourceVertices = [...mesh.vertices], landscape = buildThreeLandscape(scene, mesh);
    const color = landscape.terrain.geometry.getAttribute('color');
    const woods = new THREE.Color(DEFAULT_THREE_LANDSCAPE_PALETTE.woods);
    const rough = new THREE.Color(DEFAULT_THREE_LANDSCAPE_PALETTE.rough);
    const luminance = (r: number, g: number, b: number) => .2126 * r + .7152 * g + .0722 * b;
    const floorLuminance = luminance(color.getX(0), color.getY(0), color.getZ(0));
    expect(floorLuminance).toBeGreaterThan(luminance(woods.r, woods.g, woods.b));
    expect(floorLuminance).toBeLessThan(luminance(rough.r, rough.g, rough.b));
    expect(Array.from(landscape.terrain.geometry.getAttribute('position').array)).toEqual(sourceVertices);
    expect(mesh.vertices).toEqual(sourceVertices);
    landscape.dispose();
  });

  it('keeps terrain opaque through the tactical context without fading lighting defects into the backdrop', () => {
    const scene = { ...pilotScene('cacapon-07', false), features: [] }, mesh = slopeMesh();
    mesh.vertices = [0, 0, 100, 100, 0, 110, 50, 50, 105,
      100, 0, 110, 100, 100, 110, 50, 50, 105,
      100, 100, 110, 0, 100, 100, 50, 50, 105,
      0, 100, 100, 0, 0, 100, 50, 50, 105];
    mesh.triangleFeatures = [0, 1, 0, 0]; mesh.triangleMaterials = [0, 0, 0, 0];
    mesh.featureKinds = ['ground', 'green']; mesh.featureIds = ['terrain-context', 'test-green'];
    const landscape = buildThreeLandscape(scene, mesh);
    // Context weight dims and desaturates albedo only; it is never an alpha.
    expect(landscape.terrain.geometry.getAttribute('golfContextWeight')).toBeDefined();
    expect(landscape.terrain.material.userData.contextFade).toBeUndefined();
    expect(landscape.terrain.material.userData.styleHash).toBe(landscape.artifact.styleHash);
    expect(landscape.artifactSource).toBe('runtime');
    landscape.setStyleOverrides({ macro: 0, context: 0 });
    expect(landscape.terrain.material.transparent).toBe(false);
    expect(landscape.terrain.material.depthWrite).toBe(true);
    landscape.dispose();
  });

  it('draws a render-only bunker bowl: interior display vertices drop, rim and source stay, picks stay canonical', () => {
    const scene = { ...pilotScene('cacapon-07', false), features: [square('test-bunker', 'bunker', 0, 100)] }, mesh = slopeMesh();
    mesh.vertices = [0, 0, 100, 100, 0, 110, 50, 50, 105,
      100, 0, 110, 100, 100, 110, 50, 50, 105,
      100, 100, 110, 0, 100, 100, 50, 50, 105,
      0, 100, 100, 0, 0, 100, 50, 50, 105];
    mesh.triangleFeatures = [0, 0, 0, 0]; mesh.triangleMaterials = [0, 0, 0, 0];
    mesh.featureKinds = ['bunker']; mesh.featureIds = ['test-bunker'];
    const sourceVertices = [...mesh.vertices];
    const landscape = buildThreeLandscape(scene, mesh);
    const profile = landscape.artifact.layers.bunkerBowl.profiles[0]!;
    expect(profile).toMatchObject({ featureId: 'test-bunker', sizeClass: 'large', depthBasis: 'visual_class', contextOnly: false });
    const position = landscape.terrain.geometry.getAttribute('position'), normal = landscape.terrain.geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      const centre = position.getX(i) === 50 && position.getY(i) === 50;
      if (centre) { expect(position.getZ(i)).toBeCloseTo(105 - profile.depthM, 4); expect(normal.getZ(i)).toBeGreaterThan(.9); }
      else expect(position.getZ(i)).toBe(position.getX(i) === 100 ? 110 : 100);
    }
    // Relief scales the bowl like every other display height; source never moves.
    landscape.setExaggeration(2, 100);
    for (let i = 0; i < position.count; i++) if (position.getX(i) === 50) expect(position.getZ(i)).toBeCloseTo(100 + (105 - 100) * 2 - profile.depthM * 2, 4);
    expect(mesh.vertices).toEqual(sourceVertices);
    expect(terrainHeight(mesh, [50, 50])).toBe(105);
    landscape.dispose();
  });

  it('uses DEM source normals across triangle rewinding and applies the inverse-Z normal transform', () => {
    const scene = { ...pilotScene('cacapon-07', false), features: [] }, mesh = slopeMesh();
    // Reverse one face; the imported normals still correspond to its original vertices.
    mesh.vertices.splice(3, 6, 0, 100, 100, 100, 0, 110);
    const sourceByPoint = new Map<string, THREE.Vector3>();
    mesh.sourceNormals = [];
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const normal = new THREE.Vector3(-mesh.vertices[i]! / 500, mesh.vertices[i + 1]! / 1000, 1).normalize();
      sourceByPoint.set(mesh.vertices.slice(i, i + 3).join(','), normal);
      mesh.sourceNormals.push(normal.x, normal.y, normal.z);
    }
    const snapshot = structuredClone(mesh), landscape = buildThreeLandscape(scene, mesh);
    const positions = landscape.terrain.geometry.getAttribute('position'), normals = landscape.terrain.geometry.getAttribute('normal');
    for (const exaggeration of [1, 1.5]) {
      landscape.setExaggeration(exaggeration, 100);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const key = [positions.getX(vertex), positions.getY(vertex), 100 + (positions.getZ(vertex) - 100) / exaggeration].join(',');
        const expected = sourceByPoint.get(key)!.clone(); expected.z /= exaggeration; expected.normalize();
        expect(normals.getX(vertex)).toBeCloseTo(expected.x, 6);
        expect(normals.getY(vertex)).toBeCloseTo(expected.y, 6);
        expect(normals.getZ(vertex)).toBeCloseTo(expected.z, 6);
      }
    }
    expect(mesh).toEqual(snapshot);
    landscape.dispose();
  });

  it('preserves all source coordinates and updates lit normals for the displayed slope', () => {
    const scene = { ...pilotScene('cacapon-07', false), features: [] }, mesh = slopeMesh();
    const original = structuredClone(mesh), landscape = buildThreeLandscape(scene, mesh);
    const geometry = landscape.terrain.geometry, positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal'), colors = Array.from(geometry.getAttribute('color').array);
    for (const exaggeration of [1, 1.5, 2, 1]) {
      landscape.setExaggeration(exaggeration, 100);
      const expectedNormal = new THREE.Vector3(-.1 * exaggeration, 0, 1).normalize();
      for (let vertex = 0; vertex < positions.count; vertex++) {
        expect(positions.getX(vertex)).toBe(mesh.vertices[vertex * 3]);
        expect(positions.getY(vertex)).toBe(mesh.vertices[vertex * 3 + 1]);
        expect(positions.getZ(vertex)).toBeCloseTo(100 + (mesh.vertices[vertex * 3 + 2]! - 100) * exaggeration, 5);
        expect(normals.getX(vertex)).toBeCloseTo(expectedNormal.x, 6);
        expect(normals.getY(vertex)).toBeCloseTo(expectedNormal.y, 6);
        expect(normals.getZ(vertex)).toBeCloseTo(expectedNormal.z, 6);
      }
      expect(Array.from(geometry.getAttribute('color').array)).toEqual(colors);
    }
    // No playing surface anywhere in this scene, so bare ground is outer rough
    // (outside world §21): the outer tone, darkened a little by the slope.
    const artifact = compileVisualArtifact(scene, mesh);
    expect(SURFACE_CLASS_IDS[artifact.attributes.surfaceClass[0]!]).toBe('rough_outer');
    const outer = new THREE.Color(MERIDIAN_STYLE.palette.roughOuter);
    expect(colors.slice(0, 3)).toEqual(Array.from(linearAlbedo(artifact).subarray(0, 3)).map(value => Math.fround(value)));
    expect(colors[0]).toBeLessThan(outer.r); expect(colors[0]).toBeGreaterThan(outer.r * .85);
    expect(mesh).toEqual(original);
    expect(landscape.counts.terrainTriangles).toBe(2);
    expect(landscape.counts.trees).toBe(0);
    landscape.dispose();
  });

  it('places opaque crown volumes only in reviewed source canopy and preserves their local size when terrain is exaggerated', () => {
    const woods = square('reviewed-canopy', 'woods', 0, 100), green = square('green', 'green', 35, 65);
    const scene = { ...pilotScene('cacapon-07', false), features: [woods, green] }, mesh = slopeMesh();
    const landscape = buildThreeLandscape(scene, mesh);
    const crowns = landscape.group.children.filter(child => child.name.startsWith('source-canopy-crowns')) as THREE.InstancedMesh[];
    expect(new Set(crowns.map(batch => batch.userData.family)).size).toBe(8);
    expect(new Set(crowns.map(batch => batch.userData.tile)).size).toBeGreaterThan(1);
    expect(landscape.counts.trees).toBeGreaterThan(30);
    const matrices = new Map<THREE.InstancedMesh, THREE.Matrix4[]>();
    for (const batch of crowns) {
      const material = batch.material as THREE.MeshStandardMaterial;
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
      expect(batch.castShadow && batch.receiveShadow).toBe(true);
      const positions = batch.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) expect(Math.hypot(positions.getX(i), positions.getY(i))).toBeLessThanOrEqual(1.000001);
      const originals: THREE.Matrix4[] = [];
      for (let i = 0; i < batch.count; i++) {
        const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
        batch.getMatrixAt(i, matrix); originals.push(matrix.clone());
        matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        const point: PointM = [matrix.elements[12]!, matrix.elements[13]!];
        expect(inFeature(point, woods)).toBe(true);
        expect(inFeature(point, green)).toBe(false);
        expect(boundaryDistance(point, woods.parts[0]![0]!)).toBeGreaterThanOrEqual(scale.x - .00001);
        expect(boundaryDistance(point, green.parts[0]![0]!)).toBeGreaterThanOrEqual(scale.x - .00001);
      }
      matrices.set(batch, originals);
    }
    landscape.setExaggeration(2, 100);
    for (const batch of crowns) for (let i = 0; i < batch.count; i++) {
      const next = new THREE.Matrix4(); batch.getMatrixAt(i, next);
      const original = matrices.get(batch)![i]!;
      // Scale, rotation and horizontal position are unchanged. Only ground Z moves.
      expect(next.elements.slice(0, 14)).toEqual(original.elements.slice(0, 14));
      const groundZ = terrainHeight(mesh, [original.elements[12]!, original.elements[13]!]!)!;
      expect(next.elements[14]! - original.elements[14]!).toBeCloseTo(groundZ - 100, 4);
    }
    const unreviewed = buildThreeLandscape({ ...scene, features: [{ ...woods, reviewed: false }, green] }, mesh);
    expect(unreviewed.counts.trees).toBe(0);
    unreviewed.dispose(); landscape.dispose();
  });

  it('mixes seven families by depth into the woods, carries the interior with a forest mass, and keeps trunks to the near band (§36–39)', () => {
    const woods = square('big-woods', 'woods', 0, 320), copse = square('copse', 'woods', 400, 440), green = square('green', 'green', 140, 180);
    const base = pilotScene('cacapon-07', false), mesh = slopeMesh();
    mesh.vertices = [0, 0, 100, 500, 0, 100, 0, 500, 100, 500, 0, 100, 500, 500, 100, 0, 500, 100];
    const landscape = buildThreeLandscape({ ...base, features: [woods, copse, green] }, mesh);
    const families = landscape.counts.families;
    expect(Object.keys(families).length).toBeGreaterThanOrEqual(4);
    const edgeBand = MERIDIAN_STYLE.vegetation.edgeBandM, byPlacement = new Map(MERIDIAN_STYLE.vegetation.families.map(f => [f.id, f.placement]));
    let edgeTrees = 0, interiorTrees = 0;
    for (const child of landscape.group.children) if (child.name.startsWith('source-canopy-crowns')) {
      const batch = child as THREE.InstancedMesh, matrix = new THREE.Matrix4();
      for (let i = 0; i < batch.count; i++) {
        batch.getMatrixAt(i, matrix);
        const x = matrix.elements[12]!, y = matrix.elements[13]!;
        const inBig = x >= 0 && x <= 320 && y >= 0 && y <= 320;
        const edge = inBig ? Math.min(x, y, 320 - x, 320 - y) : Math.min(x - 400, y - 400, 440 - x, 440 - y);
        const placement = byPlacement.get(batch.userData.families[i])!;
        if (edge < edgeBand) { edgeTrees++; expect(placement).not.toBe('interior'); } else { interiorTrees++; expect(placement).not.toBe('edge'); }
      }
    }
    expect(edgeTrees).toBeGreaterThan(0); expect(interiorTrees).toBeGreaterThan(0);
    // Forest mass exists only where a woods polygon has an interior beyond the inset; the copse has none.
    expect(landscape.counts.massLobes).toBeGreaterThan(20);
    const mass = landscape.group.children.filter(child => child.name.startsWith('source-forest-mass')) as THREE.InstancedMesh[];
    const lobe = new THREE.Matrix4();
    for (const batch of mass) for (let i = 0; i < batch.count; i++) {
      batch.getMatrixAt(i, lobe);
      const x = lobe.elements[12]!, y = lobe.elements[13]!;
      expect(Math.min(x, y, 320 - x, 320 - y)).toBeGreaterThanOrEqual(MERIDIAN_STYLE.vegetation.mass.insetM - 1e-6);
      expect(Math.hypot(Math.max(0, Math.max(140 - x, x - 180)), Math.max(0, Math.max(140 - y, y - 180)))).toBeGreaterThan(5);
    }
    // Trunks: cheap everywhere within twice the band, hidden beyond, detailed near the focus.
    const trunkBatches = () => landscape.group.children.filter(child => child.name.startsWith('source-canopy-trunks')) as THREE.InstancedMesh[];
    // Focus at the woods corner: the copse (~530 m away) sits beyond twice the band.
    landscape.setDetail('distant', [40, 40]);
    const visibleFar = trunkBatches().filter(batch => batch.visible).length, hiddenFar = trunkBatches().filter(batch => !batch.visible).length;
    expect(hiddenFar).toBeGreaterThan(0); expect(visibleFar).toBeGreaterThan(0);
    landscape.setDetail('near', [40, 40]);
    expect(trunkBatches().some(batch => batch.userData.lod === 'near')).toBe(true);
    expect(landscape.counts.trunksVisible).toBeGreaterThan(0);
    const budgetless = buildThreeLandscape({ ...base, features: [woods, copse, green] }, mesh, undefined, { overrides: { crowns: 0, mass: 0 } });
    expect(budgetless.counts.trees).toBe(0); expect(budgetless.counts.massLobes).toBe(0);
    budgetless.dispose(); landscape.dispose();
  });

  it('darkens turf at the drawn shoreline, marks water as shoreline-distance only, and shades the ground under placed crowns (§44–45, §50)', () => {
    const woods = square('woods', 'woods', 0, 60), pond = square('pond', 'water', 200, 260), rough = square('rough', 'rough', 150, 310);
    const base = pilotScene('cacapon-07', false), mesh = slopeMesh();
    // Extra ground triangles put one display vertex 0.3 m outside the pond
    // and three inside the woods interior.
    mesh.vertices = [0, 0, 100, 500, 0, 100, 0, 500, 100, 500, 0, 100, 500, 500, 100, 0, 500, 100,
      199.7, 230, 100, 150, 200, 100, 150, 260, 100, 30, 30, 100, 40, 30, 100, 30, 40, 100];
    mesh.triangleFeatures = [0, 0, 0, 0]; mesh.triangleMaterials = [0, 0, 0, 0];
    const landscape = buildThreeLandscape({ ...base, features: [woods, pond, rough] }, mesh);
    const water = landscape.artifact.layers.water;
    expect(water).toMatchObject({ basis: 'visual_only', depthBasis: 'shoreline_distance', version: 'static-fresnel-v1' });
    // The pond's ribbon vertices are turf inside the contact band: they darken.
    expect(water.contactVertices).toBeGreaterThan(0);
    expect(landscape.terrain.material.userData.water).toMatchObject({ basis: 'visual_only', depthBasis: 'shoreline_distance', reflection: 'fresnel_static' });
    const shade = landscape.terrain.geometry.getAttribute('golfCanopyShade') as THREE.BufferAttribute, positions = landscape.terrain.geometry.getAttribute('position');
    expect(shade.count).toBe(positions.count);
    let underCrowns = 0, farFromCrowns = 0;
    for (let v = 0; v < shade.count; v++) {
      const x = positions.getX(v), y = positions.getY(v);
      if (x > 100 || y > 100) { expect(shade.getX(v)).toBe(0); farFromCrowns++; } else if (shade.getX(v) > 0) underCrowns++;
    }
    expect(farFromCrowns).toBeGreaterThan(0); expect(underCrowns).toBeGreaterThan(0);
    landscape.dispose();
  });

  it('keeps source tree identities and transforms stable across hole order and shared context, then changes LOD without moving trees', () => {
    const woods = square('reviewed-canopy', 'woods', 0, 100), green = square('green', 'green', 35, 65);
    const base = pilotScene('cacapon-07', false), mesh = slopeMesh();
    const scene = { ...base, features: [green], contextFeatures: [woods] };
    const snapshot = structuredClone(scene), landscape = buildThreeLandscape(scene, mesh);
    // The visual artifact is hash-locked to the mesh's package (§6), so the
    // second scene keeps that hash; tree identity comes from the course frame.
    const other = buildThreeLandscape({ ...base, hole: { ...base.hole, ordinal: 18 },
      features: [woods], contextFeatures: [green] }, mesh);
    const colors = new Map<string, number[]>();
    const records = (model: typeof landscape) => {
      const result = new Map<string, { matrix: number[]; family: string }>();
      for (const child of model.group.children) if (child.name.startsWith('source-canopy-crowns')) {
        const batch = child as THREE.InstancedMesh;
        for (let i = 0; i < batch.count; i++) {
          const matrix = new THREE.Matrix4(), color = new THREE.Color();
          batch.getMatrixAt(i, matrix); batch.getColorAt(i, color);
          result.set(batch.userData.treeIds[i], { matrix: matrix.toArray(), family: batch.userData.family });
          colors.set(`${model === landscape ? 'context' : 'own'}:${batch.userData.treeIds[i]}`, color.toArray());
        }
      }
      return result;
    };
    const before = records(landscape), distantTriangles = landscape.counts.crownTriangles;
    expect(before.size).toBeGreaterThan(30);
    expect(before).toEqual(records(other));
    // §53: the same tree is quieter (less saturated, a little darker) when its
    // woods is shared context rather than the played hole's own feature.
    const saturation = ([r = 0, g = 0, b = 0]: number[]) => Math.max(r, g, b) - Math.min(r, g, b);
    for (const id of before.keys()) {
      const own = colors.get(`own:${id}`)!, context = colors.get(`context:${id}`)!;
      expect(saturation(context)).toBeLessThan(saturation(own));
      const luma = ([r = 0, g = 0, b = 0]: number[]) => r * .2126 + g * .7152 + b * .0722;
      expect(luma(context)).toBeLessThan(luma(own));
    }
    expect(landscape.counts.drawCalls).toBeLessThan(100);
    expect(landscape.counts.totalTriangles).toBeLessThan(150000);
    expect(landscape.setDetail('distant')).toBe(false);
    expect(landscape.setDetail('near')).toBe(true);
    expect(landscape.setDetail('near')).toBe(false);
    const nearTriangles = landscape.counts.crownTriangles;
    expect(nearTriangles).toBeGreaterThan(distantTriangles);
    expect(records(landscape)).toEqual(before);
    expect(landscape.setDetail('distant')).toBe(true);
    expect(landscape.counts.crownTriangles).toBe(distantTriangles);
    // A focus limits near crowns to the batch tiles around it: nothing changes
    // for a focus far from every crown, and a focus on one crown upgrades only
    // its neighbourhood.
    // (§37: trunks beyond twice the band hide, so the call itself reports a change.)
    landscape.setDetail('near', [1e5, 1e5]);
    expect(landscape.counts.crownTriangles).toBe(distantTriangles);
    expect(landscape.counts.trunksVisible).toBe(0);
    const first = before.values().next().value!.matrix;
    expect(landscape.setDetail('near', [first[12]!, first[13]!])).toBe(true);
    expect(landscape.counts.crownTriangles).toBeGreaterThan(distantTriangles);
    expect(landscape.counts.crownTriangles).toBeLessThanOrEqual(nearTriangles);
    expect(records(landscape)).toEqual(before);
    expect(landscape.setDetail('distant')).toBe(true);
    expect(scene).toEqual(snapshot);
    landscape.dispose(); other.dispose();
  });

  it('uses available crown width while keeping centers and heights stable near new exclusions and polygon holes', () => {
    const woods = square('reviewed-canopy', 'woods', 0, 100), green = square('green', 'green', 35, 65);
    const hole = square('canopy-gap', 'woods', 72, 88).parts[0]![0]!;
    woods.parts[0]!.push(hole);
    const base = { ...pilotScene('cacapon-07', false), features: [woods] }, mesh = slopeMesh();
    const full = buildThreeLandscape(base, mesh), restricted = buildThreeLandscape({ ...base, features: [woods, green] }, mesh);
    const records = (model: typeof full) => {
      const result = new Map<string, { position: THREE.Vector3; scale: THREE.Vector3 }>();
      for (const child of model.group.children) if (child.name.startsWith('source-canopy-crowns')) {
        const batch = child as THREE.InstancedMesh;
        for (let i = 0; i < batch.count; i++) {
          const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
          batch.getMatrixAt(i, matrix); matrix.decompose(position, new THREE.Quaternion(), scale);
          result.set(batch.userData.treeIds[i], { position, scale });
          const point: PointM = [position.x, position.y];
          expect(inFeature(point, woods)).toBe(true);
          for (const ring of woods.parts[0]!) expect(boundaryDistance(point, ring)).toBeGreaterThan(scale.x);
        }
      }
      return result;
    };
    const before = records(full), after = records(restricted);
    let shared = 0, narrowed = 0;
    expect([...before.values()].some(tree => tree.scale.x > 5)).toBe(true);
    for (const [id, next] of after) {
      const previous = before.get(id);
      if (!previous) continue;
      shared++;
      expect(next.position.toArray()).toEqual(previous.position.toArray());
      expect(next.scale.z).toBeCloseTo(previous.scale.z, 6);
      expect(boundaryDistance([next.position.x, next.position.y], green.parts[0]![0]!)).toBeGreaterThan(next.scale.x);
      if (next.scale.x < previous.scale.x - .01) narrowed++;
    }
    expect(shared).toBeGreaterThan(20);
    expect(narrowed).toBeGreaterThan(0);
    full.dispose(); restricted.dispose();
  });

  it('owns and releases each GPU resource once, while unchanged camera poses do not rewrite geometry', () => {
    const scene = { ...pilotScene('cacapon-07', false), features: [square('canopy', 'woods', 0, 100)] };
    const landscape = buildThreeLandscape(scene, slopeMesh());
    const owned = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh>();
    // Context objects live in a nested group; walk one level into it.
    for (const child of landscape.group.children.flatMap(c => c instanceof THREE.Group ? c.children : [c]) as THREE.Mesh[]) {
      owned.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) owned.add(material);
      if (child instanceof THREE.InstancedMesh) owned.add(child);
    }
    const disposals = [...owned].map(resource => vi.spyOn(resource, 'dispose'));
    const positions = landscape.terrain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const version = positions.version;
    landscape.setExaggeration(1, 100);
    expect(positions.version).toBe(version);
    landscape.dispose(); landscape.dispose();
    for (const disposal of disposals) expect(disposal).toHaveBeenCalledTimes(1);
    expect(landscape.group.children).toHaveLength(0);
  });
});
