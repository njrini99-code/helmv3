/** Local factory artifacts only. Never imported by Next.js or production. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const SHA = /^[a-f0-9]{64}$/;
const KEY = /^[a-z0-9][a-z0-9-]{0,127}$/;
const MAX_BYTES = 32 * 1024 * 1024;
export const BUNDLE_SCHEMA = 'golfhelm-factory-lab-bundle-v1';
export type ObjectRef = { sha256: string; bytes: number; mediaType: string; sourceRelativePath: string };
export type LabBundle = {
  schema: typeof BUNDLE_SCHEMA; layoutId: string; packageHash: string; purpose: 'local-review-only'; measurementAuthority: false;
  package: ObjectRef; context: ObjectRef | null;
  admission: { status: 'unassessed' | 'retained-report'; version: string | null; report: ObjectRef | null };
  holes: Array<{ key: string; ordinal: number; terrain: ObjectRef; meshHash: string; decodedSha256: string; decodedBytes: number;
    glb: ObjectRef | null; worldRecordStatus?: 'available' | 'not_built' | 'different_package'; physicalWorldHash: string | null; truthGatePassed: boolean }>;
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** No symlink may cross or alias the configured root. Open the final file
 * with O_NOFOLLOW and hash bytes from that descriptor, not a second read. */
export async function readConfined(rootInput: string, parts: string[], maximum = MAX_BYTES): Promise<Buffer> {
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\/\0]/.test(part))) throw new Error('Invalid asset path');
  const root = resolve(rootInput);
  if (await realpath(root) !== root) throw new Error('Output root must not contain symlinks');
  const target = join(root, ...parts);
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Asset outside configured root');
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink asset refused');
  }
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > maximum) throw new Error('Asset byte budget exceeded');
    const buffer = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total !== stat.size) throw new Error('Asset changed while being read');
    return buffer.subarray(0, total);
  } finally { await file.close(); }
}

function object(value: unknown): value is ObjectRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as ObjectRef;
  return SHA.test(ref.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= MAX_BYTES &&
    ['application/json', 'application/gzip', 'model/gltf-binary'].includes(ref.mediaType) && typeof ref.sourceRelativePath === 'string';
}
export function parseBundle(value: unknown, layoutId: string): LabBundle {
  const doc = value as LabBundle;
  if (!doc || doc.schema !== BUNDLE_SCHEMA || doc.layoutId !== layoutId || !KEY.test(layoutId) || !SHA.test(doc.packageHash) ||
      doc.purpose !== 'local-review-only' || doc.measurementAuthority !== false || !object(doc.package) ||
      (doc.context !== null && !object(doc.context)) || !doc.admission ||
      !['unassessed', 'retained-report'].includes(doc.admission.status) ||
      (doc.admission.report !== null && !object(doc.admission.report)) ||
      (doc.admission.version !== null && !SHA.test(doc.admission.version)) ||
      !Array.isArray(doc.holes) || !doc.holes.length || doc.holes.length > 36) throw new Error('Unsupported local review bundle');
  if ((doc.admission.status === 'unassessed') !== (doc.admission.report === null)) throw new Error('Admission report status mismatch');
  const keys = new Set<string>();
  for (const hole of doc.holes) {
    if (!hole || !KEY.test(hole.key) || keys.has(hole.key) || !Number.isInteger(hole.ordinal) || hole.ordinal < 1 || hole.ordinal > 36 ||
        !object(hole.terrain) || !SHA.test(hole.meshHash) || !SHA.test(hole.decodedSha256) ||
        !Number.isSafeInteger(hole.decodedBytes) || hole.decodedBytes <= 0 || hole.decodedBytes > 8 * 1024 * 1024 ||
        (hole.glb !== null && !object(hole.glb)) || typeof hole.truthGatePassed !== 'boolean' ||
        (hole.physicalWorldHash !== null && !SHA.test(hole.physicalWorldHash))) throw new Error('Invalid hole in bundle');
    keys.add(hole.key);
  }
  return doc;
}
export async function loadBundle(root: string, layout: string, bundleHash: string) {
  if (!KEY.test(layout) || !SHA.test(bundleHash)) throw new Error('Explicit layout and immutable bundle hash required');
  const bytes = await readConfined(root, ['lab', 'bundles', layout, `${bundleHash}.json`], 512 * 1024);
  if (hash(bytes) !== bundleHash) throw new Error('Bundle manifest hash mismatch');
  return { bytes, manifest: parseBundle(JSON.parse(bytes.toString('utf8')), layout) };
}
export async function loadBundleObject(root: string, layout: string, bundleHash: string, objectHash: string) {
  if (!SHA.test(objectHash)) throw new Error('Invalid object hash');
  const { manifest } = await loadBundle(root, layout, bundleHash);
  const allowed = [manifest.package, manifest.context, manifest.admission.report,
    ...manifest.holes.flatMap(hole => [hole.terrain, hole.glb])].filter((ref): ref is ObjectRef => ref !== null);
  const ref = allowed.find(candidate => candidate.sha256 === objectHash);
  if (!ref) throw new Error('Object is not a member of this bundle');
  const bytes = await readConfined(root, ['lab', 'objects', objectHash], ref.bytes);
  if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256) throw new Error('Bundle object integrity mismatch');
  return { bytes, ref };
}
export function factoryBundlePlugin(outputRoot: string): Plugin {
  return { name: 'golfhelm-local-factory-bundles', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = (req.url ?? '').split('?')[0]!;
      if (!pathname.startsWith('/__factory/')) return next();
      // The dev server binds loopback. No permissive CORS; no writes or
      // arbitrary filesystem paths are accepted, even from local callers.
      const host = req.headers.host ?? '';
      if (!/^(127\.0\.0\.1|localhost|\[::1\]):8774$/.test(host) ||
          (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.statusCode = 403; res.end('Local origin required'); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
      try {
        const match = /^\/__factory\/([a-z0-9-]+)\/([a-f0-9]{64})\/(manifest|[a-f0-9]{64})$/.exec(pathname);
        if (!match) throw new Error('Invalid factory route');
        const [, layout, bundleHash, asset] = match;
        const result = asset === 'manifest' ? { ...(await loadBundle(outputRoot, layout!, bundleHash!)), ref: { mediaType: 'application/json' } } :
          await loadBundleObject(outputRoot, layout!, bundleHash!, asset!);
        res.setHeader('Content-Type', result.ref.mediaType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Length', result.bytes.length);
        res.end(req.method === 'HEAD' ? undefined : result.bytes);
      } catch {
        res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); res.end('Factory bundle unavailable or invalid');
      }
    });
  } };
}
