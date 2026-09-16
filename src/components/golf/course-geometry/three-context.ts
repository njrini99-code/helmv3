/** Outside-world context objects (player-view spec §13–14, §25–26): draped
 * ribbons for cart paths, service paths, roads and streams; extruded
 * footprints for buildings; light lines for fences and lifts. Everything
 * here is display-only, built from hash-locked context zones on the canonical
 * terrain height, and never participates in picking, framing or shot math. */
import * as THREE from 'three';
import type { HoleScene, PointM } from '@/lib/golf/course-geometry/types';
import type { LocalContextZone } from '@/lib/golf/course-geometry/context-layer';
import { terrainHeight, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { MERIDIAN_STYLE } from '@/lib/golf/course-geometry/visual-style';

const CONTEXT = MERIDIAN_STYLE.contextObjects;
const RIBBON_STEP_M = 3;
/** Corner fillet reach: a sharp bend in a source way is rounded within this
 * distance of the corner (deviation at most half of it), so the strip never
 * folds back on itself. Decoration only; the zone geometry is untouched. */
const RIBBON_CORNER_M = 2;
const RIBBON_LIFT_M = .06;

export interface ThreeContext {
  group: THREE.Group;
  counts: { ribbons: number; structures: number; lines: number; zones: number; triangles: number };
  setExaggeration(exaggeration: number, referenceElevationM: number): void;
  dispose(): void;
}

interface Built { mesh: THREE.Mesh | THREE.LineSegments; groundZ: Float32Array; lift: Float32Array }

/** Round every bend sharper than ~20° with a quadratic fillet that starts
 * `radius` (or 45 % of the shorter leg) before the corner and ends the same
 * distance after it. Gentle bends and the end points are kept exactly. */
export function roundCorners(points: readonly PointM[], radius: number): PointM[] {
  if (points.length < 3) return points.slice();
  const out: PointM[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]!, [cx, cy] = points[i]!, [nx, ny] = points[i + 1]!;
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
    if (!l1 || !l2) continue;
    const dot = ((cx - px) * (nx - cx) + (cy - py) * (ny - cy)) / (l1 * l2);
    if (dot > Math.cos(Math.PI / 9)) { out.push(points[i]!); continue; }
    const d = Math.min(radius, l1 * .45, l2 * .45);
    const ax = cx - (cx - px) / l1 * d, ay = cy - (cy - py) / l1 * d, bx = cx + (nx - cx) / l2 * d, by = cy + (ny - cy) / l2 * d;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, u = 1 - t;
      out.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

function resample(points: readonly PointM[], step: number): PointM[] {
  const out: PointM[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!, [bx, by] = points[i + 1]!;
    const length = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2), n = Math.max(1, Math.ceil(length / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** A triangle strip of `width` along the line, sampled on the terrain. Runs
 * outside the mesh split the strip; the shoulder darkens the outer 30 %. */
function ribbon(mesh: TerrainMesh, line: readonly PointM[], width: number, tone: THREE.Color, shoulder: THREE.Color,
  positions: number[], colors: number[], groundZ: number[], indices: number[]) {
  const samples = resample(roundCorners(line, RIBBON_CORNER_M), RIBBON_STEP_M);
  let previous: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    const [x, y] = samples[i]!;
    const z = terrainHeight(mesh, [x, y]);
    if (z == null) { previous = null; continue; }
    const [px, py] = samples[Math.max(0, i - 1)]!, [nx, ny] = samples[Math.min(samples.length - 1, i + 1)]!;
    let tx = nx - px, ty = ny - py;
    const length = Math.sqrt(tx * tx + ty * ty) || 1; tx /= length; ty /= length;
    const ox = -ty * width / 2, oy = tx * width / 2;
    const base = positions.length / 3;
    // Four vertices across: shoulder, core, core, shoulder.
    for (const [f, color] of [[-1, shoulder], [-.4, tone], [.4, tone], [1, shoulder]] as const) {
      positions.push(x + ox * f, y + oy * f, z); groundZ.push(z); colors.push(color.r, color.g, color.b);
    }
    if (previous != null) for (let k = 0; k < 3; k++) {
      indices.push(previous + k, base + k, base + k + 1, previous + k, base + k + 1, previous + k + 1);
    }
    previous = base;
  }
}

/** A flat-roofed extrusion of a footprint ring sitting on the lowest terrain
 * height under it (so no corner floats); height from the zone. */
function extrusion(mesh: TerrainMesh, ring: readonly PointM[], height: number, wall: THREE.Color, roof: THREE.Color,
  positions: number[], colors: number[], groundZ: number[], lift: number[], indices: number[]): boolean {
  const points = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring.slice();
  if (points.length < 3) return false;
  const heights = points.map(p => terrainHeight(mesh, p)).filter((z): z is number => z != null);
  if (heights.length < points.length) return false;
  const base = Math.min(...heights) - .3;
  // Counter-clockwise for outward-facing walls.
  let area = 0;
  for (let i = 0; i < points.length; i++) { const [ax, ay] = points[i]!, [bx, by] = points[(i + 1) % points.length]!; area += ax * by - bx * ay; }
  if (area < 0) points.reverse();
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!, [bx, by] = points[(i + 1) % points.length]!;
    const start = positions.length / 3;
    positions.push(ax, ay, base, bx, by, base, bx, by, base, ax, ay, base);
    groundZ.push(base, base, base, base); lift.push(0, 0, height + .3, height + .3);
    for (let k = 0; k < 4; k++) colors.push(wall.r, wall.g, wall.b);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const roofStart = positions.length / 3;
  const shape = THREE.ShapeUtils.triangulateShape(points.map(([x, y]) => new THREE.Vector2(x, y)), []);
  for (const [x, y] of points) { positions.push(x, y, base); groundZ.push(base); lift.push(height + .3); colors.push(roof.r, roof.g, roof.b); }
  for (const [a = 0, b = 0, c = 0] of shape) indices.push(roofStart + a, roofStart + b, roofStart + c);
  return true;
}

export function buildThreeContext(scene: HoleScene, mesh: TerrainMesh): ThreeContext {
  const group = new THREE.Group();
  group.name = 'golf-course-context';
  group.userData = { basis: 'context_layer', layerHash: scene.contextLayerHash ?? null, display: 'orientation_only' };
  const built: Built[] = [];
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const zones = scene.contextZones ?? [];
  const counts: ThreeContext['counts'] = { ribbons: 0, structures: 0, lines: 0, zones: zones.length, triangles: 0 };
  const byClass = new Map<string, LocalContextZone[]>();
  for (const zone of zones) { const list = byClass.get(zone.class) ?? []; list.push(zone); byClass.set(zone.class, list); }
  const addMesh = (name: string, positions: number[], colors: number[], groundZ: number[], lift: number[], indices: number[], material: THREE.Material, shadows: boolean) => {
    if (!indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const object = new THREE.Mesh(geometry, material);
    object.name = name; object.castShadow = shadows; object.receiveShadow = true;
    object.userData = { basis: 'context_layer', display: 'orientation_only' };
    group.add(object); disposables.push(geometry, material);
    built.push({ mesh: object, groundZ: new Float32Array(groundZ), lift: new Float32Array(lift) });
    counts.triangles += indices.length / 3;
  };
  // Ribbons: one draw call per class.
  for (const [cls, tones] of Object.entries(CONTEXT.ribbons)) {
    const positions: number[] = [], colors: number[] = [], groundZ: number[] = [], indices: number[] = [];
    const tone = new THREE.Color(tones.color), shoulder = new THREE.Color(tones.shoulder);
    for (const zone of byClass.get(cls) ?? []) {
      if (zone.type !== 'LineString') continue;
      const width = zone.attributes.widthM ?? tones.widthM;
      for (const part of zone.parts) for (const line of part) { ribbon(mesh, line, width, tone, shoulder, positions, colors, groundZ, indices); counts.ribbons++; }
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: tones.roughness, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    material.name = `context-ribbon-${cls}`;
    addMesh(`context-ribbons-${cls}`, positions, colors, groundZ, new Array(groundZ.length).fill(RIBBON_LIFT_M) as number[], indices, material, false);
    if (!indices.length) material.dispose();
  }
  // Structures: one draw call per class.
  for (const [cls, tones] of Object.entries(CONTEXT.structures)) {
    const positions: number[] = [], colors: number[] = [], groundZ: number[] = [], lift: number[] = [], indices: number[] = [];
    const wall = new THREE.Color(tones.wall), roof = new THREE.Color(tones.roof);
    for (const zone of byClass.get(cls) ?? []) {
      if (zone.type === 'LineString') continue;
      const height = Math.min(60, zone.attributes.heightM ?? tones.heightM);
      for (const rings of zone.parts) { const outer = rings[0]; if (outer && extrusion(mesh, outer, height, wall, roof, positions, colors, groundZ, lift, indices)) counts.structures++; }
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
    material.name = `context-structure-${cls}`;
    addMesh(`context-structures-${cls}`, positions, colors, groundZ, lift, indices, material, true);
    if (!indices.length) material.dispose();
  }
  // Lines: fences and lifts as thin segments lifted to their height.
  {
    const positions: number[] = [], groundZ: number[] = [], lift: number[] = [];
    for (const [cls, height] of Object.entries(CONTEXT.lines)) for (const zone of byClass.get(cls) ?? []) {
      if (zone.type !== 'LineString') continue;
      for (const part of zone.parts) for (const line of part) {
        const samples = resample(line, RIBBON_STEP_M * 2);
        let previous: [number, number, number] | null = null;
        for (const [x, y] of samples) {
          const z = terrainHeight(mesh, [x, y]);
          if (z == null) { previous = null; continue; }
          if (previous) { positions.push(...previous, x, y, z); groundZ.push(previous[2], z); lift.push(height, height); }
          previous = [x, y, z];
        }
        counts.lines++;
      }
    }
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3).setUsage(THREE.DynamicDrawUsage));
      const material = new THREE.LineBasicMaterial({ color: CONTEXT.lineColor, transparent: true, opacity: .55 });
      material.name = 'context-lines';
      const object = new THREE.LineSegments(geometry, material);
      object.name = 'context-lines'; object.userData = { basis: 'context_layer', display: 'orientation_only' };
      group.add(object); disposables.push(geometry, material);
      built.push({ mesh: object, groundZ: new Float32Array(groundZ), lift: new Float32Array(lift) });
    }
  }
  let disposed = false;
  return {
    group, counts,
    setExaggeration(exaggeration, referenceElevationM) {
      if (disposed) return;
      for (const { mesh: object, groundZ, lift } of built) {
        const positions = object.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) positions.setZ(i, referenceElevationM + (groundZ[i]! - referenceElevationM) * exaggeration + lift[i]!);
        positions.needsUpdate = true;
        if (object instanceof THREE.Mesh) object.geometry.computeVertexNormals();
        object.geometry.computeBoundingSphere();
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const item of disposables) item.dispose();
      group.removeFromParent();
    },
  };
}
