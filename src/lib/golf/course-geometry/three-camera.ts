import { Matrix4, OrthographicCamera, Raycaster, Vector2, Vector3, type Mesh } from 'three';
import { projectTerrainPoint, terrainHeight, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';

/** A renderer-only elevation. Never use this value for distances or statistics. */
export function displayTerrainPoint(point: Point3M, source: TerrainCamera): Point3M {
  return [point[0], point[1], source.referenceElevationM +
    (point[2] - source.referenceElevationM) * source.exaggeration];
}

/** Set Three's real orthographic camera to the existing metric projector.
 * Its explicit orthonormal basis also works at exactly Top (no lookAt pole).
 * Landscape vertices already contain displayed Z, so no extra Z scaling is
 * applied here. The off-centre frustum preserves pan and HUD-safe fitting. */
export function applyTerrainCamera(target: OrthographicCamera, source: TerrainCamera,
  width: number, height: number, distance = 10_000): void {
  if (![width, height, distance, source.scale].every(Number.isFinite) ||
    width <= 0 || height <= 0 || distance <= 1 || source.scale <= 0) throw new Error('Invalid Three camera');
  const focus = displayTerrainPoint(source.focusM, source);
  const [screenX, screenY] = projectTerrainPoint(source.focusM, source);
  const panX = screenX - width / 2, panY = screenY - height / 2;
  target.left = (-width / 2 - panX) / source.scale;
  target.right = (width / 2 - panX) / source.scale;
  target.top = (height / 2 + panY) / source.scale;
  target.bottom = (-height / 2 + panY) / source.scale;
  target.near = .1; target.far = distance * 2;
  target.zoom = 1;
  const r = source.right, u = source.up, f = source.forward;
  const rotation = new Matrix4().makeBasis(new Vector3(...r), new Vector3(...u), new Vector3(-f[0], -f[1], -f[2]));
  target.quaternion.setFromRotationMatrix(rotation);
  target.position.set(focus[0] - f[0] * distance, focus[1] - f[1] * distance, focus[2] - f[2] * distance);
  target.up.set(...u);
  target.updateProjectionMatrix();
  target.updateMatrixWorld(true);
}

/** Terrain-only picking returns canonical source elevation, never exaggerated
 * Z or a tree/crown intersection. It has no persistence or input-state effect. */
export function pickTerrainPoint(terrain: Mesh, camera: OrthographicCamera, mesh: TerrainMesh,
  x: number, y: number, width: number, height: number, raycaster = new Raycaster()): Point3M | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
    x < 0 || x > width || y < 0 || y > height) return null;
  raycaster.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
  terrain.updateWorldMatrix(true, false);
  const intersection = raycaster.intersectObject(terrain, false)[0];
  if (!intersection) return null;
  const point = intersection.point;
  const z = terrainHeight(mesh, [point.x, point.y]);
  return z == null ? null : [point.x, point.y, z];
}
