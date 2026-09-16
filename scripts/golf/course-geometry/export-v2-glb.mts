#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 display geometry -> GLB export (V2 plan §100-102, §106-108;
 * Task 17 GLB pipeline infra). For every hole of a compiled course fixture
 * it plans hero regions, derives base display LOD0/1/2 and compiles the
 * green-complex/bunker hero patches exactly like compile-display-lods.mts,
 * then writes one GLB per hole so the computed V2 display geometry can be
 * opened in a real glTF viewer (Blender) for human QA — the pipeline's own
 * tools (gltf-transform, gltfpack, toktx, glTF Validator) are not installed
 * in this environment (pre-flight scan row 17 / Ruling R8), so a viewer is
 * the only inspection available.
 *
 * NOTE ON SCOPE: this is not the "structure GLB pipeline" of the plan's own
 * Task 17 checklist (line 2678: Blender convention doc, GLB optimization/
 * KTX2/glTF-Validator commands, a triangle/material/texture report, a
 * loader placing AUTHORED building GLBs at world scale keyed by context
 * structure id — see Ruling R8 and visual-artifact-v2.ts's
 * `PackedStaticObjectSet` comment). That pipeline is unbuilt; this script
 * only exports the geometry Tasks 5-8 already compute, as a QA aid.
 *
 * Each GLB contains, as separate glTF meshes/nodes:
 *   <hole>-lod0 / -lod1 / -lod2  base display LODs; each hero region's
 *                                triangle run is its own glTF primitive of
 *                                the same mesh (glb-writer.ts), sharing one
 *                                `_SURFACE_CLASS` attribute (Uint8 per
 *                                vertex, an index into SURFACE_CLASS_IDS,
 *                                visual-artifact.ts)
 *   <hole>-hero-<patchId>        each green-complex/bunker hero patch, with
 *                                `_VISUAL_OFFSET_MM` (Int16, render-only mm
 *                                offset) and `_CANONICAL_HEIGHT_REF_M`
 *                                (Float32, the S0 height it sits over)
 * Positions are this project's native Z-up metres, unchanged; every node
 * carries glb-writer.ts's fixed -90°-about-X rotation so the file opens
 * upright in a Y-up viewer. `asset.extras` carries the package/terrain/
 * context hashes and source provenance (constraint 16) — never a
 * timestamp, so two exports of the same input are byte-identical.
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/export-v2-glb.mts \
 *     --course peek-n-peak-upper [--holes 7,9] [--out output/course-geometry/glb]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { buildHoleScene } from '../../../src/lib/golf/course-geometry/build-scene';
import { compileHeroPatches } from '../../../src/lib/golf/course-geometry/bunker-display-mesh';
import { parseContextLayer } from '../../../src/lib/golf/course-geometry/context-layer';
import { compileBaseDisplayLods, weldAndCleanTerrainMesh, type DisplayLodName } from '../../../src/lib/golf/course-geometry/display-mesh-v2';
import { type GlbDocument, type GlbMesh, type GlbPrimitiveGroup, writeGlb } from '../../../src/lib/golf/course-geometry/glb-writer';
import { compileHeroRegions } from '../../../src/lib/golf/course-geometry/hero-patches';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '../../../src/lib/golf/course-geometry/terrain';
import { MERIDIAN_VISUAL_COMPILER_V2_VERSION, type PackedDisplayMesh, type PackedHeroPatch } from '../../../src/lib/golf/course-geometry/visual-artifact-v2';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : fallback; };
const course = option('course', 'peek-n-peak-upper');
const out = join(option('out', 'output/course-geometry/glb'), course);
const only = option('holes', '').split(',').filter(Boolean).map(Number);
const fixtures = 'src/test/fixtures/course-geometry';
const pkg = parseGeometryPackage(JSON.parse(readFileSync(join(fixtures, `${course}.json`), 'utf8')));
const manifest = JSON.parse(readFileSync(join(fixtures, `compiled-${course}`, 'asset-manifest.json'), 'utf8')) as { holes: Record<string, { fileName: string; ordinal: number }> };
const contextFile = join(fixtures, `${course}-context.json`);
const context = existsSync(contextFile) ? parseContextLayer(JSON.parse(readFileSync(contextFile, 'utf8')), pkg) : undefined;
if (!context) console.warn(`${course}: no context layer fixture, so no path regions`);
mkdirSync(out, { recursive: true });

/** One glTF primitive per hero range plus the leading base run.
 * `heroRanges` counts triangles (display-mesh-v2.ts); glTF primitive groups
 * count indices (glb-writer.ts), hence the *3. */
function lodPrimitiveGroups(mesh: PackedDisplayMesh): GlbPrimitiveGroup[] {
  const ranges = mesh.heroRanges;
  if (!ranges?.length) return [{ name: 'base', start: 0, count: mesh.indices.length }];
  const groups: GlbPrimitiveGroup[] = [{ name: 'base', start: 0, count: ranges[0]!.start * 3 }];
  for (const r of ranges) groups.push({ name: r.id, start: r.start * 3, count: r.count * 3 });
  return groups;
}
function lodMesh(name: string, mesh: PackedDisplayMesh): GlbMesh {
  return {
    name, positions: mesh.positions, indices: mesh.indices,
    attributes: [{ name: '_SURFACE_CLASS', array: mesh.surfaceClass, components: 1 }],
    primitiveGroups: lodPrimitiveGroups(mesh),
  };
}
function heroMesh(name: string, patch: PackedHeroPatch): GlbMesh {
  return {
    name, positions: patch.positions, indices: patch.indices,
    attributes: [
      { name: '_VISUAL_OFFSET_MM', array: patch.visualOffsetMm, components: 1 },
      { name: '_CANONICAL_HEIGHT_REF_M', array: patch.canonicalHeightReference, components: 1 },
    ],
  };
}

const LOD_NAMES: readonly DisplayLodName[] = ['lod0', 'lod1', 'lod2'];
const rows: Record<string, string | number>[] = [];
for (const [holeKey, entry] of Object.entries(manifest.holes).sort((a, b) => a[1].ordinal - b[1].ordinal)) {
  if (only.length && !only.includes(entry.ordinal)) continue;
  const file = join(fixtures, `compiled-${course}`, entry.fileName);
  const raw = readFileSync(file);
  const mesh = parseTerrainMesh(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const scene = buildHoleScene(pkg, holeKey, [], mesh, context);
  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base);
  const heroPlan = { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds };
  const lods = compileBaseDisplayLods(mesh, { heroPlan });
  const patches = compileHeroPatches(scene, mesh, base, plan);

  const document: GlbDocument = {
    meshes: [
      ...LOD_NAMES.map(lod => lodMesh(`${holeKey}-${lod}`, lods[lod])),
      ...patches.map(c => heroMesh(`${holeKey}-hero-${c.patch.id}`, c.patch)),
    ],
    extras: {
      compilerVersion: MERIDIAN_VISUAL_COMPILER_V2_VERSION,
      physicalHoleKey: holeKey,
      packageHash: pkg.contentHash,
      terrainHash: mesh.contentHash,
      contextLayerHash: scene.contextLayerHash ?? null,
      sourceProvenance: '2 m grid resampled from 1 m USGS 3DEP',
      highResolutionTerrainSources: [],
      upAxisConversion: 'node rotation -90deg about X (Z-up source, glTF Y-up)',
      basisByMesh: Object.fromEntries([
        ...LOD_NAMES.map(lod => [`${holeKey}-${lod}`, lods[lod].basis]),
        ...patches.map(c => [`${holeKey}-hero-${c.patch.id}`, c.patch.basis]),
      ]),
    },
  };
  const glb = writeGlb(document);
  const again = writeGlb(document);
  if (Buffer.compare(Buffer.from(glb), Buffer.from(again)) !== 0) throw new Error(`${holeKey}: GLB export is not deterministic`);
  writeFileSync(join(out, `${holeKey}.glb`), glb);
  rows.push({
    hole: holeKey.replace(`${course}-`, ''), meshes: document.meshes.length,
    lod0: lods.lod0.triangleCount, lod1: lods.lod1.triangleCount, lod2: lods.lod2.triangleCount,
    heroPatches: patches.length, bytes: glb.byteLength, kB: (glb.byteLength / 1024).toFixed(1),
  });
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({ course, packageHash: pkg.contentHash, compilerVersion: MERIDIAN_VISUAL_COMPILER_V2_VERSION, compiledAt: new Date().toISOString(), holes: rows }, null, 2));
console.log(`package ${pkg.contentHash.slice(0, 12)} · ${rows.length} holes -> ${out} (meshes: lod0/lod1/lod2 + heroPatches; bytes/kB per hole GLB; each export checked deterministic against itself)`);
console.table(rows);
