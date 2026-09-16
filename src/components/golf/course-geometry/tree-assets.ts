import * as THREE from 'three';

export interface TreeCrownAsset {
  /** Describes an authored shape, never an observed tree or a measured species. */
  readonly id: string;
  readonly basis: 'authored_canopy_art';
  /** All LODs share one origin, XY radius <= 1, and Z bounds within [-.5, .5]. */
  readonly near: THREE.BufferGeometry;
  readonly distant: THREE.BufferGeometry;
  /** Every lobe at the coarsest icosahedron: the silhouette for tiles beyond
   * twice the trunk band, where a crown covers a few pixels on a phone. */
  readonly far: THREE.BufferGeometry;
  readonly lobeCount: { readonly near: number; readonly distant: number; readonly far: number };
  readonly triangleCounts: { readonly near: number; readonly distant: number; readonly far: number };
}

export interface TreeAssetAtlas {
  /** Share these geometries across instances; do not resize an asset in place. */
  readonly variants: readonly TreeCrownAsset[];
  /** The atlas owns its geometry. Instance disposal must not dispose it again. */
  dispose(): void;
}

/** Position, ellipsoid radii, and yaw in the artwork's local Z-up frame. */
type Lobe = readonly [x: number, y: number, z: number, rx: number, ry: number, rz: number, yaw?: number];
interface CrownDesign { id: string; dominant: readonly number[]; lobes: readonly Lobe[] }

// Silhouette and overlap are authored deliberately. Every small lobe intersects
// a dominant crown volume; none is a floating leaf, alpha card, or random sphere.
// Distant LOD retains every lobe, with cheaper geometry on minor shoulders.
const DESIGNS: readonly CrownDesign[] = [
  { id: 'staggered-shoulders', dominant: [0, 1, 2, 3, 4], lobes: [
    [0, 0, -.14, .61, .59, .59],
    [-.51, -.1, .18, .51, .41, .48, -.3],
    [.41, .21, .1, .51, .56, .48, .24],
    [-.17, .25, .63, .45, .41, .39, -.18],
    [.12, -.49, -.01, .43, .45, .4, .3],
    [-.49, .38, .29, .34, .34, .36],
    [.42, -.32, .42, .36, .36, .35, -.4],
    [-.23, -.34, .59, .33, .32, .32],
  ] },
  { id: 'uneven-fork', dominant: [0, 1, 2, 3, 4], lobes: [
    [0, 0, -.3, .56, .54, .49],
    [-.42, -.11, .33, .49, .47, .58, -.26],
    [.43, .15, .56, .44, .46, .52, .24],
    [.39, -.4, -.01, .42, .38, .43, .44],
    [-.21, .46, .02, .46, .39, .41, -.35],
    [-.66, -.06, .18, .3, .32, .34],
    [.64, .03, .45, .3, .34, .34],
    [-.1, -.41, .48, .35, .31, .38],
  ] },
  { id: 'offset-crest', dominant: [0, 1, 2, 3, 4, 5], lobes: [
    [-.16, -.06, -.25, .59, .56, .46],
    [-.53, .14, -.04, .46, .44, .43, -.3],
    [.34, .02, .1, .56, .5, .48, .2],
    [.37, .27, .69, .43, .4, .4, -.34],
    [-.11, -.4, .31, .45, .39, .43, .26],
    [-.16, .47, .34, .42, .4, .38, -.2],
    [.66, -.17, .38, .31, .32, .35],
    [.07, .02, .71, .31, .35, .34],
  ] },
  { id: 'broad-low-cluster', dominant: [0, 1, 2, 3, 4], lobes: [
    [0, 0, -.25, .65, .59, .37],
    [-.58, -.04, .07, .53, .47, .4, -.22],
    [.56, .07, .11, .54, .46, .4, .22],
    [-.1, .5, .17, .49, .44, .42, -.4],
    [.11, -.47, .24, .49, .42, .37, .27],
    [-.37, -.41, .18, .38, .35, .31],
    [.37, .38, .3, .37, .37, .32],
    [-.09, .04, .53, .41, .39, .32],
  ] },
  { id: 'stepped-spire', dominant: [0, 1, 2, 3, 4], lobes: [
    [-.01, -.02, -.31, .52, .47, .45],
    [-.34, .03, .09, .44, .41, .5, -.3],
    [.35, -.17, .22, .4, .42, .5, .26],
    [.13, .25, .59, .43, .4, .47, -.14],
    [-.08, -.02, 1.02, .34, .32, .43, .2],
    [-.35, -.31, .08, .29, .29, .35],
    [.46, .17, .42, .3, .3, .33],
    [-.2, .33, .72, .3, .28, .35],
  ] },
  { id: 'swept-shoulder', dominant: [0, 1, 2, 3, 4], lobes: [
    [-.12, -.08, -.24, .58, .55, .47],
    [-.57, .07, .16, .45, .48, .48, -.3],
    [.39, -.14, .1, .53, .45, .45, .3],
    [.33, .34, .52, .48, .48, .45, -.28],
    [-.13, -.44, .47, .4, .42, .42, .32],
    [-.38, .45, .26, .36, .34, .35],
    [.64, .05, .43, .34, .33, .36],
    [.01, .23, .82, .35, .32, .31],
  ] },
  { id: 'scalloped-dome', dominant: [0, 1, 2, 3, 4, 5], lobes: [
    [0, 0, -.19, .61, .61, .47],
    [-.58, -.21, .12, .44, .41, .46, -.35],
    [-.25, .55, .18, .46, .4, .43, .32],
    [.51, .37, .16, .45, .44, .47, -.25],
    [.49, -.38, .13, .41, .44, .43, .36],
    [-.04, -.13, .61, .49, .45, .44, .1],
    [-.24, -.57, .23, .34, .32, .33],
    [.15, .29, .69, .34, .36, .33],
  ] },
  { id: 'asymmetric-tier', dominant: [0, 1, 2, 3, 4], lobes: [
    [-.12, -.06, -.32, .59, .56, .42],
    [-.53, -.12, .16, .43, .45, .51, -.24],
    [.38, -.39, .09, .45, .42, .44, .32],
    [.37, .37, .26, .5, .43, .47, -.27],
    [-.08, .17, .75, .43, .46, .48, .12],
    [-.49, .37, .37, .33, .35, .35],
    [.59, -.04, .54, .32, .32, .36],
    [-.11, -.32, .56, .33, .35, .36],
  ] },
];

/** One draw-ready opaque mesh per variation and LOD. Overlapping closed lobes
 * create a continuous-looking crown while retaining distinct light-catching
 * shoulders. Internal faces are harmless under ordinary opaque depth testing. */
function buildCluster(lobes: readonly Lobe[], templates: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const vertexCount = templates.reduce((total, template) => total + template.getAttribute('position').count, 0);
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(positions.length);
  const transform = new THREE.Matrix4(), normalTransform = new THREE.Matrix3();
  const translation = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1), position = new THREE.Vector3(), normal = new THREE.Vector3();
  let firstVertex = 0;
  for (const [lobeIndex, lobe] of lobes.entries()) {
    const template = templates[lobeIndex]!;
    const templatePositions = template.getAttribute('position'), templateNormals = template.getAttribute('normal');
    translation.set(lobe[0], lobe[1], lobe[2]); scale.set(lobe[3], lobe[4], lobe[5]);
    rotation.setFromAxisAngle(zAxis, lobe[6] ?? 0);
    transform.compose(translation, rotation, scale); normalTransform.getNormalMatrix(transform);
    for (let vertex = 0; vertex < templatePositions.count; vertex++) {
      const offset = (firstVertex + vertex) * 3;
      position.fromBufferAttribute(templatePositions, vertex).applyMatrix4(transform).toArray(positions, offset);
      normal.fromBufferAttribute(templateNormals, vertex).applyNormalMatrix(normalTransform).toArray(normals, offset);
    }
    firstVertex += templatePositions.count;
  }
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(positions, 3))
    .setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

function normalizeSet(geometries: readonly THREE.BufferGeometry[]): void {
  let radius = 0, minZ = Infinity, maxZ = -Infinity;
  for (const geometry of geometries) {
    const positions = geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex++) {
      radius = Math.max(radius, Math.hypot(positions.getX(vertex), positions.getY(vertex)));
      minZ = Math.min(minZ, positions.getZ(vertex)); maxZ = Math.max(maxZ, positions.getZ(vertex));
    }
  }
  // Shared normalization means a LOD switch cannot reposition or inflate a
  // crown. The tiny radial margin also contains Float32 rounding at radius 1.
  const matrix = new THREE.Matrix4().makeScale(1 / (radius * 1.000001), 1 / (radius * 1.000001), 1 / (maxZ - minZ));
  matrix.setPosition(0, 0, -(maxZ + minZ) / 2 / (maxZ - minZ));
  for (const geometry of geometries) {
    geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  }
}

/** Create one atlas per landscape owner, then instance its geometries. No
 * source geometry, placement, species, or height is inferred by this library. */
export function createTreeAssetAtlas(): TreeAssetAtlas {
  const nearTemplate = new THREE.IcosahedronGeometry(1, 2);
  const distantTemplate = new THREE.IcosahedronGeometry(1, 1);
  const minorTemplate = new THREE.IcosahedronGeometry(1, 0);
  const owned: THREE.BufferGeometry[] = [];
  const variants: TreeCrownAsset[] = [];
  try {
    // Renderer redesign §20.1: every authored design also ships mirrored
    // across its local X axis (positions and lobe yaws negated), doubling the
    // silhouettes without a second set of artwork. A mirrored ellipsoid keeps
    // its outward normals because only the lobe placement is mirrored.
    const mirrored = DESIGNS.map(design => ({ id: `${design.id}-mirror`, dominant: design.dominant,
      lobes: design.lobes.map(lobe => [-lobe[0], lobe[1], lobe[2], lobe[3], lobe[4], lobe[5], -(lobe[6] ?? 0)] as const) }));
    for (const design of DESIGNS.flatMap((base, index) => [base, mirrored[index]!])) {
      const near = buildCluster(design.lobes, design.lobes.map(() => nearTemplate)); owned.push(near);
      // Five major volumes at 80 triangles plus three at 20 retain the complete
      // authored silhouette in 460 triangles, instead of dropping whole lobes.
      const dominant = new Set(design.dominant.slice(0, 5));
      const distant = buildCluster(design.lobes, design.lobes.map((_, index) => dominant.has(index) ? distantTemplate : minorTemplate)); owned.push(distant);
      // Far keeps every lobe at 20 triangles: the same outline in ~160 triangles.
      const far = buildCluster(design.lobes, design.lobes.map(() => minorTemplate)); owned.push(far);
      normalizeSet([near, distant, far]);
      near.name = `${design.id}-near`; distant.name = `${design.id}-distant`; far.name = `${design.id}-far`;
      near.userData = { basis: 'authored_canopy_art', variant: design.id, lod: 'near', lobeCount: design.lobes.length };
      distant.userData = { basis: 'authored_canopy_art', variant: design.id, lod: 'distant', lobeCount: design.lobes.length };
      far.userData = { basis: 'authored_canopy_art', variant: design.id, lod: 'far', lobeCount: design.lobes.length };
      const triangles = (geometry: THREE.BufferGeometry) => geometry.getAttribute('position').count / 3;
      variants.push(Object.freeze({ id: design.id, basis: 'authored_canopy_art' as const, near, distant, far,
        lobeCount: Object.freeze({ near: design.lobes.length, distant: design.lobes.length, far: design.lobes.length }),
        triangleCounts: Object.freeze({ near: triangles(near), distant: triangles(distant), far: triangles(far) }) }));
    }
  } catch (error) {
    for (const geometry of owned) geometry.dispose();
    throw error;
  } finally {
    nearTemplate.dispose(); distantTemplate.dispose(); minorTemplate.dispose();
  }
  let disposed = false;
  return {
    variants: Object.freeze(variants),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of owned) geometry.dispose();
    },
  };
}
