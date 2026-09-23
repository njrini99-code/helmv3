/**
 * Copy a compiled course into a static course-geometry folder in the shape
 * One-Tap's offline preflight reads (`EssentialCourseManifest`,
 * `src/lib/golf/one-tap/course-assets.ts`): the approved package, the optional
 * context layer and one terrain file per hole, every asset under a name that
 * carries its own content hash so a cached body is only ever served for the
 * hash it was published under. Bytes are copied verbatim from the compiled
 * source (byte-identical files share one git blob), and every hash is
 * re-verified before anything is written. Writing `--out public/course-geometry`
 * (the default) is a source change like any other — it reaches players only
 * through a normal deploy; a different `--out` is a local staging folder for
 * a later Storage upload (D2) and touches nothing the app serves.
 *
 * Reads either the checked-in Peek fixtures (default, unchanged) or a
 * course-factory output layout directory (`--from`, Phase 3): its promoted
 * `package/normalized.json` if the layout has one, else its
 * `candidates/normalized.json`; `compiled/` or `compiled-base/` for terrain;
 * `context/*-context.json` for the optional context layer. `--package`,
 * `--compiled` and `--context` override any of those three paths directly,
 * for a layout whose factory output does not follow the usual shape.
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.json scripts/golf/course-geometry/publish-course-assets.mts \
 *     --course=peek-n-peak-upper [--out=public/course-geometry] [--base-url=/course-geometry]
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.json scripts/golf/course-geometry/publish-course-assets.mts \
 *     --course=starmount-forest --from=output/course-geometry/factory/layouts/starmount-forest \
 *     --out=/tmp/staging/starmount-forest
 *
 * Prints one JSON summary line to stdout (package byte SHA-256,
 * `geometryVersion`, hole/terrain counts, output dir); progress notes go to
 * stderr, so `--course=... | jq` gets exactly the summary.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseContextLayer } from '@/lib/golf/course-geometry/context-layer';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { EssentialCourseManifest } from '@/lib/golf/one-tap/course-assets';
import { loadCourseCatalog } from '@/lib/golf/course-geometry/load-catalog';
import { policyForLayout } from '@/lib/golf/course-geometry/course-policy';
import { COURSE_GEOMETRY_REGISTRY } from '@/lib/golf/course-geometry/course-registry';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; }));
const course = args.course ? String(args.course) : (() => { throw new Error('publish-course-assets: --course is required (e.g. --course=peek-n-peak-upper)'); })();
// The already-approved policy for this layout, if any (unapproved factory
// output has none yet — that is expected, not an error).
const registryPolicy = policyForLayout(course, COURSE_GEOMETRY_REGISTRY);
const outRoot = String(args.out ?? 'public/course-geometry');
// A Storage-hosted layout's own approved base URL wins so its manifest
// points where its bytes actually get uploaded (D2); Peek has none, so its
// default stays `/course-geometry` byte-for-byte.
const baseUrl = String(args['base-url'] ?? registryPolicy?.assetBaseUrl ?? '/course-geometry');
const fixtures = 'src/test/fixtures/course-geometry';
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const short = (hash: string) => hash.slice(0, 12);
const firstExisting = (paths: string[]): string | null => paths.find(existsSync) ?? null;
const note = (message: string) => console.error(message);

// ---------------------------------------------------------------------
// Resolve the three source inputs: the package, the compiled terrain
// directory (with its own asset-manifest.json), and the optional context
// layer. `--package`/`--compiled`/`--context` win outright; otherwise
// `--from <factory layout dir>` is searched in promotion order; with
// neither, the checked-in fixtures (Peek's original, unchanged shape).
const from = args.from ? String(args.from) : null;
const packagePath = args.package ? String(args.package)
  : from ? firstExisting([join(from, 'package', 'normalized.json'), join(from, 'candidates', 'normalized.json')])
    ?? (() => { throw new Error(`publish-course-assets: no package found under ${from} (looked for package/normalized.json, candidates/normalized.json)`); })()
  : join(fixtures, `${course}.json`);
const compiledDir = args.compiled ? String(args.compiled)
  : from ? firstExisting([join(from, 'compiled'), join(from, 'compiled-base')])
    ?? (() => { throw new Error(`publish-course-assets: no compiled terrain dir found under ${from} (looked for compiled/, compiled-base/)`); })()
  : join(fixtures, `compiled-${course}`);
const contextPath = args.context ? String(args.context)
  : from ? firstExisting([join(from, 'context', `${course}-context.json`)])
  : join(fixtures, `${course}-context.json`);

const packageBytes = readFileSync(packagePath);
const pkg = parseGeometryPackage(JSON.parse(packageBytes.toString('utf8')));
// The publisher's own courseId is the CLI's `--course`, the directory name
// this writes to and the layout id every downstream consumer keys assets by
// — not derived from the registry, since most factory-output layouts are not
// approved (registered) yet. Verified instead against the catalog when this
// layout is catalogued (every layout this repo's factory has touched should
// be); an uncatalogued course is not blocked, only unverified.
const courseId = course;
const catalogLayout = loadCourseCatalog().layouts.find(l => l.layoutId === courseId);
if (catalogLayout && !catalogLayout.siteIds.includes(pkg.siteId)) {
  throw new Error(`Package site ${pkg.siteId} is not one of ${courseId}'s catalogued sites (${catalogLayout.siteIds.join(', ')})`);
}
if (!catalogLayout) note(`${courseId}: not catalogued — skipping the site-id cross-check (course-geometry/catalog/layouts/${courseId}.json is missing)`);

const packageByteSha256 = sha256(packageBytes);
const existingApproval = registryPolicy?.approvedPackageByteHashes?.[pkg.contentHash];
if (existingApproval && existingApproval !== packageByteSha256) {
  throw new Error(`${courseId}: registry already approves package ${pkg.contentHash} at byte hash ${existingApproval}, this file hashes to ${packageByteSha256} — republish under a new content hash instead of silently replacing an approved one`);
}

type ManifestEntry = { fileName: string; uncompressedBytes: number; uncompressedSha256: string; contentHash: string };
const compiled = JSON.parse(readFileSync(join(compiledDir, 'asset-manifest.json'), 'utf8')) as { geometryHash: string; holes: Record<string, ManifestEntry> };
if (compiled.geometryHash !== pkg.contentHash) throw new Error(`Compiled terrain is locked to ${compiled.geometryHash}, package is ${pkg.contentHash}`);

const dir = join(outRoot, courseId);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'terrain'), { recursive: true });
const publicUrl = (name: string) => `${baseUrl}/${courseId}/${name}`;

const packageName = `package-${short(pkg.contentHash)}.json`;
writeFileSync(join(dir, packageName), packageBytes);

let contextLayerUrl: string | undefined;
if (contextPath) {
  try {
    const contextBytes = readFileSync(contextPath);
    parseContextLayer(JSON.parse(contextBytes.toString('utf8')), pkg); // refuses a layer for another package
    const contextName = `context-${short(sha256(contextBytes))}.json`;
    writeFileSync(join(dir, contextName), contextBytes);
    contextLayerUrl = publicUrl(contextName);
  } catch (error) { note(`No context layer published: ${error instanceof Error ? error.message : String(error)}`); }
} else {
  note('No context layer published: no context path given or found');
}

const terrainByHole: Record<string, string> = {};
let terrainBytesTotal = 0;
for (const hole of [...pkg.holes].sort((a, b) => a.ordinal - b.ordinal)) {
  const entry = compiled.holes[hole.key];
  if (!entry) { note(`${hole.key}: no compiled terrain (draws in 2D)`); continue; }
  const bytes = readFileSync(join(compiledDir, entry.fileName.replace(/\.gz$/, '')));
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
note(`${dir}: package ${short(pkg.contentHash)} (${pkg.status}), ${Object.keys(terrainByHole).length}/${pkg.holes.length} holes, ${(terrainBytesTotal / 1_048_576).toFixed(1)} MB terrain${contextLayerUrl ? ', context layer' : ''}`);

console.log(JSON.stringify({
  courseId,
  geometryVersion: pkg.contentHash,
  packageByteSha256,
  status: pkg.status,
  holesPublished: Object.keys(terrainByHole).length,
  holesTotal: pkg.holes.length,
  terrainBytesTotal,
  hasContextLayer: Boolean(contextLayerUrl),
  outDir: dir,
  baseUrl,
}));
