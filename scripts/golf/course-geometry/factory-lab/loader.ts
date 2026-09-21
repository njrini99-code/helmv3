import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { parseContextLayer } from '@/lib/golf/course-geometry/context-layer';
import type { LabBundle, ObjectRef } from './server';

async function sha(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
async function readBounded(stream: ReadableStream<Uint8Array>, maximum: number) {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximum) throw new Error('Factory asset exceeds byte budget');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  return bytes;
}
export async function loadFactoryHole(layout: string, bundleHash: string, holeKey: string, signal: AbortSignal) {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(layout) || !/^[a-f0-9]{64}$/.test(bundleHash)) throw new Error('Explicit layout and immutable bundle hash required');
  const base = `/__factory/${layout}/${bundleHash}/`;
  const response = await fetch(`${base}manifest`, { signal });
  if (!response.ok || !response.body) throw new Error('Unknown or invalid factory bundle');
  const manifestBytes = await readBounded(response.body, 512 * 1024);
  if (await sha(manifestBytes) !== bundleHash) throw new Error('Factory manifest integrity mismatch');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as LabBundle;
  if (manifest.layoutId !== layout || manifest.schema !== 'golfhelm-factory-lab-bundle-v1' || manifest.measurementAuthority !== false) throw new Error('Factory manifest identity mismatch');
  const hole = manifest.holes.find(candidate => candidate.key === holeKey);
  if (!hole) throw new Error('Unknown physical hole; no fallback is available');
  async function object(ref: ObjectRef) {
    const result = await fetch(`${base}${ref.sha256}`, { signal });
    if (!result.ok || !result.body || ref.bytes > 32 * 1024 * 1024) throw new Error('Factory object unavailable');
    const bytes = await readBounded(result.body, ref.bytes);
    if (bytes.length !== ref.bytes || await sha(bytes) !== ref.sha256) throw new Error('Factory object integrity mismatch');
    return bytes;
  }
  const packageBytes = await object(manifest.package);
  const pkg = parseGeometryPackage(JSON.parse(new TextDecoder().decode(packageBytes)));
  if (pkg.contentHash !== manifest.packageHash) throw new Error('Package identity mismatch');
  const compressed = await object(hole.terrain);
  const decoded = await readBounded(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')), hole.decodedBytes);
  if (decoded.length !== hole.decodedBytes || await sha(decoded) !== hole.decodedSha256) throw new Error('Terrain decoded integrity mismatch');
  const mesh = parseTerrainMesh(JSON.parse(new TextDecoder().decode(decoded)), pkg);
  if (mesh.contentHash !== hole.meshHash || mesh.physicalHoleKey !== holeKey) throw new Error('Terrain identity mismatch');
  const context = manifest.context ? parseContextLayer(JSON.parse(new TextDecoder().decode(await object(manifest.context))), pkg) : undefined;
  return { manifest, pkg, mesh, context, hole, assetBase: base };
}
