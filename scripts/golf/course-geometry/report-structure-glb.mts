#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 structure GLB report (V2 plan §56-58, §100-103; Ruling R8;
 * Task 17). Scans a folder of authored structure GLBs — empty today, since
 * no Peek'n Peak building has been modeled in Blender yet — and prints, per
 * file: triangle/material/texture counts against §57/§58's budgets, whether
 * KTX2/Basis compression is in use (§101-102), and any convention violation
 * from structure-glb.ts's validator (docs/golf/course-geometry/
 * structure-glb-convention.md is the convention this operationalizes).
 *
 * It also probes PATH for the optional external CLI tools §101's pipeline
 * names — gltf-transform, gltfpack, toktx, gltf-validator — and reports
 * each one honestly rather than assuming (Ruling R8: none of them is
 * installed in this environment; the script must say so, never claim
 * otherwise, and it never attempts to run them).
 *
 * With --context and --package it also flags a footprint that disagrees
 * with the context zone a file is keyed to (each scanned file's basename,
 * sans `.glb`, is looked up as a zone id — the naming convention). Without
 * them that one check is skipped and the report says why.
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/report-structure-glb.mts \
 *     [--dir <folder-of-glbs>] \
 *     [--context <context-layer.json> --package <geometry-package.json>]
 *
 * Exit code 0 when every scanned file has no error-level violation (or none
 * were found — an empty folder is the expected state, not a failure); 1
 * when at least one file fails.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseContextLayer } from '../../../src/lib/golf/course-geometry/context-layer';
import { projectToLocal } from '../../../src/lib/golf/course-geometry/project';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { ringArea } from '../../../src/lib/golf/course-geometry/spatial';
import { inspectStructureGlb, validateStructureGlbGeometry } from '../../../src/lib/golf/course-geometry/structure-glb';

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dir = option('dir') ?? 'src/test/fixtures/course-geometry/structures';

const EXTERNAL_TOOLS = ['gltf-transform', 'gltfpack', 'toktx', 'gltf-validator'];
function detectTool(tool: string): string {
  try { return execFileSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim() || 'not found on PATH'; }
  catch { return 'not found on PATH'; }
}
console.log("§101 optional tool detection (Ruling R8 — reported honestly, never assumed; none of these is run by this script):");
for (const tool of EXTERNAL_TOOLS) console.log(`  ${tool.padEnd(16)} ${detectTool(tool)}`);
console.log('');

let zoneAreaById: Map<string, number> | undefined;
const contextPath = option('context'), packagePath = option('package');
if (contextPath && packagePath) {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(packagePath, 'utf8')));
  const layer = parseContextLayer(JSON.parse(readFileSync(contextPath, 'utf8')), pkg);
  zoneAreaById = new Map();
  for (const zone of layer.zones) {
    const geometry = zone.geometryWgs84;
    const outerWgs84 = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : undefined;
    if (!outerWgs84) continue; // LineString zones (paths, fences, …) are not structures.
    zoneAreaById.set(zone.id, ringArea(outerWgs84.map(p => projectToLocal(p, pkg.originWgs84))));
  }
  console.log(`Loaded ${layer.zones.length} context zone(s) from ${contextPath} for the footprint-vs-zone check.\n`);
} else {
  console.log('No --context/--package given: the footprint-vs-zone check is skipped for every file below.\n');
}

if (!existsSync(dir)) { console.log(`${dir}: folder does not exist yet (expected until Blender assets are authored) — 0 GLBs.`); process.exit(0); }
const files = readdirSync(dir).filter(name => name.toLowerCase().endsWith('.glb'));
if (!files.length) { console.log(`${dir}: 0 GLBs found (expected until Blender assets are authored).`); process.exit(0); }

console.log(`${files.length} structure GLB(s) in ${dir}:`);
let failing = 0;
for (const fileName of files) {
  const entry = inspectStructureGlb(fileName, readFileSync(join(dir, fileName)));
  const zoneAreaM2 = zoneAreaById?.get(entry.structureId);
  const validation = zoneAreaM2 != null ? validateStructureGlbGeometry(entry.geometry, { zoneFootprintAreaM2: zoneAreaM2 }) : entry.validation;
  const g = entry.geometry;
  console.log(`\n${fileName}  (structureId ${entry.structureId}, contentHash ${entry.contentHash})`);
  console.log(`  triangles ${g.triangleCount}  materials ${g.materialsUsed}/${g.materialsDeclared} used/declared  textures ${g.texturesUsed}/${g.texturesDeclared}` +
    `  ktx2 ${g.usesKtx2 ? 'yes' : 'no'}  geometry-compression ${g.usesGeometryCompression ? 'yes' : 'no'}`);
  console.log(`  footprint ${validation.footprintM[0].toFixed(2)}×${validation.footprintM[1].toFixed(2)} m (${validation.footprintAreaM2.toFixed(1)} m²)` +
    `  height ${validation.heightM.toFixed(2)} m  origin offset ${validation.groundOffsetM.toFixed(3)} m` +
    (zoneAreaM2 != null ? `  zone ${zoneAreaM2.toFixed(1)} m²` : '  zone n/a (--context/--package not given)'));
  if (!validation.violations.length) console.log('  PASS — no convention violations');
  else for (const v of validation.violations) console.log(`  ${v.severity.toUpperCase().padEnd(5)} ${v.rule}: ${v.detail}`);
  if (!validation.ok) failing++;
}
console.log(`\n${files.length - failing}/${files.length} file(s) pass (no error-level violation).`);
if (failing) process.exit(1);
