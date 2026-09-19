#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 artifact precompile script (V2 plan §105–108, §113, §115;
 * Ruling R6; Task 10). For every hole of a compiled course fixture it builds
 * the canonical hole scene (with the context layer, so path hero regions are
 * included), compiles the V2 display world with `compileVisualArtifactV2`
 * (base LODs, hero patches, whole-hole field atlas — this call runs every
 * §113 gate itself and throws on the first failure), proves the compile is
 * deterministic (two runs, identical content hash), round-trips
 * serialize→parse byte-identically and re-asserts the parsed artifact against
 * the scene, then writes the serialized artifact to the real cache layout
 *   <out>/geometry/<site>/<packageHash>/visual-v2/<styleHash>/<hole>.visual.json
 * plus a course summary beside it:
 *   <out>/geometry/<site>/<packageHash>/visual-v2/<styleHash>/summary.json
 * Nothing canonical is read from or written to production; the fixture
 * packages are the inputs, and gzip bytes are measured here only for the
 * report (§106's `gzipBytesEstimate` stays null in the artifact itself).
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/compile-visual-artifacts-v2.mts \
 *     --course peek-n-peak-upper [--holes 7,9,11] [--out output/course-geometry/visual-v2]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { buildHoleScene } from '../../../src/lib/golf/course-geometry/build-scene';
import { compileVisualArtifactV2 } from '../../../src/lib/golf/course-geometry/compile-visual-artifact-v2';
import { parseContextLayer } from '../../../src/lib/golf/course-geometry/context-layer';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '../../../src/lib/golf/course-geometry/terrain';
import { assertVisualArtifactV2, parseVisualArtifactV2, serializeVisualArtifactV2, visualArtifactV2CachePath } from '../../../src/lib/golf/course-geometry/visual-artifact-v2';
import { MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION } from '../../../src/lib/golf/course-geometry/visual-style';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : fallback; };
const course = option('course', 'peek-n-peak-upper');
const out = option('out', 'output/course-geometry/visual-v2');
const only = option('holes', '').split(',').filter(Boolean).map(Number);
const fixtures = 'src/test/fixtures/course-geometry';
const pkg = parseGeometryPackage(JSON.parse(readFileSync(join(fixtures, `${course}.json`), 'utf8')));
const manifest = JSON.parse(readFileSync(join(fixtures, `compiled-${course}`, 'asset-manifest.json'), 'utf8')) as { holes: Record<string, { fileName: string; ordinal: number }> };
const contextFile = join(fixtures, `${course}-context.json`);
const context = existsSync(contextFile) ? parseContextLayer(JSON.parse(readFileSync(contextFile, 'utf8')), pkg) : undefined;
if (!context) console.warn(`${course}: no context layer fixture, so no path hero regions`);

const cacheDir = join(out, `geometry/${pkg.siteId}/${pkg.contentHash}/visual-v2/${MERIDIAN_STYLE_HASH}`);
mkdirSync(cacheDir, { recursive: true });

interface Row {
  hole: string; lod0: number; lod1: number; lod2: number; patches: number; green: number; bunker: number;
  lodsBytes: number; patchesBytes: number; atlasBytes: number; totalBytes: number; gzipBytes: number;
  atlas: string; spacingM: number; sdfLayers: number; gate: string; ms: number;
}
const rows: Row[] = [];
let failures = 0;

for (const [holeKey, entry] of Object.entries(manifest.holes).sort((a, b) => a[1].ordinal - b[1].ordinal)) {
  if (only.length && !only.includes(entry.ordinal)) continue;
  const hole = holeKey.replace(`${course}-`, '');
  try {
    const file = join(fixtures, `compiled-${course}`, entry.fileName);
    const raw = readFileSync(file);
    const mesh = parseTerrainMesh(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    const scene = buildHoleScene(pkg, holeKey, [], mesh, context);

    const began = performance.now();
    const artifact = compileVisualArtifactV2(scene, mesh); // Runs every §113 gate itself; throws on the first failure.
    const ms = performance.now() - began;

    const again = compileVisualArtifactV2(scene, mesh);
    if (again.contentHash !== artifact.contentHash) throw new Error(`${holeKey}: compile is not deterministic`);

    const text = serializeVisualArtifactV2(artifact);
    const parsed = parseVisualArtifactV2(text);
    if (serializeVisualArtifactV2(parsed) !== text) throw new Error(`${holeKey}: serialize(parse(x)) !== x`);
    assertVisualArtifactV2(parsed, scene, mesh);

    const path = join(out, visualArtifactV2CachePath(pkg.siteId, pkg.contentHash, MERIDIAN_STYLE_HASH, holeKey));
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
    const gzipBytes = gzipSync(text, { level: 9 }).length;

    const lodsBytes = (['lod0', 'lod1', 'lod2'] as const).reduce((sum, name) => {
      const m = artifact.meshes.base[name];
      return sum + m.positions.byteLength + m.indices.byteLength + m.triangleFeatures.byteLength + m.surfaceClass.byteLength;
    }, 0);
    const patchesBytes = artifact.meshes.heroPatches.reduce((sum, p) => sum + p.positions.byteLength + p.indices.byteLength + p.canonicalHeightReference.byteLength + p.visualOffsetMm.byteLength, 0);
    const atlasBytes = artifact.budget.textureBytesEstimate; // fieldAtlasBytes(wholeHole), already computed by the compiler.
    const { wholeHole } = artifact.fields;

    rows.push({
      hole, lod0: artifact.meshes.base.lod0.triangleCount, lod1: artifact.meshes.base.lod1.triangleCount, lod2: artifact.meshes.base.lod2.triangleCount,
      patches: artifact.meshes.heroPatches.length, green: artifact.meshes.heroPatches.filter(p => p.kind === 'green_complex').length, bunker: artifact.meshes.heroPatches.filter(p => p.kind === 'bunker').length,
      lodsBytes, patchesBytes, atlasBytes, totalBytes: artifact.budget.downloadBytes, gzipBytes,
      atlas: `${wholeHole.width}x${wholeHole.height}`, spacingM: (wholeHole.boundsM[2] - wholeHole.boundsM[0]) / wholeHole.width, sdfLayers: wholeHole.sdfLayers?.layerNames.length ?? 0,
      gate: 'pass', ms,
    });
  } catch (error) {
    failures++;
    rows.push({ hole, lod0: 0, lod1: 0, lod2: 0, patches: 0, green: 0, bunker: 0, lodsBytes: 0, patchesBytes: 0, atlasBytes: 0, totalBytes: 0, gzipBytes: 0, atlas: '·', spacingM: 0, sdfLayers: 0, gate: (error as Error).message, ms: 0 });
  }
}

writeFileSync(join(cacheDir, 'summary.json'), JSON.stringify({ course, packageHash: pkg.contentHash, styleHash: MERIDIAN_STYLE_HASH, styleVersion: MERIDIAN_STYLE_VERSION, compiledAt: new Date().toISOString(), holes: rows }, null, 2));
console.log(`style ${MERIDIAN_STYLE_HASH} · package ${pkg.contentHash.slice(0, 12)} · ${rows.length} holes → ${cacheDir}`);
console.table(rows.map(row => ({
  hole: row.hole, lod0: row.lod0, lod1: row.lod1, lod2: row.lod2, patches: row.patches, green: row.green, bunker: row.bunker,
  lodsKB: (row.lodsBytes / 1024).toFixed(0), patchesKB: (row.patchesBytes / 1024).toFixed(0), atlasKB: (row.atlasBytes / 1024).toFixed(0),
  totalKB: (row.totalBytes / 1024).toFixed(0), gzipKB: (row.gzipBytes / 1024).toFixed(0),
  atlas: row.atlas, spacingM: row.spacingM.toFixed(2), sdf: row.sdfLayers, gate: row.gate === 'pass' ? 'pass' : 'FAIL', ms: row.ms.toFixed(0),
})));
if (failures) { console.error(`${failures} hole(s) failed the V2 artifact gates`); process.exit(1); }
