#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 base display LOD compiler (V2 plan §10, §13–15, §113; Task 5).
 * For every hole of a compiled course fixture it derives LOD0/1/2 from the
 * canonical terrain mesh and its metric grid, proves the compile is
 * deterministic (two runs, identical buffers), enforces the topology and
 * Hausdorff gates, and writes one JSON report per hole plus a course summary:
 *   <out>/<course>/<hole>.display-lods.json   (report only, no buffers)
 *   <out>/<course>/summary.json
 * Nothing canonical is read from or written to production; the fixture
 * packages are the inputs. Task 10 packs the buffers into the V2 artifact.
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/compile-display-lods.mts \
 *     --course peek-n-peak-upper [--holes 7,9,11] [--out output/course-geometry/display-lods]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { assertBaseDisplayLods, compileBaseDisplayLods } from '../../../src/lib/golf/course-geometry/display-mesh-v2';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '../../../src/lib/golf/course-geometry/terrain';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : fallback; };
const course = option('course', 'peek-n-peak-upper');
const out = join(option('out', 'output/course-geometry/display-lods'), course);
const only = option('holes', '').split(',').filter(Boolean).map(Number);
const fixtures = 'src/test/fixtures/course-geometry';
const pkg = parseGeometryPackage(JSON.parse(readFileSync(join(fixtures, `${course}.json`), 'utf8')));
const manifest = JSON.parse(readFileSync(join(fixtures, `compiled-${course}`, 'asset-manifest.json'), 'utf8')) as { holes: Record<string, { fileName: string; ordinal: number }> };
mkdirSync(out, { recursive: true });
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
const rows: Record<string, string | number | boolean>[] = [];
let failures = 0;
for (const [holeKey, entry] of Object.entries(manifest.holes).sort((a, b) => a[1].ordinal - b[1].ordinal)) {
  if (only.length && !only.includes(entry.ordinal)) continue;
  const file = join(fixtures, `compiled-${course}`, entry.fileName);
  const raw = readFileSync(file);
  const mesh = parseTerrainMesh(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const began = performance.now();
  const result = compileBaseDisplayLods(mesh);
  const ms = performance.now() - began;
  const again = compileBaseDisplayLods(mesh);
  for (const lod of ['lod0', 'lod1', 'lod2'] as const) {
    if (!same(result[lod].positions, again[lod].positions) || !same(result[lod].indices, again[lod].indices)) throw new Error(`${holeKey}: ${lod} compile is not deterministic`);
  }
  let gate = 'pass';
  try { assertBaseDisplayLods(result); } catch (error) { gate = (error as Error).message; failures++; }
  const { report } = result;
  writeFileSync(join(out, `${holeKey}.display-lods.json`), JSON.stringify({ physicalHoleKey: holeKey, terrainHash: mesh.contentHash, canonicalTriangles: mesh.triangleFeatures.length, ms, gate, report }, null, 2));
  const worst = Math.max(...report.hausdorff.flatMap(h => [h.distancesM.lod0, h.distancesM.lod1, h.distancesM.lod2]));
  rows.push({
    hole: holeKey.replace(`${course}-`, ''), canonical: mesh.triangleFeatures.length, lod0: report.lods.lod0.triangles, lod1: report.lods.lod1.triangles, lod2: report.lods.lod2.triangles,
    budgets: ['lod0', 'lod1', 'lod2'].map(lod => (report.lods[lod as 'lod0'].withinBudget ? '✓' : '·')).join(''),
    slivers: report.weld.sliverTriangles, needles: report.weld.needles, lod2ErrM: report.lods.lod2.maxHeightErrorM.toFixed(3), hausdorffM: worst.toFixed(3), gate: gate === 'pass' ? 'pass' : 'FAIL', ms: ms.toFixed(0),
  });
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({ course, packageHash: pkg.contentHash, compiledAt: new Date().toISOString(), holes: rows }, null, 2));
console.log(`package ${pkg.contentHash.slice(0, 12)} · ${rows.length} holes → ${out} (budgets column: lod0 lod1 lod2, · = outside the §10 starting budget)`);
console.table(rows);
if (failures) { console.error(`${failures} hole(s) failed the display LOD gates`); process.exit(1); }
