#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 base display LOD compiler (V2 plan §10, §13–15, §113; Tasks
 * 5–6). For every hole of a compiled course fixture it plans the hero
 * regions over the cleaned canonical mesh (green complex, bunkers, water
 * edges, cart paths from the context layer), derives LOD0/1/2 with those
 * regions locked and ordered last, proves both compiles are deterministic
 * (two runs, identical output), enforces the region, topology and Hausdorff
 * gates, and writes one JSON report per hole plus a course summary:
 *   <out>/<course>/<hole>.display-lods.json   (report only, no buffers)
 *   <out>/<course>/summary.json
 * Nothing canonical is read from or written to production; the fixture
 * packages are the inputs. Task 10 packs the buffers into the V2 artifact.
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/compile-display-lods.mts \
 *     --course peek-n-peak-upper [--holes 7,9,11] [--out output/course-geometry/display-lods]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { buildHoleScene } from '../../../src/lib/golf/course-geometry/build-scene';
import { parseContextLayer } from '../../../src/lib/golf/course-geometry/context-layer';
import { assertBaseDisplayLods, compileBaseDisplayLods, weldAndCleanTerrainMesh } from '../../../src/lib/golf/course-geometry/display-mesh-v2';
import { assertHeroRegionPlan, compileHeroRegions } from '../../../src/lib/golf/course-geometry/hero-patches';
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
const contextFile = join(fixtures, `${course}-context.json`);
const context = existsSync(contextFile) ? parseContextLayer(JSON.parse(readFileSync(contextFile, 'utf8')), pkg) : undefined;
if (!context) console.warn(`${course}: no context layer fixture, so no path regions`);
mkdirSync(out, { recursive: true });
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
const rows: Record<string, string | number | boolean>[] = [];
let failures = 0;
for (const [holeKey, entry] of Object.entries(manifest.holes).sort((a, b) => a[1].ordinal - b[1].ordinal)) {
  if (only.length && !only.includes(entry.ordinal)) continue;
  const file = join(fixtures, `compiled-${course}`, entry.fileName);
  const raw = readFileSync(file);
  const mesh = parseTerrainMesh(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const scene = buildHoleScene(pkg, holeKey, [], mesh, context);
  const began = performance.now();
  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base);
  const planMs = performance.now() - began;
  const planAgain = compileHeroRegions(scene, mesh, base);
  if (planAgain.regionIds.join('\n') !== plan.regionIds.join('\n') || !same(planAgain.triangleRegion, plan.triangleRegion)) throw new Error(`${holeKey}: hero plan is not deterministic`);
  const heroPlan = { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds };
  const result = compileBaseDisplayLods(mesh, { heroPlan });
  const ms = performance.now() - began;
  const again = compileBaseDisplayLods(mesh, { heroPlan });
  for (const lod of ['lod0', 'lod1', 'lod2'] as const) {
    if (!same(result[lod].positions, again[lod].positions) || !same(result[lod].indices, again[lod].indices)) throw new Error(`${holeKey}: ${lod} compile is not deterministic`);
  }
  let gate = 'pass';
  try { assertHeroRegionPlan(plan, base); assertBaseDisplayLods(result); } catch (error) { gate = (error as Error).message; failures++; }
  const { report } = result;
  const regions = plan.regions.map(r => ({ id: r.id, kind: r.kind, featureIds: r.featureIds, triangles: r.triangles.length, rimLoops: r.rimLoops.length, rimEdges: r.rimEdges, areaM2: r.areaM2, budgetTriangles: r.budgetTriangles, boundsM: r.boundsM }));
  writeFileSync(join(out, `${holeKey}.display-lods.json`), JSON.stringify({ physicalHoleKey: holeKey, terrainHash: mesh.contentHash, contextLayerHash: scene.contextLayerHash ?? null, canonicalTriangles: mesh.triangleFeatures.length, ms, planMs, gate, heroRegions: regions, report }, null, 2));
  const worst = Math.max(...report.hausdorff.flatMap(h => [h.distancesM.lod0, h.distancesM.lod1, h.distancesM.lod2]));
  const kinds = { green_complex: 0, bunker: 0, water_edge: 0, path: 0 } as Record<string, number>;
  for (const r of plan.regions) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  rows.push({
    hole: holeKey.replace(`${course}-`, ''), canonical: mesh.triangleFeatures.length, lod0: report.lods.lod0.triangles, lod1: report.lods.lod1.triangles, lod2: report.lods.lod2.triangles,
    budgets: ['lod0', 'lod1', 'lod2'].map(lod => (report.lods[lod as 'lod0'].withinBudget ? '✓' : '·')).join(''),
    heroes: `g${kinds.green_complex}/b${kinds.bunker}/w${kinds.water_edge}/p${kinds.path}`, heroTris: plan.regions.reduce((sum, r) => sum + r.triangles.length, 0), heroBudget: plan.regions.reduce((sum, r) => sum + r.budgetTriangles, 0),
    slivers: report.weld.sliverTriangles, needles: report.weld.needles, lod2ErrM: report.lods.lod2.maxHeightErrorM.toFixed(3), hausdorffM: worst.toFixed(3), gate: gate === 'pass' ? 'pass' : 'FAIL', ms: ms.toFixed(0),
  });
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({ course, packageHash: pkg.contentHash, compiledAt: new Date().toISOString(), holes: rows }, null, 2));
console.log(`package ${pkg.contentHash.slice(0, 12)} · ${rows.length} holes → ${out} (budgets: lod0 lod1 lod2, · = outside the §10 starting budget; heroes: green/bunker/water/path regions)`);
console.table(rows);
if (failures) { console.error(`${failures} hole(s) failed the display LOD gates`); process.exit(1); }
