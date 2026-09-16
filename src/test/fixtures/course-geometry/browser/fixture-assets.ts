/** Bounded same-origin loader for compiled review fixtures, not offline activation. */
import cacaponManifest from '../compiled-cacapon/asset-manifest.json';
import peekManifest from '../compiled-peek-n-peak-upper/asset-manifest.json';
import peekData from '../peek-n-peak-upper.json';
import peekContext from '../peek-n-peak-upper-context.json';
import { parseContextLayer, type ContextLayer } from '@/lib/golf/course-geometry/context-layer';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { pilotPackage } from '../pilot';

const MAX_COMPRESSED_BYTES = 2_000_000, MAX_DECODED_BYTES = 8_000_000;
type ManifestEntry = { fileName: string; compressedBytes: number; uncompressedBytes: number; sha256: string; uncompressedSha256: string };
/** Each compiled course keeps its own directory so Vite's URL analysis stays
 * bounded to that course's assets. The package is the one the terrain was
 * hash-locked against; the loader refuses a hole the manifest does not list. */
export const compiledCourses = {
  cacapon: { pkg: pilotPackage, holes: cacaponManifest.holes as Record<string, ManifestEntry>,
    url: (name: string) => new URL(`../compiled-cacapon/${name}`, import.meta.url) },
  'peek-n-peak-upper': { pkg: parseGeometryPackage(peekData), holes: peekManifest.holes as Record<string, ManifestEntry>,
    url: (name: string) => new URL(`../compiled-peek-n-peak-upper/${name}`, import.meta.url) },
};
export type CompiledCourse = keyof typeof compiledCourses;
/** Outside-world context layers retained beside the packages (player-view
 * spec §8). Parsed once per course; a layer for another package is refused. */
const contextSources: Partial<Record<CompiledCourse, unknown>> = { 'peek-n-peak-upper': peekContext };
const contextCache = new Map<CompiledCourse, ContextLayer | null>();
export function contextLayerFor(course: CompiledCourse): ContextLayer | null {
  if (!contextCache.has(course)) {
    const raw = contextSources[course];
    contextCache.set(course, raw ? parseContextLayer(raw, compiledCourses[course].pkg) : null);
  }
  return contextCache.get(course) ?? null;
}
export function isCompiledCourse(value: string | null): value is CompiledCourse { return value != null && value in compiledCourses; }

async function hash(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
async function boundedBytes(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('Course asset exceeds decoded budget');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function loadCompiledFixture(holeKey: string, signal: AbortSignal, course: CompiledCourse = 'cacapon') {
  const { pkg, holes, url: assetUrl } = compiledCourses[course];
  const entry = holes[holeKey];
  if (!entry || entry.compressedBytes > MAX_COMPRESSED_BYTES || entry.uncompressedBytes > MAX_DECODED_BYTES) throw new Error('Unsupported course package');
  const response = await fetch(assetUrl(entry.fileName), { signal });
  if (!response.ok || !response.body) throw new Error(`Terrain package ${response.status}`);
  // Vite serves .json.gz with Content-Encoding:gzip; Fetch has already decoded
  // that transport. Raw gzip object delivery instead needs explicit inflation.
  let decoded: Uint8Array<ArrayBuffer>;
  if (response.headers.get('content-encoding') === 'gzip') {
    const length = response.headers.get('content-length');
    if (length != null && Number(length) !== entry.compressedBytes) throw new Error('Terrain transfer size mismatch');
    decoded = await boundedBytes(response.body, MAX_DECODED_BYTES);
  } else {
    const compressed = await boundedBytes(response.body, MAX_COMPRESSED_BYTES);
    if (compressed.length !== entry.compressedBytes || await hash(compressed) !== entry.sha256) throw new Error('Terrain download integrity mismatch');
    decoded = await boundedBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_DECODED_BYTES);
  }
  if (decoded.length !== entry.uncompressedBytes || await hash(decoded) !== entry.uncompressedSha256) throw new Error('Terrain decoded integrity mismatch');
  if (signal.aborted) throw new DOMException('Course load canceled', 'AbortError');
  return parseTerrainMesh(JSON.parse(new TextDecoder().decode(decoded)), pkg);
}
