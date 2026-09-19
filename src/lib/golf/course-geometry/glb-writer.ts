/** Minimal glTF 2.0 / GLB binary reader-writer (V2 plan §100-102 GLB
 * optimization pipeline, §56-58 structures; Task 17 GLB pipeline infra).
 *
 * `writeGlb` turns plain typed-array meshes into a valid two-chunk GLB
 * buffer without a glTF library; `parseGlb` walks a GLB back into its JSON
 * and BIN chunks, for round-trip tests and for tools (a triangle/material/
 * texture report) that need to read a GLB without one. This module is
 * generic: it knows nothing about course-geometry contracts (PackedDisplayMesh,
 * hero patches, …) — callers convert their own arrays into a `GlbDocument`.
 * Three-free, no `@/components` (R12): only typed arrays, `DataView` and
 * `TextEncoder`/`TextDecoder`.
 *
 * Every accessor gets its own bufferView, padded to start on a 4-byte
 * boundary, so no accessor needs `byteStride` and every componentType's
 * alignment requirement is satisfied trivially (the one exception: a mesh's
 * primitives share one bufferView for `indices`, each accessor slicing a
 * different `byteOffset` — always a multiple of 4, since UNSIGNED_INT is 4
 * bytes and every `start` is an integer element count).
 *
 * Source geometry is this project's native Z-up (metres, hole-local frame);
 * glTF is Y-up, so every node carries a fixed -90°-about-X rotation rather
 * than rewriting the buffers — the same convention Blender's own glTF
 * exporter applies when it exports a Z-up scene. */

const GLB_MAGIC = 0x46546c67; // ASCII 'glTF', little-endian uint32
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a; // ASCII 'JSON'
const CHUNK_TYPE_BIN = 0x004e4942; // ASCII 'BIN\0'
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;
const COMPONENT_TYPE_UNSIGNED_BYTE = 5121;
const COMPONENT_TYPE_SHORT = 5122;
const COMPONENT_TYPE_UNSIGNED_INT = 5125;
const COMPONENT_TYPE_FLOAT = 5126;
const GLTF_TYPE_BY_COMPONENTS: Readonly<Record<number, string>> = Object.freeze({ 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' });
/** -90° about X: maps this project's Z-up (x, y, z-height) to glTF's Y-up
 * (x, z-height, -y) — the same conversion Blender's glTF exporter applies. */
const Z_UP_TO_Y_UP_ROTATION: readonly [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

type GlbTypedArray = Uint8Array | Int16Array | Uint32Array | Float32Array;

/** An application-specific vertex attribute. Name it glTF-style (leading
 * underscore: `_SURFACE_CLASS`, `_VISUAL_OFFSET_MM`, …) — standard
 * attributes (POSITION, NORMAL) are handled separately by `GlbMesh`. */
export interface GlbAttribute {
  name: string;
  array: Uint8Array | Int16Array | Float32Array;
  /** 1 (SCALAR) - 4 (VEC4). */
  components: number;
  normalized?: boolean;
}

/** One glTF primitive's slice of `indices`. `start`/`count` are index
 * (element) offsets into the mesh's shared index buffer, not triangles —
 * a triangle range `[t0, t0+n)` is `start: t0 * 3, count: n * 3`. */
export interface GlbPrimitiveGroup {
  name: string;
  start: number;
  count: number;
}

export interface GlbMesh {
  name: string;
  /** xyz per vertex, metres. */
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  attributes?: GlbAttribute[];
  /** One glTF primitive per group, all sharing the same POSITION/NORMAL/
   * attribute accessors and slicing the same index buffer. Defaults to a
   * single primitive covering every index. */
  primitiveGroups?: GlbPrimitiveGroup[];
}

export interface GlbDocument {
  meshes: GlbMesh[];
  /** Written to `asset.extras`: hashes, source/provenance strings, basis
   * names — never a timestamp or anything else that would make two
   * exports of the same input differ byte for byte. */
  extras?: Record<string, unknown>;
}

export interface ParsedGlb {
  json: Record<string, unknown>;
  bin: Uint8Array | null;
}

function componentTypeOf(array: GlbTypedArray): number {
  if (array instanceof Uint8Array) return COMPONENT_TYPE_UNSIGNED_BYTE;
  if (array instanceof Int16Array) return COMPONENT_TYPE_SHORT;
  if (array instanceof Uint32Array) return COMPONENT_TYPE_UNSIGNED_INT;
  if (array instanceof Float32Array) return COMPONENT_TYPE_FLOAT;
  throw new Error('glb-writer: unsupported typed array for a glTF accessor');
}
function gltfType(components: number): string {
  const type = GLTF_TYPE_BY_COMPONENTS[components];
  if (!type) throw new Error(`glb-writer: components must be 1-4, got ${components}`);
  return type;
}
/** A typed array's own bytes, respecting its `byteOffset`/`byteLength` — a
 * `.subarray()` or any other view onto a larger buffer must not leak its
 * neighbours' bytes into the GLB. */
function bytesOf(array: GlbTypedArray): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** Turns a document's meshes into a valid GLB (glTF 2.0 binary). Buffers are
 * embedded in one BIN chunk; every accessor owns its bufferView. */
export function writeGlb(document: GlbDocument): Uint8Array {
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const glMeshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const binChunks: Uint8Array[] = [];
  let binLength = 0;

  const pushBufferView = (bytes: Uint8Array, target: number): number => {
    const byteOffset = binLength;
    binChunks.push(bytes);
    binLength += bytes.byteLength;
    const pad = (4 - (binLength % 4)) % 4;
    if (pad) { binChunks.push(new Uint8Array(pad)); binLength += pad; }
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
    return bufferViews.length - 1;
  };

  const pushAccessor = (array: GlbTypedArray, components: number, target: number, opts: { normalized?: boolean; withBounds?: boolean } = {}): number => {
    if (array.length % components !== 0) throw new Error('glb-writer: accessor array length is not a multiple of its component count');
    const bufferView = pushBufferView(bytesOf(array), target);
    const count = array.length / components;
    const accessor: Record<string, unknown> = { bufferView, componentType: componentTypeOf(array), count, type: gltfType(components) };
    if (opts.normalized) accessor.normalized = true;
    if (opts.withBounds) {
      const min = new Array(components).fill(Infinity) as number[], max = new Array(components).fill(-Infinity) as number[];
      for (let i = 0; i < count; i++) for (let c = 0; c < components; c++) {
        const v = array[i * components + c]!;
        if (!Number.isFinite(v)) throw new Error('glb-writer: non-finite value in an accessor that requires min/max bounds');
        if (v < min[c]!) min[c] = v;
        if (v > max[c]!) max[c] = v;
      }
      accessor.min = min; accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  for (const mesh of document.meshes) {
    const attributes: Record<string, number> = { POSITION: pushAccessor(mesh.positions, 3, TARGET_ARRAY_BUFFER, { withBounds: true }) };
    if (mesh.normals) attributes.NORMAL = pushAccessor(mesh.normals, 3, TARGET_ARRAY_BUFFER);
    for (const attr of mesh.attributes ?? []) attributes[attr.name] = pushAccessor(attr.array, attr.components, TARGET_ARRAY_BUFFER, { normalized: attr.normalized });

    const indexView = pushBufferView(bytesOf(mesh.indices), TARGET_ELEMENT_ARRAY_BUFFER);
    const groups: GlbPrimitiveGroup[] = mesh.primitiveGroups?.length ? mesh.primitiveGroups : [{ name: mesh.name, start: 0, count: mesh.indices.length }];
    const primitives = groups.map(group => {
      if (group.start < 0 || group.count < 0 || group.start + group.count > mesh.indices.length) throw new Error(`glb-writer: ${mesh.name} primitive "${group.name}" is out of range of its index buffer`);
      accessors.push({ bufferView: indexView, byteOffset: group.start * 4, componentType: COMPONENT_TYPE_UNSIGNED_INT, count: group.count, type: 'SCALAR' });
      return { attributes: { ...attributes }, indices: accessors.length - 1, mode: 4, extras: { name: group.name } };
    });
    glMeshes.push({ name: mesh.name, primitives });
    nodes.push({ name: mesh.name, mesh: glMeshes.length - 1, rotation: Z_UP_TO_Y_UP_ROTATION });
  }

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'helm-meridian-glb-writer', extras: document.extras },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes: glMeshes, accessors, bufferViews,
  };
  if (binLength > 0) json.buffers = [{ byteLength: binLength }];
  const bin = new Uint8Array(binLength);
  for (let offset = 0, i = 0; i < binChunks.length; i++) { bin.set(binChunks[i]!, offset); offset += binChunks[i]!.byteLength; }
  return assembleGlb(json, bin);
}

/** Header + two chunks: JSON (space-padded to 4 bytes) then BIN (zero-padded
 * to 4 bytes, omitted entirely when there is no buffer data). */
function assembleGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunkLength = jsonBytes.byteLength + (4 - (jsonBytes.byteLength % 4)) % 4;
  const binChunkLength = bin.byteLength + (4 - (bin.byteLength % 4)) % 4;
  const totalLength = 12 + 8 + jsonChunkLength + (binChunkLength ? 8 + binChunkLength : 0);
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, CHUNK_TYPE_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonChunkLength); // glTF pads JSON with spaces
  const binOffset = 20 + jsonChunkLength;
  if (binChunkLength) {
    view.setUint32(binOffset, binChunkLength, true);
    view.setUint32(binOffset + 4, CHUNK_TYPE_BIN, true);
    out.set(bin, binOffset + 8); // trailing BIN padding bytes stay zero (Uint8Array default)
  }
  return out;
}

/** Reads a GLB's chunks back out, walking by chunk header so unknown chunk
 * types are skipped rather than assumed absent (per spec). Throws on a bad
 * magic number, unsupported version or missing JSON chunk; a GLB with no
 * BIN chunk (e.g. buffers by URI) returns `bin: null`. */
export function parseGlb(bytes: Uint8Array): ParsedGlb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('parseGlb: not a GLB file (bad magic)');
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) throw new Error(`parseGlb: unsupported GLB version ${version}`);
  const totalLength = view.getUint32(8, true);
  if (totalLength > bytes.byteLength) throw new Error('parseGlb: declared length exceeds the buffer');
  let json: Record<string, unknown> | null = null, bin: Uint8Array | null = null, offset = 12;
  while (offset + 8 <= totalLength) {
    const chunkLength = view.getUint32(offset, true), chunkType = view.getUint32(offset + 4, true), start = offset + 8;
    const data = bytes.subarray(start, start + chunkLength);
    if (chunkType === CHUNK_TYPE_JSON) json = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
    else if (chunkType === CHUNK_TYPE_BIN) bin = data;
    offset = start + chunkLength;
  }
  if (!json) throw new Error('parseGlb: no JSON chunk found');
  return { json, bin };
}
