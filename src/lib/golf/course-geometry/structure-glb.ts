/** Structure GLB pipeline (V2 plan §56-58 structures, §100-103 Blender/GLB/
 * KTX2/meshoptimizer; Ruling R8; Task 17).
 *
 * Three responsibilities, all three-free (R12) and fs-free — a script or a
 * future compiler reads bytes off disk and hands them to this module:
 *
 *   read       `readStructureGlbGeometry` is a minimal glTF reader (it
 *              imports `parseGlb` from glb-writer.ts rather than re-parsing
 *              the GLB container itself). It reads only JSON-declared
 *              metadata — accessor `count` and POSITION `min`/`max`, both
 *              spec-required — and never decodes the BIN chunk, so a
 *              Draco/meshoptimizer-compressed file (§101's optional
 *              pipeline) is inspected exactly as accurately as an
 *              uncompressed one. It walks the *default scene's* node graph
 *              (not the flat `nodes` array, which can hold unreachable
 *              nodes), composing each node's own `matrix` or TRS with its
 *              parent's through 4×4 matrices, so non-uniform scale and an
 *              explicit `matrix` node are both handled exactly rather than
 *              silently defaulting to identity — see `mat4FromTRS`.
 *
 *   validate   `validateStructureGlbGeometry` checks the convention doc's
 *              mechanically-checkable rules: origin at ground contact,
 *              plausible scale, §57's triangle range, §58/§100's material
 *              and texture-per-material ceilings, KTX2 use, and (when a
 *              caller supplies the zone's own footprint area) whether the
 *              authored model actually matches the footprint it is keyed
 *              to. `docs/golf/course-geometry/structure-glb-convention.md`
 *              is the source of truth this operationalizes.
 *
 *   place      `buildStructurePlacements` turns validated, catalog-matched
 *              structure zones (context-layer.ts, classes from
 *              context-taxonomy.ts's `built` group that render as
 *              `extrude` — clubhouse/building/maintenance, exactly what
 *              three-context.ts's `CONTEXT.structures` extrudes today) into
 *              world-scale placements: position and ground-contact height
 *              from the footprint's own terrain samples (`terrainHeight`,
 *              which prefers the metric grid's `sampleMetricTerrain` —
 *              terrain-source.ts — mirroring three-context.ts `extrusion()`,
 *              which also samples every corner and takes the min so no
 *              corner floats), and a yaw derived from the footprint's own
 *              longest edge. A MultiPolygon zone places the same authored
 *              model once per polygon part (three-context.ts extrudes every
 *              part too), each part its own id `${zone.id}#<partIndex>`.
 *
 * Ruling R8 / constraint 14: a structure zone with no authored GLB, or one
 * that fails validation, produces no placement — `buildStructurePlacements`
 * records why in `skipped` — so production keeps its existing footprint
 * extrusion (three-context.ts) rather than inventing geometry. The
 * top-level `compileStaticObjectSet` always uses `STATIC_OBJECT_SET_BASIS`,
 * distinct from `emptyPackedSet('unfilled_task17')` (visual-artifact-v2.ts),
 * so `basis` alone tells "this compiler ran and found N authored models"
 * (N can be 0, today's honest answer) apart from "this compiler never ran".
 *
 * Axis convention: source geometry is this project's native frame — x, y
 * planar, z height (glb-writer.ts calls this "Z-up"). glTF files are always
 * Y-up on disk. glb-writer.ts's `writeGlb` gets there with a fixed node
 * rotation, `Z_UP_TO_Y_UP_ROTATION`; this module inverts exactly that
 * mapping — a glTF point (X, Y, Z) becomes this project's (X, −Z, Y) — so a
 * file this project wrote and a Blender "+Y Up" export (which bakes the
 * same axis conversion into the vertex data instead of a node rotation) are
 * both read back correctly (`gltfToProjectFrame`). */
import type { LocalContextZone } from './context-layer';
import { CONTEXT_CLASS_GROUPS, CONTEXT_RENDER, type ContextClass } from './context-taxonomy';
import { parseGlb } from './glb-writer';
import { ringArea } from './spatial';
import { terrainHeight, type TerrainMesh } from './terrain';
import type { HoleScene, PointM } from './types';
import { fnvBytes } from './visual-artifact';
import type { PackedObjectSet } from './visual-artifact-v2';

/** Context zone classes a structure GLB can stand in for: the `built` group
 * classes the renderer already extrudes (`extrude`, context-taxonomy.ts) —
 * bridge/wall/stairs/fence/parking/lift_line render differently and are out
 * of scope here. Derived, not hand-listed, so a taxonomy change cannot
 * silently drift out of sync with this module. */
export const STRUCTURE_CONTEXT_CLASSES: readonly ContextClass[] =
  CONTEXT_CLASS_GROUPS.built.filter(cls => CONTEXT_RENDER[cls] === 'extrude');

/** §57 LOD triangle ranges (by prominence) and §58/§100 material/texture
 * ceilings, plus two tolerances this convention doc defines (not plan
 * text): how far the model's own origin may sit from its lowest point
 * ("origin at ground contact") and how far its footprint area may differ
 * from the context zone it is keyed to before the pairing looks wrong. */
export const STRUCTURE_GLB_BUDGETS = Object.freeze({
  triangleRangeLod0: [1_000, 8_000] as const,
  triangleRangeLod1: [300, 2_000] as const,
  triangleRangeLod2: [100, 500] as const,
  maxMaterials: 4,
  maxTexturesPerMaterial: 3,
  originGroundToleranceM: 0.2,
  footprintAreaRatioRange: [0.4, 2.5] as const,
});
export type StructureGlbBudgets = typeof STRUCTURE_GLB_BUDGETS;
/** Engineering sanity envelope on a single structure's own bounds (not §
 * text): generous enough that a real clubhouse or maintenance building
 * never trips it, tight enough to catch a stray ×10/×100 unit mistake. */
const STRUCTURE_SCALE_SANITY = Object.freeze({ minSpanM: 0.5, maxFootprintM: 120, maxHeightM: 60 });

// ---------------------------------------------------------------------------
// Minimal, defensive JSON access. `parseGlb`'s `json` is untyped external
// data; every read goes through one of these so a malformed or unexpected
// shape degrades to a documented fallback/issue instead of throwing.
// ---------------------------------------------------------------------------
const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' ? value as Record<string, unknown> : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asRecordArray = (value: unknown): Record<string, unknown>[] => asArray(value).map(asRecord);
const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const stringArray = (value: unknown): string[] => asArray(value).filter((v): v is string => typeof v === 'string');
function numberTriple(value: unknown, fallback: readonly [number, number, number]): [number, number, number] {
  const v = asArray(value);
  return v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? [v[0] as number, v[1] as number, v[2] as number] : [...fallback];
}
function numberQuad(value: unknown, fallback: readonly [number, number, number, number]): [number, number, number, number] {
  const v = asArray(value);
  return v.length === 4 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? [v[0] as number, v[1] as number, v[2] as number, v[3] as number] : [...fallback];
}
/** Unlike `numberTriple`, a missing/invalid value is `null`: POSITION
 * accessor `min`/`max` are spec-required, so absence is an error, never a
 * silent default. */
function numberTripleOrNull(value: unknown): [number, number, number] | null {
  const v = asArray(value);
  return v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? [v[0] as number, v[1] as number, v[2] as number] : null;
}

// ---------------------------------------------------------------------------
// A tiny column-major 4×4 (glTF's own layout): identity, TRS/array
// construction, multiply and point transform. Enough to compose a node
// graph's transforms exactly (including non-uniform scale and an explicit
// `matrix` node) without a matrix library.
// ---------------------------------------------------------------------------
type Mat4 = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
const MAT4_IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** glTF's own TRS→matrix formula (the same one three.js's `Matrix4.compose`
 * uses): M = T · R · S, so a local-space point is scaled, then rotated,
 * then translated. */
function mat4FromTRS(t: readonly [number, number, number], r: readonly [number, number, number, number], s: readonly [number, number, number]): Mat4 {
  const [x, y, z, w] = r, [sx, sy, sz] = s, [tx, ty, tz] = t;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mat4FromArray(values: readonly number[]): Mat4 {
  const v = (i: number) => values[i] ?? 0;
  return [v(0), v(1), v(2), v(3), v(4), v(5), v(6), v(7), v(8), v(9), v(10), v(11), v(12), v(13), v(14), v(15)];
}
/** `a` applied after `b`: `transform(multiply(a, b), p) === transform(a, transform(b, p))`. */
function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  return [
    a[0] * b[0] + a[4] * b[1] + a[8] * b[2] + a[12] * b[3], a[1] * b[0] + a[5] * b[1] + a[9] * b[2] + a[13] * b[3],
    a[2] * b[0] + a[6] * b[1] + a[10] * b[2] + a[14] * b[3], a[3] * b[0] + a[7] * b[1] + a[11] * b[2] + a[15] * b[3],
    a[0] * b[4] + a[4] * b[5] + a[8] * b[6] + a[12] * b[7], a[1] * b[4] + a[5] * b[5] + a[9] * b[6] + a[13] * b[7],
    a[2] * b[4] + a[6] * b[5] + a[10] * b[6] + a[14] * b[7], a[3] * b[4] + a[7] * b[5] + a[11] * b[6] + a[15] * b[7],
    a[0] * b[8] + a[4] * b[9] + a[8] * b[10] + a[12] * b[11], a[1] * b[8] + a[5] * b[9] + a[9] * b[10] + a[13] * b[11],
    a[2] * b[8] + a[6] * b[9] + a[10] * b[10] + a[14] * b[11], a[3] * b[8] + a[7] * b[9] + a[11] * b[10] + a[15] * b[11],
    a[0] * b[12] + a[4] * b[13] + a[8] * b[14] + a[12] * b[15], a[1] * b[12] + a[5] * b[13] + a[9] * b[14] + a[13] * b[15],
    a[2] * b[12] + a[6] * b[13] + a[10] * b[14] + a[14] * b[15], a[3] * b[12] + a[7] * b[13] + a[11] * b[14] + a[15] * b[15],
  ];
}
function mat4TransformPoint(m: Mat4, [x, y, z]: readonly [number, number, number]): [number, number, number] {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
/** Inverts glb-writer.ts's `Z_UP_TO_Y_UP_ROTATION` (see header). */
function gltfToProjectFrame([x, y, z]: readonly [number, number, number]): [number, number, number] { return [x, -z, y]; }

// ---------------------------------------------------------------------------
// Read: a minimal, non-throwing glTF reader over an already-parsed GLB.
// ---------------------------------------------------------------------------
const MAX_NODE_DEPTH = 32;
/** An extension that places geometry outside any node's own TRS (each
 * "instance" carries its own transform), which this reader's one-transform-
 * per-node model cannot represent. Geometry *compression* (Draco, meshopt)
 * is fine — this reader never decodes BIN, only JSON-declared metadata. */
const UNSUPPORTED_REQUIRED_EXTENSIONS: ReadonlySet<string> = new Set(['EXT_mesh_gpu_instancing']);

export interface GlbParseIssue { code: string; severity: 'error' | 'warn'; detail: string }
export interface GlbSceneGeometry {
  triangleCount: number; nodeCount: number; meshCount: number;
  materialsDeclared: number; materialsUsed: number;
  texturesDeclared: number; texturesUsed: number; imagesDeclared: number;
  /** `[x0, y0, z0, x1, y1, z1]`, this project's local metre frame. */
  boundsM: [number, number, number, number, number, number];
  usesGeometryCompression: boolean; usesKtx2: boolean;
  /** §100 authoring hygiene, not reader limits — see the header. */
  hasMatrixNode: boolean; hasUnappliedScale: boolean;
  extensionsUsed: string[]; extensionsRequired: string[];
  parseIssues: GlbParseIssue[];
}

function emptyGeometry(parseIssues: GlbParseIssue[]): GlbSceneGeometry {
  return {
    triangleCount: 0, nodeCount: 0, meshCount: 0, materialsDeclared: 0, materialsUsed: 0, texturesDeclared: 0, texturesUsed: 0, imagesDeclared: 0,
    boundsM: [0, 0, 0, 0, 0, 0], usesGeometryCompression: false, usesKtx2: false, hasMatrixNode: false, hasUnappliedScale: false,
    extensionsUsed: [], extensionsRequired: [], parseIssues,
  };
}
/** §58's "base color / normal / ORM": the texture slots a glTF PBR material
 * can carry, unioned so a packed ORM texture (occlusion+metallicRoughness
 * sharing one index) is counted once. */
function materialTextureRefs(material: Record<string, unknown>): number[] {
  const pbr = asRecord(material.pbrMetallicRoughness);
  const indices: number[] = [];
  for (const ref of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
    const index = asRecord(ref).index;
    if (typeof index === 'number') indices.push(index);
  }
  return indices;
}

/** Reads one GLB's scene geometry. Never throws: a file `parseGlb` itself
 * rejects, or whose JSON is unusable, comes back as an empty geometry
 * carrying one `error` parse issue, so a batch scan (report-structure-glb.mts)
 * never aborts on a single bad file. See the header for what this does and
 * does not decode. */
export function readStructureGlbGeometry(bytes: Uint8Array): GlbSceneGeometry {
  let json: Record<string, unknown>;
  try { json = asRecord(parseGlb(bytes).json); }
  catch (error) { return emptyGeometry([{ code: 'not_a_glb', severity: 'error', detail: (error as Error).message }]); }

  const nodes = asRecordArray(json.nodes), meshes = asRecordArray(json.meshes), accessors = asRecordArray(json.accessors);
  const materials = asRecordArray(json.materials), textures = asRecordArray(json.textures), images = asRecordArray(json.images);
  const scenes = asRecordArray(json.scenes);
  const extensionsUsed = stringArray(json.extensionsUsed), extensionsRequired = stringArray(json.extensionsRequired);

  const issues: GlbParseIssue[] = [];
  const scene = scenes[numberOr(json.scene, 0)];
  const rootIndices = scene ? asArray(scene.nodes).filter((v): v is number => typeof v === 'number') : [];
  if (!rootIndices.length) issues.push({ code: 'no_default_scene', severity: 'error', detail: 'the file declares no default scene with root nodes' });

  let triangleCount = 0, meshInstanceCount = 0, hasMatrixNode = false, hasUnappliedScale = false;
  const materialsUsed = new Set<number>(), texturesUsed = new Set<number>();
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const visit = (nodeIndex: number, parent: Mat4, depth: number): void => {
    if (depth > MAX_NODE_DEPTH) { issues.push({ code: 'node_depth_exceeded', severity: 'error', detail: `node graph deeper than ${MAX_NODE_DEPTH} (cycle?)` }); return; }
    const node = nodes[nodeIndex];
    if (!node) { issues.push({ code: 'node_out_of_range', severity: 'error', detail: `node ${nodeIndex} does not exist` }); return; }

    const matrixRaw = asArray(node.matrix);
    let local: Mat4;
    if (matrixRaw.length === 16 && matrixRaw.every(v => typeof v === 'number')) { local = mat4FromArray(matrixRaw as number[]); hasMatrixNode = true; }
    else {
      const scale = numberTriple(node.scale, [1, 1, 1]);
      if (Math.abs(scale[0] - 1) > 1e-4 || Math.abs(scale[1] - 1) > 1e-4 || Math.abs(scale[2] - 1) > 1e-4) hasUnappliedScale = true;
      local = mat4FromTRS(numberTriple(node.translation, [0, 0, 0]), numberQuad(node.rotation, [0, 0, 0, 1]), scale);
    }
    const world = mat4Multiply(parent, local);

    if (typeof node.mesh === 'number') {
      const mesh = meshes[node.mesh];
      if (!mesh) issues.push({ code: 'mesh_out_of_range', severity: 'error', detail: `node ${nodeIndex} references mesh ${node.mesh}, which does not exist` });
      else {
        meshInstanceCount++;
        for (const primitive of asRecordArray(mesh.primitives)) {
          const attributes = asRecord(primitive.attributes);
          const positionIndex = attributes.POSITION;
          const position = typeof positionIndex === 'number' ? accessors[positionIndex] : undefined;
          const min = position ? numberTripleOrNull(position.min) : null, max = position ? numberTripleOrNull(position.max) : null;
          if (!position || !min || !max) { issues.push({ code: 'position_bounds_missing', severity: 'error', detail: `mesh ${node.mesh} primitive has no POSITION accessor min/max` }); continue; }
          for (const cx of [min[0], max[0]]) for (const cy of [min[1], max[1]]) for (const cz of [min[2], max[2]]) {
            const [px, py, pz] = gltfToProjectFrame(mat4TransformPoint(world, [cx, cy, cz]));
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
            if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
          }
          if (typeof primitive.material === 'number') {
            materialsUsed.add(primitive.material);
            const material = materials[primitive.material];
            if (material) for (const ref of materialTextureRefs(material)) texturesUsed.add(ref);
          }
          const mode = numberOr(primitive.mode, 4);
          if (mode !== 4) { issues.push({ code: 'unsupported_primitive_mode', severity: 'warn', detail: `mesh ${node.mesh} primitive mode ${mode} is not TRIANGLES` }); continue; }
          const indexAccessor = typeof primitive.indices === 'number' ? accessors[primitive.indices] : undefined;
          const count = indexAccessor ? numberOr(indexAccessor.count, 0) : numberOr(position.count, 0);
          if (count % 3 !== 0) issues.push({ code: 'invalid_index_count', severity: 'warn', detail: `mesh ${node.mesh} primitive has ${count} indices, not a multiple of 3` });
          triangleCount += Math.floor(count / 3);
        }
      }
    }
    for (const childIndex of asArray(node.children).filter((v): v is number => typeof v === 'number')) visit(childIndex, world, depth + 1);
  };
  for (const rootIndex of rootIndices) visit(rootIndex, MAT4_IDENTITY, 0);

  if (!meshInstanceCount) issues.push({ code: 'no_geometry', severity: 'error', detail: 'no node in the default scene references a mesh' });
  const unsupported = extensionsRequired.filter(ext => UNSUPPORTED_REQUIRED_EXTENSIONS.has(ext));
  if (unsupported.length) issues.push({ code: 'unsupported_extension', severity: 'error', detail: `requires ${unsupported.join(', ')}, which places geometry outside node TRS` });

  return {
    triangleCount, nodeCount: nodes.length, meshCount: meshes.length,
    materialsDeclared: materials.length, materialsUsed: materialsUsed.size,
    texturesDeclared: textures.length, texturesUsed: texturesUsed.size, imagesDeclared: images.length,
    boundsM: meshInstanceCount ? [minX, minY, minZ, maxX, maxY, maxZ] : [0, 0, 0, 0, 0, 0],
    usesGeometryCompression: extensionsUsed.some(ext => ext === 'KHR_draco_mesh_compression' || ext === 'EXT_meshopt_compression'),
    usesKtx2: extensionsUsed.includes('KHR_texture_basisu') || images.some(image => image.mimeType === 'image/ktx2' || (typeof image.uri === 'string' && image.uri.endsWith('.ktx2'))),
    hasMatrixNode, hasUnappliedScale, extensionsUsed, extensionsRequired, parseIssues: issues,
  };
}

// ---------------------------------------------------------------------------
// Validate: the convention doc's mechanically-checkable rules.
// ---------------------------------------------------------------------------
export interface StructureGlbViolation { rule: string; severity: 'error' | 'warn'; detail: string }
export interface StructureGlbValidation {
  ok: boolean; violations: StructureGlbViolation[];
  footprintM: [number, number]; footprintAreaM2: number; heightM: number; groundOffsetM: number;
}
export interface ValidateStructureGlbOptions { zoneFootprintAreaM2?: number; budgets?: StructureGlbBudgets }

/** `ok` is false whenever any violation is `error`-severity. `footprintM`/
 * `footprintAreaM2`/`heightM` are the model's own axis-aligned bounding
 * footprint and height in the project frame — a validation heuristic, never
 * a claim about the true silhouette area (mirrors three-context.ts's
 * `roofArchetype`, "never a claim about the real ridge or pitch"). */
export function validateStructureGlbGeometry(geometry: GlbSceneGeometry, options: ValidateStructureGlbOptions = {}): StructureGlbValidation {
  const budgets = options.budgets ?? STRUCTURE_GLB_BUDGETS;
  const violations: StructureGlbViolation[] = geometry.parseIssues.map(issue => ({ rule: issue.code, severity: issue.severity, detail: issue.detail }));
  const push = (rule: string, severity: 'error' | 'warn', detail: string) => violations.push({ rule, severity, detail });

  const [x0, y0, z0, x1, y1, z1] = geometry.boundsM;
  const footprintWidthM = x1 - x0, footprintDepthM = y1 - y0, heightM = z1 - z0;
  const footprintAreaM2 = footprintWidthM * footprintDepthM;
  const hasUsableGeometry = !geometry.parseIssues.some(issue => issue.code === 'no_geometry');

  if (hasUsableGeometry) {
    if (!(footprintWidthM > 0) || !(footprintDepthM > 0) || !(heightM > 0)) {
      push('degenerate_bounds', 'error', `bounds ${footprintWidthM.toFixed(2)}×${footprintDepthM.toFixed(2)}×${heightM.toFixed(2)} m are not a positive volume`);
    } else {
      if (footprintWidthM > STRUCTURE_SCALE_SANITY.maxFootprintM || footprintDepthM > STRUCTURE_SCALE_SANITY.maxFootprintM || heightM > STRUCTURE_SCALE_SANITY.maxHeightM)
        push('implausible_scale', 'warn', `bounds ${footprintWidthM.toFixed(1)}×${footprintDepthM.toFixed(1)}×${heightM.toFixed(1)} m exceed the sanity envelope — check the export's unit scale`);
      if (footprintWidthM < STRUCTURE_SCALE_SANITY.minSpanM || footprintDepthM < STRUCTURE_SCALE_SANITY.minSpanM || heightM < STRUCTURE_SCALE_SANITY.minSpanM)
        push('implausible_scale', 'warn', `bounds ${footprintWidthM.toFixed(2)}×${footprintDepthM.toFixed(2)}×${heightM.toFixed(2)} m are under the sanity floor — check the export's unit scale`);
      if (Math.abs(z0) > budgets.originGroundToleranceM)
        push('origin_not_ground_contact', 'error', `the model's own origin (z=0) sits ${z0.toFixed(3)} m from its lowest vertex; the convention places the origin at ground contact`);
    }
  }

  const [, lod0Max] = budgets.triangleRangeLod0, [lod2Min] = budgets.triangleRangeLod2;
  if (geometry.triangleCount > 0 && (geometry.triangleCount < lod2Min || geometry.triangleCount > lod0Max))
    push('triangle_budget', 'warn', `${geometry.triangleCount} triangles outside §57's ${lod2Min}-${lod0Max} range`);
  if (geometry.materialsUsed > budgets.maxMaterials) push('material_budget', 'warn', `${geometry.materialsUsed} materials used, over §100's "few material slots" (${budgets.maxMaterials})`);
  if (geometry.materialsUsed > 0 && geometry.texturesUsed > geometry.materialsUsed * budgets.maxTexturesPerMaterial)
    push('texture_budget', 'warn', `${geometry.texturesUsed} textures for ${geometry.materialsUsed} material(s), over §58's ${budgets.maxTexturesPerMaterial}/material`);
  if (geometry.texturesUsed > 0 && !geometry.usesKtx2) push('texture_compression', 'warn', 'textures are not KTX2/Basis Universal (§101-102) — compress before shipping');
  if (geometry.hasMatrixNode) push('node_matrix_present', 'warn', '§100 prefers TRS nodes over an explicit matrix; bounds above were still computed correctly');
  if (geometry.hasUnappliedScale) push('node_scale_unapplied', 'warn', '§100 "no unapplied scale" — a node scale other than 1 was found; bounds above were still computed correctly');

  if (options.zoneFootprintAreaM2 != null && options.zoneFootprintAreaM2 > 0 && footprintAreaM2 > 0) {
    const ratio = footprintAreaM2 / options.zoneFootprintAreaM2;
    const [minRatio, maxRatio] = budgets.footprintAreaRatioRange;
    if (ratio < minRatio || ratio > maxRatio) push('footprint_zone_mismatch', 'warn', `model footprint ${footprintAreaM2.toFixed(1)} m² vs zone ${options.zoneFootprintAreaM2.toFixed(1)} m² (×${ratio.toFixed(2)})`);
  }

  return {
    ok: violations.every(v => v.severity !== 'error'), violations,
    footprintM: [Math.max(0, footprintWidthM), Math.max(0, footprintDepthM)], footprintAreaM2: Math.max(0, footprintAreaM2), heightM: Math.max(0, heightM), groundOffsetM: z0,
  };
}

// ---------------------------------------------------------------------------
// Catalog: authored files keyed by context structure id (Ruling R8).
// ---------------------------------------------------------------------------
export interface StructureGlbCatalogEntry { structureId: string; fileName: string; contentHash: string; geometry: GlbSceneGeometry; validation: StructureGlbValidation }
export type StructureGlbCatalog = ReadonlyMap<string, StructureGlbCatalogEntry>;

/** The convention (see the doc): a file's structure id is its name without
 * the `.glb` extension, matched against a context zone's own `id`. */
export function structureIdFromFileName(fileName: string): string { return fileName.replace(/\.glb$/i, ''); }

/** Reads, validates (zone-agnostic — no footprint-vs-zone check yet) and
 * hashes one authored GLB. Never throws (see `readStructureGlbGeometry`). */
export function inspectStructureGlb(fileName: string, bytes: Uint8Array): StructureGlbCatalogEntry {
  const geometry = readStructureGlbGeometry(bytes);
  return { structureId: structureIdFromFileName(fileName), fileName, contentHash: fnvBytes([bytes]), geometry, validation: validateStructureGlbGeometry(geometry) };
}
/** Batch form for a folder scan (report-structure-glb.mts) or a test fixture
 * set. A duplicate structure id keeps the last entry given. */
export function buildStructureGlbCatalog(files: readonly { fileName: string; bytes: Uint8Array }[]): StructureGlbCatalog {
  const catalog = new Map<string, StructureGlbCatalogEntry>();
  for (const file of files) catalog.set(structureIdFromFileName(file.fileName), inspectStructureGlb(file.fileName, file.bytes));
  return catalog;
}

// ---------------------------------------------------------------------------
// Place: context structure zones × the catalog → world-scale placements.
// ---------------------------------------------------------------------------
export interface StructurePlacementItem {
  id: string;
  /** The catalog key a renderer looks the asset up by (== the zone id; a
   * MultiPolygon zone's parts share one `structureId` but each gets its own `id`). */
  structureId: string;
  class: ContextClass;
  basis: 'authored_glb';
  /** Hole-local metres; z is ground-contact height (§ header, `terrainHeight`). */
  positionM: [number, number, number];
  /** Rotation in the XY plane (this project's vertical axis) that carries
   * the authored model's local +Y ("forward", the convention doc) onto the
   * footprint's outward direction (perpendicular to its longest edge,
   * pointing away from the footprint's own centroid): the counter-clockwise
   * angle θ solving (−sinθ, cosθ) = (nx, ny), i.e. θ = atan2(−nx, ny). */
  yawRadians: number;
  footprintAreaM2: number;
  heightM: number;
  /** Spread of `terrainHeight` samples under the footprint — how much slope
   * this placement's single ground-contact height is hiding. */
  groundSpanM: number;
  assetFile: string;
  assetContentHash: string;
}
export interface SkippedStructureZone { id: string; class: ContextClass; reason: string }
export interface StructurePlacementResult { items: StructurePlacementItem[]; skipped: SkippedStructureZone[] }

function round(value: number, decimals: number): number { const f = 10 ** decimals; return Math.round(value * f) / f; }
/** Drops a ring's repeated closing vertex (mirrors three-context.ts `extrusion()`). */
function openRing(ring: readonly PointM[]): PointM[] {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring.slice();
}
/** Shoelace centroid (same formula as three-context.ts `roofArchetype`,
 * reimplemented here since that module is a THREE consumer this three-free
 * module cannot import); falls back to the vertex average for a degenerate
 * (near-zero-area) ring. */
function ringCentroid(points: readonly PointM[]): PointM {
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!, cross = a[0] * b[1] - b[0] * a[1];
    area += cross; cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    let sx = 0, sy = 0;
    for (const p of points) { sx += p[0]; sy += p[1]; }
    return [sx / points.length, sy / points.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}
/** First-seen edge wins ties (ascending ring index), so a symmetric
 * footprint (e.g. a square) still orients deterministically. */
function longestEdgeIndex(points: readonly PointM[]): number {
  let bestIndex = 0, bestLength = -1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > bestLength) { bestLength = length; bestIndex = i; }
  }
  return bestIndex;
}
interface FootprintPlacement { anchor: PointM; groundM: number; groundSpanM: number; yawRadians: number }
/** Ground contact from every footprint corner's own `terrainHeight`, taking
 * the min (mirrors three-context.ts `extrusion()`, "so no corner floats");
 * `null` when any corner falls off the terrain this module was given. */
function placeOnFootprint(ring: readonly PointM[], mesh: TerrainMesh): FootprintPlacement | null {
  const points = openRing(ring);
  if (points.length < 3) return null;
  const heights = points.map(p => terrainHeight(mesh, p)).filter((z): z is number => z != null);
  if (heights.length < points.length) return null;
  const groundM = Math.min(...heights), groundSpanM = Math.max(...heights) - groundM;
  const anchor = ringCentroid(points);
  const edgeIndex = longestEdgeIndex(points);
  const a = points[edgeIndex]!, b = points[(edgeIndex + 1) % points.length]!;
  let nx = (a[0] + b[0]) / 2 - anchor[0], ny = (a[1] + b[1]) / 2 - anchor[1];
  const length = Math.hypot(nx, ny) || 1;
  nx /= length; ny /= length;
  return { anchor, groundM, groundSpanM, yawRadians: Math.atan2(-nx, ny) };
}

/** Places every catalog-matched, validated structure zone. A zone with no
 * catalog entry, a failing validation, or a footprint this terrain cannot
 * ground is recorded in `skipped` with why, never silently dropped or
 * invented (Ruling R8). Deterministic: sorted by id, no randomness. */
export function buildStructurePlacements(zones: readonly LocalContextZone[], mesh: TerrainMesh, catalog: StructureGlbCatalog): StructurePlacementResult {
  const items: StructurePlacementItem[] = [];
  const skipped: SkippedStructureZone[] = [];
  const structureZones = zones.filter(zone => STRUCTURE_CONTEXT_CLASSES.includes(zone.class)).slice().sort((a, b) => a.id.localeCompare(b.id));

  for (const zone of structureZones) {
    const entry = catalog.get(zone.id);
    if (!entry) { skipped.push({ id: zone.id, class: zone.class, reason: 'no_authored_glb' }); continue; }
    if (!zone.parts.length) { skipped.push({ id: zone.id, class: zone.class, reason: 'no_geometry' }); continue; }

    zone.parts.forEach((rings, partIndex) => {
      const outer = rings[0];
      const partId = zone.parts.length > 1 ? `${zone.id}#${partIndex}` : zone.id;
      if (!outer || outer.length < 3) { skipped.push({ id: partId, class: zone.class, reason: 'no_outer_ring' }); return; }

      const validation = validateStructureGlbGeometry(entry.geometry, { zoneFootprintAreaM2: ringArea(outer) });
      if (!validation.ok) { skipped.push({ id: partId, class: zone.class, reason: `glb_invalid:${validation.violations.find(v => v.severity === 'error')?.rule ?? 'unknown'}` }); return; }

      const placement = placeOnFootprint(outer, mesh);
      if (!placement) { skipped.push({ id: partId, class: zone.class, reason: 'no_ground_height' }); return; }

      items.push({
        id: partId, structureId: zone.id, class: zone.class, basis: 'authored_glb',
        positionM: [round(placement.anchor[0], 3), round(placement.anchor[1], 3), round(placement.groundM, 3)],
        yawRadians: round(placement.yawRadians, 5),
        footprintAreaM2: round(validation.footprintAreaM2, 2), heightM: round(validation.heightM, 3), groundSpanM: round(placement.groundSpanM, 3),
        assetFile: entry.fileName, assetContentHash: entry.contentHash,
      });
    });
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return { items, skipped };
}

/** Distinct from `emptyPackedSet('unfilled_task17')` (visual-artifact-v2.ts,
 * compile-visual-artifact-v2.ts): that string means "this compiler has not
 * run yet"; this one means "this compiler ran and found `count` authored,
 * validated models" — `count` may honestly be 0 today (see header). */
export const STATIC_OBJECT_SET_BASIS = 'context_structure_glb_v1';

/** Top-level compiler, matching this directory's `compileX(scene, mesh, …)`
 * shape (field-atlas.ts, hero-patches.ts) for whoever wires Task 17 into
 * compile-visual-artifact-v2.ts's `objects.structures` (see this file's
 * report `sharedDiffs` for the one-line diff that does it). */
export function compileStaticObjectSet(scene: HoleScene, mesh: TerrainMesh, catalog: StructureGlbCatalog): PackedObjectSet {
  // buildStructurePlacements filters to STRUCTURE_CONTEXT_CLASSES itself.
  const { items } = buildStructurePlacements(scene.contextZones ?? [], mesh, catalog);
  return { basis: STATIC_OBJECT_SET_BASIS, count: items.length, contentHash: fnvBytes([new TextEncoder().encode(JSON.stringify(items))]), items };
}
