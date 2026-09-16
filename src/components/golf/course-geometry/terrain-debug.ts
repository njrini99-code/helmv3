import * as THREE from 'three';
import { attachTurfStyle, type ThreeLandscape } from './three-landscape';
import { metricTerrainNormal } from '@/lib/golf/course-geometry/terrain-source';
import { sourceVertexNormals, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';

/** Faceting debug kit (Meridian §14). Every view is a diagnostic material or
 * vertex-colour substitution on the same display geometry: source positions
 * are never modified, and none of these views ship to a player route. */
export const TERRAIN_DEBUG_VIEWS = [
  'final',
  'unlit', 'unlit-white', 'albedo', 'vertex-color',
  'wireframe-elevation',
  'normals', 'source-normals', 'display-normals', 'flat-normals', 'slope', 'curvature',
  'lit-no-shadows', 'no-shadow', 'shadows', 'shadow-only',
  'feature-ids', 'triangle-ids', 'material-ids', 'crop', 'context-mask', 'bunker-depth',
] as const;
export type TerrainDebugView = typeof TERRAIN_DEBUG_VIEWS[number];
export const TERRAIN_DEBUG_LABELS: Record<TerrainDebugView, string> = {
  final: 'Final', unlit: 'Unlit green', 'unlit-white': 'Unlit white', albedo: 'Albedo only (turf style, no light)',
  'vertex-color': 'Vertex colour only', 'wireframe-elevation': 'Wireframe + elevation', normals: 'Display normals',
  'source-normals': 'Source normals', 'display-normals': 'Display normals', 'flat-normals': 'Flat (face) normals',
  slope: 'Slope', curvature: 'Curvature', 'lit-no-shadows': 'Lit, no shadow', 'no-shadow': 'Lit, no shadow',
  shadows: 'Shadow only', 'shadow-only': 'Shadow only', 'feature-ids': 'Feature IDs', 'triangle-ids': 'Triangle IDs',
  'material-ids': 'Material IDs', crop: 'Context mask', 'context-mask': 'Context mask', 'bunker-depth': 'Bunker bowl depth (render-only)',
};

function hashColor(index: number, color: THREE.Color): THREE.Color {
  let n = Math.imul(index ^ (index >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return color.setHSL(((n >>> 0) % 360) / 360, .7, .55);
}

const MATERIAL_COLORS = ['#3F7A3A', '#D8B45B', '#E6E9F0', '#8E5BB7', '#3A9AD0'];

/** Diagnostic-only material substitution. Source positions are never modified.
 * AO/skirt passes do not exist in this renderer; the crop view exposes context. */
export function installTerrainDebugView(world: THREE.Scene, landscape: ThreeLandscape, mesh: TerrainMesh,
  mode: TerrainDebugView, renderer: THREE.WebGLRenderer): () => void {
  if (mode === 'final') return () => {};
  const owned: THREE.Material[] = [];
  const override = (material: THREE.Material) => { owned.push(material); world.overrideMaterial = material; };
  const shadowMode = mode === 'shadows' || mode === 'shadow-only';
  if (!shadowMode) for (const child of landscape.group.children) if (child !== landscape.terrain) child.visible = false;
  renderer.shadowMap.enabled = shadowMode;
  const geometry = landscape.terrain.geometry;
  const positions = geometry.getAttribute('position');
  const originalColor = geometry.getAttribute('color');
  const colors = new Float32Array(mesh.vertices.length);
  const zs = mesh.vertices.filter((_, i) => i % 3 === 2), low = Math.min(...zs), high = Math.max(...zs);
  const paintTriangles = (paint: (triangle: number, color: THREE.Color) => void) => {
    const color = new THREE.Color();
    for (let i = 0; i < mesh.triangleFeatures.length; i++) {
      paint(i, color);
      for (let c = 0; c < 3; c++) colors.set([color.r, color.g, color.b], i * 9 + c * 3);
    }
  };
  const paintVertices = (paint: (vertex: number, color: THREE.Color) => void) => {
    const color = new THREE.Color();
    for (let v = 0; v < positions.count; v++) { paint(v, color); colors.set([color.r, color.g, color.b], v * 3); }
  };
  const applyVertexColors = () => {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    override(new THREE.MeshBasicMaterial({ vertexColors: true }));
  };
  switch (mode) {
    case 'unlit': override(new THREE.MeshBasicMaterial({ color: '#9BBB61' })); break;
    case 'unlit-white': override(new THREE.MeshBasicMaterial({ color: '#FFFFFF' })); break;
    case 'vertex-color': override(new THREE.MeshBasicMaterial({ vertexColors: true })); break;
    case 'albedo': {
      // The production colour pipeline without lighting: vertex albedo plus
      // the mowing/turf style, exactly as the lit material composes it.
      const material = new THREE.MeshBasicMaterial({ vertexColors: true });
      attachTurfStyle(material, landscape.artifact.seed);
      override(material);
      break;
    }
    case 'normals': case 'display-normals': override(new THREE.MeshNormalMaterial()); break;
    case 'flat-normals': override(new THREE.MeshNormalMaterial({ flatShading: true })); break;
    case 'source-normals': {
      // Landscape construction rewinds clockwise triangles; match that order.
      const source = sourceVertexNormals(mesh);
      paintTriangles((_, color) => color.set('#FF00AA'));
      if (source) for (let t = 0; t < mesh.triangleFeatures.length; t++) {
        const offset = t * 9, v = mesh.vertices;
        const winding = (v[offset + 3]! - v[offset]!) * (v[offset + 7]! - v[offset + 1]!) - (v[offset + 6]! - v[offset]!) * (v[offset + 4]! - v[offset + 1]!);
        const order = winding < 0 ? [0, 2, 1] : [0, 1, 2];
        for (let corner = 0; corner < 3; corner++) {
          const from = offset + order[corner]! * 3, to = offset + corner * 3;
          colors.set([source[from]! * .5 + .5, source[from + 1]! * .5 + .5, source[from + 2]! * .5 + .5], to);
        }
      }
      landscape.terrain.userData.debugSourceNormals = mesh.sourceNormals ? 'source' : source ? 'metric_grid' : 'missing';
      applyVertexColors();
      break;
    }
    case 'slope': {
      // Slope angle of the display normal: green (flat) → yellow (10°) → red (25°+).
      const normals = geometry.getAttribute('normal');
      paintVertices((vertex, color) => {
        const degrees = Math.acos(Math.max(-1, Math.min(1, normals.getZ(vertex)))) * 180 / Math.PI;
        color.setHSL(Math.max(0, .33 - .33 * Math.min(1, degrees / 25)), .85, .5);
      });
      applyVertexColors();
      break;
    }
    case 'curvature': {
      // Signed Laplacian of the source grid at each vertex (concave blue,
      // convex red); without a grid, the angle between the vertex's display
      // normal and its face normal (magnitude only, grey → orange).
      const grid = mesh.metricGrid;
      if (grid) paintVertices((vertex, color) => {
        const x = positions.getX(vertex), y = positions.getY(vertex), s = grid.spacingM;
        const n = metricTerrainNormal(grid, [x, y]);
        const left = metricTerrainNormal(grid, [x - s, y]), right = metricTerrainNormal(grid, [x + s, y]);
        const down = metricTerrainNormal(grid, [x, y - s]), up = metricTerrainNormal(grid, [x, y + s]);
        if (!n || !left || !right || !down || !up) { color.set('#444444'); return; }
        const divergence = (right[0] - left[0]) / (2 * s) + (up[1] - down[1]) / (2 * s);
        const t = Math.max(-1, Math.min(1, divergence * 40));
        color.setRGB(.5 + .5 * Math.max(0, t), .5 - .5 * Math.abs(t) * .6, .5 + .5 * Math.max(0, -t));
      });
      else {
        const normals = geometry.getAttribute('normal');
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), n = new THREE.Vector3();
        paintVertices((vertex, color) => {
          const first = vertex - vertex % 3;
          a.fromBufferAttribute(positions, first); b.fromBufferAttribute(positions, first + 1); c.fromBufferAttribute(positions, first + 2);
          face.copy(b).sub(a).cross(c.sub(a)).normalize();
          n.fromBufferAttribute(normals, vertex);
          const degrees = Math.acos(Math.max(-1, Math.min(1, Math.abs(face.dot(n))))) * 180 / Math.PI;
          color.setHSL(.08, Math.min(1, degrees / 8), .35 + .3 * Math.min(1, degrees / 8));
        });
      }
      applyVertexColors();
      break;
    }
    case 'lit-no-shadows': case 'no-shadow': override(new THREE.MeshStandardMaterial({ color: '#9BBB61', roughness: 1 })); break;
    case 'shadows': case 'shadow-only': override(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })); break;
    case 'feature-ids':
      paintTriangles((t, color) => color.setHSL((mesh.triangleFeatures[t]! * .173 + mesh.triangleMaterials[t]! * .07) % 1, .75, .55));
      applyVertexColors();
      break;
    case 'triangle-ids': paintTriangles((t, color) => hashColor(t + 1, color)); applyVertexColors(); break;
    case 'material-ids': paintTriangles((t, color) => color.set(MATERIAL_COLORS[mesh.triangleMaterials[t]!] ?? '#000000')); applyVertexColors(); break;
    case 'crop': case 'context-mask':
      paintTriangles((t, color) => color.set(mesh.featureKinds[mesh.triangleFeatures[t]!] === 'ground' ? '#DF2CAB' : '#DBE2DA'));
      applyVertexColors();
      break;
    case 'bunker-depth': {
      // Render-only bowl depth: sand (0) → deep umber (1 m); turf grey.
      const depth = geometry.getAttribute('golfBunkerDepth');
      paintVertices((vertex, color) => {
        const d = depth ? depth.getX(vertex) : 0;
        if (d <= 0) color.set('#6E7A66'); else color.setHSL(.09, .6, .78 - .55 * Math.min(1, d));
      });
      applyVertexColors();
      break;
    }
    case 'wireframe-elevation': {
      paintVertices((vertex, color) => color.setHSL(.68 - .6 * (positions.getZ(vertex) - low) / Math.max(.001, high - low), .7, .5));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const colorMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
      const wireMaterial = new THREE.MeshBasicMaterial({ color: '#243A27', wireframe: true });
      owned.push(colorMaterial, wireMaterial);
      // One extra diagnostic-only wire draw using the same geometry.
      const surface = new THREE.Mesh(geometry, colorMaterial);
      const wire = new THREE.Mesh(geometry, wireMaterial);
      landscape.terrain.visible = false; landscape.group.add(surface, wire);
      break;
    }
  }
  return () => {
    world.overrideMaterial = null;
    if (originalColor) geometry.setAttribute('color', originalColor);
    for (const material of owned) material.dispose();
  };
}
