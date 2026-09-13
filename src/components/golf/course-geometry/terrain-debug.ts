import * as THREE from 'three';
import type { ThreeLandscape } from './three-landscape';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';

export const TERRAIN_DEBUG_VIEWS = ['final', 'unlit', 'wireframe-elevation', 'normals', 'lit-no-shadows', 'feature-ids', 'shadows', 'crop'] as const;
export type TerrainDebugView = typeof TERRAIN_DEBUG_VIEWS[number];
/** Diagnostic-only material substitution. Source positions are never modified.
 * AO/skirt passes do not exist in this renderer; the crop view exposes context. */
export function installTerrainDebugView(world: THREE.Scene, landscape: ThreeLandscape, mesh: TerrainMesh,
  mode: TerrainDebugView, renderer: THREE.WebGLRenderer): () => void {
  if (mode === 'final') return () => {};
  const owned: THREE.Material[] = [];
  const override = (material: THREE.Material) => { owned.push(material); world.overrideMaterial = material; };
  if (mode !== 'shadows') for (const child of landscape.group.children) if (child !== landscape.terrain) child.visible = false;
  renderer.shadowMap.enabled = mode === 'shadows';
  const colors = new Float32Array(mesh.vertices.length);
  // Landscape construction rewinds clockwise triangles. Match diagnostic
  // colors to its vertex order, before display exaggeration is applied.
  const positions = landscape.terrain.geometry.getAttribute('position');
  const zs = mesh.vertices.filter((_, i) => i % 3 === 2), low = Math.min(...zs), high = Math.max(...zs);
  if (mode === 'unlit') override(new THREE.MeshBasicMaterial({ color: '#9BBB61' }));
  if (mode === 'normals') override(new THREE.MeshNormalMaterial());
  if (mode === 'lit-no-shadows') override(new THREE.MeshStandardMaterial({ color: '#9BBB61', roughness: 1 }));
  if (mode === 'feature-ids' || mode === 'wireframe-elevation' || mode === 'crop') {
    for (let i = 0; i < mesh.triangleFeatures.length; i++) for (let c = 0; c < 3; c++) {
      const index = i * 9 + c * 3;
      const color = new THREE.Color();
      if (mode === 'wireframe-elevation') color.setHSL(.68 - .6 * (positions.getZ(index / 3) - low) / Math.max(.001, high - low), .7, .5);
      else if (mode === 'crop') color.set(mesh.featureKinds[mesh.triangleFeatures[i]!] === 'ground' ? '#DF2CAB' : '#DBE2DA');
      else color.setHSL((mesh.triangleFeatures[i]! * .173 + mesh.triangleMaterials[i]! * .07) % 1, .75, .55);
      colors.set([color.r, color.g, color.b], index);
    }
    landscape.terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    override(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (mode === 'wireframe-elevation') {
      world.overrideMaterial = null;
      const colorMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
      const wireMaterial = new THREE.MeshBasicMaterial({ color: '#243A27', wireframe: true });
      owned.push(colorMaterial, wireMaterial);
      // One extra diagnostic-only wire draw using the same geometry.
      const surface = new THREE.Mesh(landscape.terrain.geometry, colorMaterial);
      const wire = new THREE.Mesh(landscape.terrain.geometry, wireMaterial);
      landscape.terrain.visible = false; landscape.group.add(surface, wire);
    }
  }
  if (mode === 'shadows') override(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }));
  return () => { world.overrideMaterial = null; for (const material of owned) material.dispose(); };
}
