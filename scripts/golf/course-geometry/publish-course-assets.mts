/**
 * Copy a compiled course into the app's static course-geometry folder in the
 * shape One-Tap's offline preflight reads (`EssentialCourseManifest`,
 * `src/lib/golf/one-tap/course-assets.ts`): the approved package, the optional
 * context layer and one terrain file per hole, every asset under a name that
 * carries its own content hash so a cached body is only ever served for the
 * hash it was published under. Bytes are copied verbatim from the compiled
 * fixtures (byte-identical files share one git blob), and every hash is
 * re-verified before anything is written. Writing the folder is a source
 * change like any other — it reaches players only through a normal deploy.
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.json scripts/golf/course-geometry/publish-course-assets.mts \
 *     [--course=peek-n-peak-upper] [--out=public/course-geometry]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseContextLayer } from '@/lib/golf/course-geometry/context-layer';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { EssentialCourseManifest } from '@/lib/golf/one-tap/course-assets';
import { courseIdForSite } from '@/lib/golf/one-tap/peek-n-peak-policy';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; }));
const course = String(args.course ?? 'peek-n-peak-upper');
const outRoot = String(args.out ?? 'public/course-geometry');
const fixtures = 'src/test/fixtures/course-geometry';
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const short = (hash: string) => hash.slice(0, 12);

const packageBytes = readFileSync(join(fixtures, `${course}.json`));
const pkg = parseGeometryPackage(JSON.parse(packageBytes.toString('utf8')));
const courseId = courseIdForSite(pkg.siteId);
if (courseId !== course) throw new Error(`Package site ${pkg.siteId} is course ${courseId}, not ${course}`);
type ManifestEntry = { fileName: string; uncompressedBytes: number; uncompressedSha256: string; contentHash: string };
const compiled = JSON.parse(readFileSync(join(fixtures, `compiled-${course}`, 'asset-manifest.json'), 'utf8')) as { geometryHash: string; holes: Record<string, ManifestEntry> };
if (compiled.geometryHash !== pkg.contentHash) throw new Error(`Compiled terrain is locked to ${compiled.geometryHash}, package is ${pkg.contentHash}`);

const dir = join(outRoot, courseId);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'terrain'), { recursive: true });
const publicUrl = (name: string) => `/course-geometry/${courseId}/${name}`;

const packageName = `package-${short(pkg.contentHash)}.json`;
writeFileSync(join(dir, packageName), packageBytes);

let contextLayerUrl: string | undefined;
try {
  const contextBytes = readFileSync(join(fixtures, `${course}-context.json`));
  parseContextLayer(JSON.parse(contextBytes.toString('utf8')), pkg); // refuses a layer for another package
  const contextName = `context-${short(sha256(contextBytes))}.json`;
  writeFileSync(join(dir, contextName), contextBytes);
  contextLayerUrl = publicUrl(contextName);
} catch (error) { console.warn(`No context layer published: ${error instanceof Error ? error.message : String(error)}`); }

const terrainByHole: Record<string, string> = {};
let terrainBytesTotal = 0;
for (const hole of [...pkg.holes].sort((a, b) => a.ordinal - b.ordinal)) {
  const entry = compiled.holes[hole.key];
  if (!entry) { console.warn(`${hole.key}: no compiled terrain (draws in 2D)`); continue; }
  const bytes = readFileSync(join(fixtures, `compiled-${course}`, entry.fileName.replace(/\.gz$/, '')));
  if (bytes.length !== entry.uncompressedBytes || sha256(bytes) !== entry.uncompressedSha256) throw new Error(`${hole.key}: terrain bytes do not match the compiled manifest`);
  const mesh = parseTerrainMesh(JSON.parse(bytes.toString('utf8')), pkg); // refuses a mesh for another package hash
  if (mesh.contentHash !== entry.contentHash) throw new Error(`${hole.key}: terrain content hash drifted`);
  const name = `terrain/${hole.key}-${short(mesh.contentHash)}.json`;
  writeFileSync(join(dir, name), bytes);
  terrainByHole[hole.key] = publicUrl(name);
  terrainBytesTotal += bytes.length;
}

const manifest: EssentialCourseManifest = { courseId, geometryVersion: pkg.contentHash, packageUrl: publicUrl(packageName), terrainByHole, contextLayerUrl };
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${dir}: package ${short(pkg.contentHash)} (${pkg.status}), ${Object.keys(terrainByHole).length}/${pkg.holes.length} holes, ${(terrainBytesTotal / 1_048_576).toFixed(1)} MB terrain${contextLayerUrl ? ', context layer' : ''}`);
