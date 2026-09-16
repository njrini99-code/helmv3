import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { buildHoleScene } from '../build-scene';
import { parseGeometryPackage } from '../schema';
import { applyTerrainCamera, displayTerrainPoint, pickTerrainPoint } from '../three-camera';
import { fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, TERRAIN_PRESETS, type Point3M, type TerrainMesh } from '../terrain';
import { fitTerrainViewportCamera } from '../terrain-viewport';
import course from '@/test/fixtures/course-geometry/cacapon.json';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const pkg = parseGeometryPackage(course), mesh = parseTerrainMesh(source, pkg);
const scene = buildHoleScene(pkg, 'cacapon-07', [], mesh);

describe('Three world-camera adapter', () => {
  it('exactly matches shared metric projection across tilt, yaw, exaggeration, zoom and pan', () => {
    const points: Point3M[] = [];
    for (let i = 0; i < mesh.vertices.length; i += 267) points.push(mesh.vertices.slice(i, i + 3) as unknown as Point3M);
    const three = new OrthographicCamera();
    for (const [width, height] of [[375, 520], [430, 600]] as const) {
      for (const pitch of [20, 50, 90]) for (const yawOffset of [-45, 0, 45]) for (const exaggeration of [1, 1.5]) {
        const camera = fitTerrainCamera(scene, mesh, 'hole', width, height, { pitch, yawOffset, exaggeration }, 1.7, [17, -23]);
        applyTerrainCamera(three, camera, width, height);
        for (const point of points) {
          const expected = projectTerrainPoint(point, camera);
          const actual = new Vector3(...displayTerrainPoint(point, camera)).project(three);
          expect((actual.x + 1) * width / 2).toBeCloseTo(expected[0], 8);
          expect((1 - actual.y) * height / 2).toBeCloseTo(expected[1], 8);
        }
      }
    }
  });

  it('exactly matches the shared perspective projector across pitch, yaw, relief, zoom and pan', () => {
    const points: Point3M[] = [];
    for (let i = 0; i < mesh.vertices.length; i += 267) points.push(mesh.vertices.slice(i, i + 3) as unknown as Point3M);
    const three = new PerspectiveCamera();
    for (const [width, height] of [[375, 520], [430, 600]] as const) {
      for (const pitch of [20, 44, 90]) for (const yawOffset of [-45, 0, 45]) for (const exaggeration of [1, 1.5]) for (const fovDegrees of [4, 32]) {
        const camera = fitTerrainCamera(scene, mesh, 'hole', width, height, { pitch, yawOffset, exaggeration, projection: 'perspective', fovDegrees }, 1.7, [17, -23], 'terrain');
        applyTerrainCamera(three, camera, width, height);
        expect(camera.projection).toBe('perspective');
        let compared = 0;
        for (const point of points) {
          const expected = projectTerrainPoint(point, camera);
          if (expected[2] < 1) continue; // behind or at the eye: no screen position exists
          const actual = new Vector3(...displayTerrainPoint(point, camera)).project(three);
          expect((actual.x + 1) * width / 2).toBeCloseTo(expected[0], 8);
          expect((1 - actual.y) * height / 2).toBeCloseTo(expected[1], 8);
          compared++;
        }
        expect(compared).toBeGreaterThan(points.length / 2);
        // The Three eye is the projector's eye and the pivot lands on the principal point.
        expect([three.position.x, three.position.y, three.position.z]).toEqual(camera.eyeM);
        const pivot = new Vector3(...displayTerrainPoint(camera.focusM, camera)).project(three);
        expect((pivot.x + 1) * width / 2).toBeCloseTo(camera.translation[0], 8);
        expect((1 - pivot.y) * height / 2).toBeCloseTo(camera.translation[1], 8);
      }
    }
    expect(() => applyTerrainCamera(new OrthographicCamera(), fitTerrainCamera(scene, mesh, 'hole', 375, 520, TERRAIN_PRESETS.terrain, 1, [0, 0], 'terrain'), 375, 520)).toThrow('Invalid Three camera');
  });

  it('round-trips world → screen → pick → canonical source through every shipped preset (Meridian §106.2)', () => {
    const width = 390, height = 640;
    const initial = fitTerrainCamera(scene, mesh, 'hole', width, height, TERRAIN_PRESETS.top);
    const [fx, fy] = initial.focusM;
    const sourcePoint = (x: number, y: number): Point3M => [x, y, mesh.referenceElevationM + (x - fx) * .025 + (y - fy) * .015];
    const points = [[fx - 300, fy - 300], [fx + 300, fy - 300], [fx + 300, fy + 300],
      [fx - 300, fy - 300], [fx + 300, fy + 300], [fx - 300, fy + 300]] as const;
    const testMesh: TerrainMesh = { ...mesh, vertices: points.flatMap(([x, y]) => [...sourcePoint(x, y)]),
      triangleFeatures: [0, 0], triangleMaterials: [0, 0], featureIds: ['terrain-context'], featureKinds: ['ground'] };
    const material = new MeshBasicMaterial();
    const geometry = new BufferGeometry(), terrain = new Mesh(geometry, material);
    try {
      for (const [preset, pose] of Object.entries(TERRAIN_PRESETS)) for (const zoom of [1, 2.5]) {
        const camera = fitTerrainCamera(scene, mesh, 'hole', width, height, pose, zoom, [9, -14], preset as keyof typeof TERRAIN_PRESETS);
        const three = camera.projection === 'perspective' ? new PerspectiveCamera() : new OrthographicCamera();
        geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(([x, y]) => [...displayTerrainPoint(sourcePoint(x, y), camera)]), 3));
        geometry.computeBoundingSphere();
        applyTerrainCamera(three, camera, width, height);
        let inside = 0;
        for (const [dx, dy] of [[-25, 10], [10, 30], [0, 0], [40, -35]]) {
          const expected = sourcePoint(fx + dx!, fy + dy!);
          const [x, y] = projectTerrainPoint(expected, camera);
          const picked = pickTerrainPoint(terrain, three, testMesh, x, y, width, height);
          // A zoomed lens can push a probe off the viewport; a pick there is
          // honestly null rather than a clamped guess.
          if (x < 0 || x > width || y < 0 || y > height) { expect(picked).toBeNull(); continue; }
          inside++;
          expect(picked).not.toBeNull();
          expect(picked![0]).toBeCloseTo(expected[0], 3);
          expect(picked![1]).toBeCloseTo(expected[1], 3);
          expect(picked![2]).toBeCloseTo(expected[2], 4);
        }
        expect(inside).toBeGreaterThanOrEqual(2);
      }
    } finally { geometry.dispose(); material.dispose(); }
  });

  it('preserves screen-safe framing and known 150/350 yard geometry at Top', () => {
    const width = 390, height = 640, three = new OrthographicCamera();
    const camera = fitTerrainViewportCamera(scene, mesh, 'hole', width, height,
      { pitch: 90, yawOffset: 30, exaggeration: 1 }, .5, [14, -7]);
    applyTerrainCamera(three, camera, width, height);
    const screen = (point: Point3M) => {
      const result = new Vector3(...displayTerrainPoint(point, camera)).project(three);
      return [(result.x + 1) * width / 2, (1 - result.y) * height / 2];
    };
    const start: Point3M = [0, 0, mesh.referenceElevationM];
    const end: Point3M = [0, 350 * .9144, mesh.referenceElevationM];
    const shot: Point3M = [0, 150 * .9144, mesh.referenceElevationM];
    const a = screen(start), b = screen(end), c = screen(shot);
    const gap = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!);
    expect(gap(a, c) / gap(a, b)).toBeCloseTo(150 / 350, 12);
    expect(gap(a, c)).toBeCloseTo(150 * .9144 * camera.scale, 9);
    const focus = screen(camera.focusM), expected = projectTerrainPoint(camera.focusM, camera);
    expect(focus[0]).toBeCloseTo(expected[0], 8);
    expect(focus[1]).toBeCloseTo(expected[1], 8);
  });

  it('exaggerates ground once and leaves local tree height and source coordinates unchanged', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 520,
      { pitch: 50, yawOffset: 0, exaggeration: 1.5 });
    const ground: Point3M = [10, 20, camera.referenceElevationM + 12];
    const display = displayTerrainPoint(ground, camera);
    expect(display[2]).toBe(camera.referenceElevationM + 18);
    const illustrativeHeightM = 11;
    const crown: Point3M = [display[0], display[1], display[2] + illustrativeHeightM];
    const three = new OrthographicCamera();
    applyTerrainCamera(three, camera, 390, 520);
    const baseScreen = new Vector3(...display).project(three), crownScreen = new Vector3(...crown).project(three);
    expect(Math.abs(crownScreen.y - baseScreen.y) * 520 / 2).toBeCloseTo(
      illustrativeHeightM * Math.cos(50 * Math.PI / 180) * camera.scale, 9);
    expect(ground).toEqual([10, 20, camera.referenceElevationM + 12]);
  });

  it('round-trips read-only terrain picks through Top and low tilt, restoring original source Z', () => {
    const width = 390, height = 640, three = new OrthographicCamera();
    const initial = fitTerrainCamera(scene, mesh, 'hole', width, height, { pitch: 90, yawOffset: 0, exaggeration: 1 });
    const [fx, fy] = initial.focusM;
    const sourcePoint = (x: number, y: number): Point3M => [x, y, mesh.referenceElevationM + (x - fx) * .025 + (y - fy) * .015];
    const points = [[fx - 300, fy - 300], [fx + 300, fy - 300], [fx + 300, fy + 300],
      [fx - 300, fy - 300], [fx + 300, fy + 300], [fx - 300, fy + 300]] as const;
    const testMesh: TerrainMesh = { ...mesh, vertices: points.flatMap(([x, y]) => [...sourcePoint(x, y)]),
      triangleFeatures: [0, 0], triangleMaterials: [0, 0], featureIds: ['terrain-context'], featureKinds: ['ground'] };
    const material = new MeshBasicMaterial();
    const geometry = new BufferGeometry(), terrain = new Mesh(geometry, material);
    try {
      for (const pitch of [20, 50, 90]) for (const yawOffset of [-45, 30]) for (const exaggeration of [1, 1.5]) {
        const camera = fitTerrainCamera(scene, mesh, 'hole', width, height, { pitch, yawOffset, exaggeration }, 1.3, [7, -12]);
        geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(([x, y]) => [...displayTerrainPoint(sourcePoint(x, y), camera)]), 3));
        geometry.computeBoundingSphere();
        applyTerrainCamera(three, camera, width, height);
        for (const [dx, dy] of [[-25, 10], [10, 30], [0, 0]]) {
          const expected = sourcePoint(fx + dx!, fy + dy!);
          const [x, y] = projectTerrainPoint(expected, camera);
          const picked = pickTerrainPoint(terrain, three, testMesh, x, y, width, height)!;
          expect(picked).not.toBeNull();
          // Render vertices use Float32 GPU precision; the canonical return
          // is resampled from Float64 source triangles, never divided blindly.
          expect(picked[0]).toBeCloseTo(expected[0], 3);
          expect(picked[1]).toBeCloseTo(expected[1], 3);
          expect(picked[2]).toBeCloseTo(expected[2], 4);
        }
      }
      expect(pickTerrainPoint(terrain, three, testMesh, -1, 20, width, height)).toBeNull();
      expect(pickTerrainPoint(terrain, three, testMesh, NaN, 20, width, height)).toBeNull();
    } finally { geometry.dispose(); material.dispose(); }
  });
});
