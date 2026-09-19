#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian visual artifact compiler (§96–102). For every hole of a compiled
 * course fixture it builds the canonical hole scene, compiles the visual
 * artifact from package + terrain + frozen style, proves the compile is
 * deterministic (two runs, identical content hash), verifies the §6 hash
 * gate, and writes the artifact to the cache layout
 *   <out>/geometry/<site>/<packageHash>/visual/<styleHash>/<hole>.visual.json.gz
 * with an offline-pack manifest (§102) beside it. Nothing canonical is read
 * from or written to production; the fixture packages are the inputs.
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/compile-visual-artifacts.mts \
 *     --course peek-n-peak-upper [--holes 1,7,11] [--out output/course-geometry/visual]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { buildHoleScene } from '../../../src/lib/golf/course-geometry/build-scene';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '../../../src/lib/golf/course-geometry/terrain';
import {
  assertVisualArtifact, compileVisualArtifact, offlinePackManifest, parseVisualArtifact, serializeVisualArtifact, visualArtifactCachePath,
} from '../../../src/lib/golf/course-geometry/visual-artifact';
import { MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION } from '../../../src/lib/golf/course-geometry/visual-style';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : fallback; };
const course = option('course', 'peek-n-peak-upper');
const out = option('out', 'output/course-geometry/visual');
const only = option('holes', '').split(',').filter(Boolean).map(Number);
const fixtures = 'src/test/fixtures/course-geometry';
const pkg = parseGeometryPackage(JSON.parse(readFileSync(join(fixtures, `${course}.json`), 'utf8')));
const manifest = JSON.parse(readFileSync(join(fixtures, `compiled-${course}`, 'asset-manifest.json'), 'utf8')) as { holes: Record<string, { fileName: string; ordinal: number }> };
const rows: { hole: string; vertices: number; contentHash: string; bytes: number; gzipBytes: number; ms: number }[] = [];
const packHoles: { physicalHoleKey: string; terrainHash: string; visualContentHash: string }[] = [];
for (const [holeKey, entry] of Object.entries(manifest.holes).sort((a, b) => a[1].ordinal - b[1].ordinal)) {
  if (only.length && !only.includes(entry.ordinal)) continue;
  const file = join(fixtures, `compiled-${course}`, entry.fileName);
  const raw = readFileSync(file);
  const mesh = parseTerrainMesh(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const scene = buildHoleScene(pkg, holeKey, [], mesh);
  const began = performance.now();
  const artifact = compileVisualArtifact(scene, mesh);
  const ms = performance.now() - began;
  const again = compileVisualArtifact(scene, mesh);
  if (again.contentHash !== artifact.contentHash) throw new Error(`${holeKey}: compile is not deterministic`);
  assertVisualArtifact(artifact, scene, mesh);
  const text = serializeVisualArtifact(artifact);
  const parsed = parseVisualArtifact(text);
  assertVisualArtifact(parsed, scene, mesh);
  const path = join(out, `${visualArtifactCachePath(pkg.siteId, pkg.contentHash, MERIDIAN_STYLE_HASH, holeKey)}.gz`);
  mkdirSync(join(path, '..'), { recursive: true });
  const gz = gzipSync(text, { level: 9 });
  writeFileSync(path, gz);
  rows.push({ hole: holeKey, vertices: artifact.vertexCount, contentHash: artifact.contentHash, bytes: text.length, gzipBytes: gz.length, ms });
  packHoles.push({ physicalHoleKey: holeKey, terrainHash: mesh.contentHash, visualContentHash: artifact.contentHash });
}
const packPath = join(out, `geometry/${pkg.siteId}/${pkg.contentHash}/visual/${MERIDIAN_STYLE_HASH}/pack-manifest.json`);
const pack = { ...offlinePackManifest(pkg.siteId, pkg.contentHash, packHoles), styleVersion: MERIDIAN_STYLE_VERSION, compiledAt: new Date().toISOString(),
  holes: rows };
if (!existsSync(join(packPath, '..'))) mkdirSync(join(packPath, '..'), { recursive: true });
writeFileSync(packPath, JSON.stringify(pack, null, 2));
console.log(`style ${MERIDIAN_STYLE_HASH} · package ${pkg.contentHash.slice(0, 12)} · ${rows.length} holes → ${packPath}`);
console.table(rows.map(row => ({ hole: row.hole, vertices: row.vertices, hash: row.contentHash, kB: (row.bytes / 1024).toFixed(0), gzipKB: (row.gzipBytes / 1024).toFixed(0), ms: row.ms.toFixed(0) })));
