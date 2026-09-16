import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compileHeroPatches } from '../bunker-display-mesh';
import { buildHoleScene } from '../build-scene';
import { parseContextLayer } from '../context-layer';
import { compileBaseDisplayLods, weldAndCleanTerrainMesh } from '../display-mesh-v2';
import { compileHeroRegions } from '../hero-patches';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh } from '../terrain';
import {
  closeFrameTriangles, type HoleDisplayLodsReport, type HoleHeroPatchSummary, type HoleHeroRegionSummary, V2_BUDGETS, validateHoleBudgets, type Violation,
} from '../v2-budgets';

const PASS_TOPOLOGY = { lod: 'lod0' as const, degenerate: 0, flipped: 0, nonFiniteNormals: 0, nonManifoldEdges: 0, pass: true };
const FAIL_TOPOLOGY = { ...PASS_TOPOLOGY, degenerate: 1, pass: false };

/** A hand-built report inside every §10/§11/§15/§113/§115 rule, so
 * `validateHoleBudgets` returns zero violations for it at either tier. */
function passingReport(): HoleDisplayLodsReport {
  const region: HoleHeroRegionSummary = { id: 'green_complex:g', kind: 'green_complex', triangles: 3_000, budgetTriangles: 14_000 };
  const patch: HoleHeroPatchSummary = { id: 'green_complex:g', triangles: 12_000, budgetTriangles: 14_000, seamHeightMaxM: 0, topology: PASS_TOPOLOGY };
  return {
    physicalHoleKey: 'peek-n-peak-upper-00', canonicalTriangles: 25_000, gate: 'pass',
    heroRegions: [region], heroPatches: [patch],
    report: {
      lods: { lod0: { triangles: 45_000, withinBudget: true, budget: [35_000, 60_000] }, lod1: { triangles: 28_000, withinBudget: true, budget: [25_000, 45_000] }, lod2: { triangles: 18_000, withinBudget: true, budget: [15_000, 25_000] } },
      hausdorff: [{ class: 'green', canonicalSegments: 10, toleranceM: 0.15, distancesM: { lod0: 0.01, lod1: 0.01, lod2: 0.01 }, pass: true }],
      topology: [PASS_TOPOLOGY, { ...PASS_TOPOLOGY, lod: 'lod1' }, { ...PASS_TOPOLOGY, lod: 'lod2' }],
      pass: true,
    },
  };
}
const byRule = (violations: Violation[], rule: string) => violations.find(v => v.rule === rule);

describe('V2_BUDGETS', () => {
  /** Every declared rule (an object carrying a fixed `severity`) names the
   * plan section it came from, so a reader never has to trust an unsourced number. */
  function collectRules(node: unknown, path: string, out: { path: string; section: unknown }[]): void {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.severity === 'warn' || record.severity === 'error') out.push({ path, section: record.section });
    for (const [key, value] of Object.entries(record)) collectRules(value, `${path}.${key}`, out);
  }
  it('cites a plan section for every fixed-severity rule, both tiers', () => {
    const rules: { path: string; section: unknown }[] = [];
    collectRules(V2_BUDGETS, 'V2_BUDGETS', rules);
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) expect(rule.section, rule.path).toMatch(/^§/);
  });
  it('cites a plan section for the dynamic-severity phone rules (draw calls, pixel budget)', () => {
    expect(V2_BUDGETS.phone.drawCalls?.section).toMatch(/^§/);
    expect(V2_BUDGETS.phone.pixelBudgetMP?.section).toMatch(/^§/);
  });
  it('omits phone-only runtime keys for desktop instead of inventing a number (plan states none for "high" tier)', () => {
    expect(V2_BUDGETS.desktop.drawCalls).toBeUndefined();
    expect(V2_BUDGETS.desktop.textureBytes).toBeUndefined();
    expect(V2_BUDGETS.desktop.pixelBudgetMP).toBeUndefined();
  });
  it('shares tier-independent geometry rules by reference (no duplicated numbers to drift)', () => {
    expect(V2_BUDGETS.desktop.lod).toBe(V2_BUDGETS.phone.lod);
    expect(V2_BUDGETS.desktop.closeFrameVisible).toBe(V2_BUDGETS.phone.closeFrameVisible);
    expect(V2_BUDGETS.desktop.seam).toBe(V2_BUDGETS.phone.seam);
  });
  it('matches the plan\'s literal §10/§11/§93/§115 numbers', () => {
    expect(V2_BUDGETS.phone.lod.lod0).toMatchObject({ min: 35_000, max: 60_000 });
    expect(V2_BUDGETS.phone.lod.lod1).toMatchObject({ min: 25_000, max: 45_000 });
    expect(V2_BUDGETS.phone.lod.lod2).toMatchObject({ min: 15_000, max: 25_000 });
    expect(V2_BUDGETS.phone.closeFrameVisible.max).toBe(90_000);
    expect(V2_BUDGETS.phone.closeFrameEnvelope.max).toBe(90_000);
    expect(V2_BUDGETS.phone.drawCalls).toMatchObject({ target: 160, hard: 180 });
    expect(V2_BUDGETS.phone.seam.visualM).toBe(0);
    expect(V2_BUDGETS.phone.greenComplexCap.max).toBe(20_000);
  });
});

describe('closeFrameTriangles', () => {
  it('replaces a patched region\'s placeholder with its real patch triangles', () => {
    const report = passingReport();
    const frame = closeFrameTriangles(report);
    // lod0 (45000) already contains the region's 3000 placeholder triangles;
    // the patch replaces them with 12000 real ones.
    expect(frame.visible).toBe(45_000 - 3_000 + 12_000);
    expect(frame.envelope).toBe(45_000 + 14_000);
  });
  it('carries an unpatched region\'s budget into both readings (no compiler yet for that kind)', () => {
    const report = passingReport();
    report.heroRegions.push({ id: 'water_edge:w', kind: 'water_edge', triangles: 200, budgetTriangles: 2_000 });
    const frame = closeFrameTriangles(report);
    expect(frame.visible).toBe(45_000 - 3_000 + 12_000 + 2_000);
    expect(frame.envelope).toBe(45_000 + 14_000 + 2_000);
  });
});

describe('validateHoleBudgets', () => {
  it('returns no violations for a report built inside every rule, at either tier', () => {
    expect(validateHoleBudgets(passingReport(), 'phone')).toEqual([]);
    expect(validateHoleBudgets(passingReport(), 'desktop')).toEqual([]);
  });

  it('flags the compiler\'s own gate verdict (§113) as an error', () => {
    const report = passingReport();
    report.gate = 'Hero patch green_complex:g failed: seam 0.1 m';
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'gate');
    expect(violation).toMatchObject({ severity: 'error', section: '§113', limit: 'pass' });
  });

  it('flags a failed §113 topology gate as an error', () => {
    const report = passingReport();
    report.report.topology[0] = FAIL_TOPOLOGY;
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'topology:lod0');
    expect(violation?.severity).toBe('error');
    expect(violation?.section).toBe('§113');
  });

  it('flags a failed §113 topology gate on a hero patch as an error', () => {
    const report = passingReport();
    report.heroPatches[0]!.topology = FAIL_TOPOLOGY;
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'patch-topology:green_complex:g');
    expect(violation?.severity).toBe('error');
  });

  it('recomputes §15 Hausdorff independently of the report\'s own `pass` bit', () => {
    const report = passingReport();
    // A stale/wrong `pass: true` must not hide a distance over the real §15 tolerance.
    report.report.hausdorff[0] = { class: 'green', canonicalSegments: 10, toleranceM: 0.15, distancesM: { lod0: 0.3, lod1: 0, lod2: 0 }, pass: true };
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'hausdorff:green');
    expect(violation).toMatchObject({ severity: 'error', section: '§15', limit: 0.15, value: 0.3 });
  });

  it('falls back to the "other" §15 tolerance for an unlisted boundary class', () => {
    const report = passingReport();
    report.report.hausdorff[0] = { class: 'border', canonicalSegments: 1, toleranceM: 1, distancesM: { lod0: 1.5, lod1: 0, lod2: 0 }, pass: false };
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'hausdorff:border');
    expect(violation?.limit).toBe(1); // HAUSDORFF_TOLERANCES_M.other
  });

  it('warns (not errors) when a base LOD falls outside its §10 starting range', () => {
    const report = passingReport();
    report.report.lods.lod0.triangles = 61_000; // over the 60k §10 ceiling
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'lod-range:lod0');
    expect(violation).toMatchObject({ severity: 'warn', section: '§10', value: 61_000, limit: '35000-60000' });
  });

  it('does not warn a small hole for falling under the §10 floor on LOD1 (canonical mesh) — only over the ceiling is meaningful for LOD1\'s partner LOD0/2', () => {
    // Regression note: §10 gives no floor exemption in the table itself, so a
    // small hole's LOD1 (which equals its canonical triangle count) legitimately warns.
    const report = passingReport();
    report.report.lods.lod1.triangles = 12_000; // under the 25k §10 floor
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'lod-range:lod1');
    expect(violation?.severity).toBe('warn');
  });

  it('flags a hero patch over its own assigned §11 budget as an error, mirroring assertHeroPatch', () => {
    const report = passingReport();
    report.heroPatches[0]!.triangles = 15_000; // > 14000 budgetTriangles
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'hero-patch-budget:green_complex:g');
    expect(violation).toMatchObject({ severity: 'error', section: '§11', value: 15_000, limit: 14_000 });
  });

  it('flags a green-complex budget over the §11 hard cap as an error', () => {
    const report = passingReport();
    report.heroPatches[0]!.budgetTriangles = 21_000; // > GREEN_COMPLEX_BUDGET_CAP (20000)
    report.heroRegions[0]!.budgetTriangles = 21_000;
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'green-cap:green_complex:g');
    expect(violation).toMatchObject({ severity: 'error', limit: 20_000 });
  });

  it('flags a §115 seam over the strict visual tolerance as an error', () => {
    const report = passingReport();
    report.heroPatches[0]!.seamHeightMaxM = 0.01;
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'seam:green_complex:g');
    expect(violation).toMatchObject({ severity: 'error', section: '§115', value: 0.01, limit: 0 });
  });

  it('errors when the de-duplicated visible triangle count breaks the §11 90k envelope', () => {
    const report = passingReport();
    report.report.lods.lod0.triangles = 80_000;
    report.heroPatches[0]!.triangles = 13_500;
    report.heroPatches[0]!.budgetTriangles = 14_000;
    // visible = 80000 - 3000(placeholder) + 13500(patch) = 90500 > 90000
    const violation = byRule(validateHoleBudgets(report, 'phone'), 'close-frame-visible');
    expect(violation).toMatchObject({ severity: 'error', section: '§11' });
  });

  it('warns (not errors) when only the conservative envelope crosses 90k', () => {
    const report = passingReport();
    report.report.lods.lod0.triangles = 75_000;
    report.heroRegions[0]!.triangles = 6_000;
    report.heroRegions[0]!.budgetTriangles = 20_000;
    report.heroPatches[0]!.triangles = 19_000;
    report.heroPatches[0]!.budgetTriangles = 20_000;
    // envelope = 75000 + 20000 = 95000 > 90000; visible = 75000 - 6000 + 19000 = 88000 <= 90000
    const violations = validateHoleBudgets(report, 'phone');
    expect(byRule(violations, 'close-frame-envelope')).toMatchObject({ severity: 'warn', section: '§11' });
    expect(byRule(violations, 'close-frame-visible')).toBeUndefined();
  });

  it('does not warn a cheap hole for landing under §11\'s ~55k close-frame figure (not a stated floor)', () => {
    const report = passingReport();
    report.report.lods.lod0.triangles = 35_000;
    report.heroPatches[0]!.triangles = 2_000;
    report.heroRegions[0]!.budgetTriangles = 2_000;
    report.heroPatches[0]!.budgetTriangles = 2_000;
    const violations = validateHoleBudgets(report, 'phone');
    expect(byRule(violations, 'close-frame-envelope')).toBeUndefined();
    expect(byRule(violations, 'close-frame-visible')).toBeUndefined();
  });

  it('skips every artifact-summary rule when no artifact summary is supplied (graceful, no crash)', () => {
    expect(() => validateHoleBudgets(passingReport(), 'phone')).not.toThrow();
    expect(validateHoleBudgets(passingReport(), 'phone', {})).toEqual([]);
  });

  it('warns at the §93 draw-call target and errors past the hard budget, phone only', () => {
    const report = passingReport();
    const artifact = { hole: '00', bytes: 0, parts: { lods: 0, patches: 0, atlas: 0 }, triangles: 0, patches: 0 };
    const warn = validateHoleBudgets(report, 'phone', { artifact: { ...artifact, expectedDrawCalls: 170 } });
    expect(byRule(warn, 'draw-calls')).toMatchObject({ severity: 'warn', limit: 160, section: '§93' });
    const error = validateHoleBudgets(report, 'phone', { artifact: { ...artifact, expectedDrawCalls: 181 } });
    expect(byRule(error, 'draw-calls')).toMatchObject({ severity: 'error', limit: 180 });
    // Desktop has no §93 number, so the same over-budget count is never gated.
    const desktop = validateHoleBudgets(report, 'desktop', { artifact: { ...artifact, expectedDrawCalls: 500 } });
    expect(byRule(desktop, 'draw-calls')).toBeUndefined();
  });

  it('warns (never errors) over the combined §94/§95 texture-byte target', () => {
    const report = passingReport();
    const artifact = { hole: '00', bytes: 0, parts: { lods: 0, patches: 0, atlas: 0 }, triangles: 0, patches: 0, textureBytesEstimate: 27_000_000 };
    const violation = byRule(validateHoleBudgets(report, 'phone', { artifact }), 'texture-bytes');
    expect(violation).toMatchObject({ severity: 'warn', section: '§94/§95' });
  });

  it('only gates download bytes when the caller supplies a ceiling (the plan states none)', () => {
    const report = passingReport();
    const artifact = { hole: '00', bytes: 5_000_000, parts: { lods: 0, patches: 0, atlas: 0 }, triangles: 0, patches: 0 };
    expect(validateHoleBudgets(report, 'phone', { artifact })).toEqual([]);
    const gated = validateHoleBudgets(report, 'phone', { artifact, maxDownloadBytes: 4_000_000 });
    expect(byRule(gated, 'download-bytes')).toMatchObject({ severity: 'error', value: 5_000_000, limit: 4_000_000 });
  });

  it('splits a mixed report into the right error/warning counts', () => {
    const report = passingReport();
    report.report.lods.lod0.triangles = 61_000; // warn
    report.heroPatches[0]!.seamHeightMaxM = 0.02; // error
    const violations = validateHoleBudgets(report, 'phone');
    expect(violations.filter(v => v.severity === 'warn')).toHaveLength(1);
    expect(violations.filter(v => v.severity === 'error')).toHaveLength(1);
  });
});

describe('real hole 7 fixture (output/course-geometry/display-lods, or compiled fresh if absent)', () => {
  function loadOrCompileHole7(): HoleDisplayLodsReport {
    const course = 'peek-n-peak-upper', hole = `${course}-07`;
    const reportPath = join('output/course-geometry/display-lods', course, `${hole}.display-lods.json`);
    if (existsSync(reportPath)) return JSON.parse(readFileSync(reportPath, 'utf8')) as HoleDisplayLodsReport;
    const fixtures = 'src/test/fixtures/course-geometry';
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(join(fixtures, `${course}.json`), 'utf8')));
    const manifest = JSON.parse(readFileSync(join(fixtures, `compiled-${course}`, 'asset-manifest.json'), 'utf8')) as { holes: Record<string, { fileName: string }> };
    const context = parseContextLayer(JSON.parse(readFileSync(join(fixtures, `${course}-context.json`), 'utf8')), pkg);
    const entry = manifest.holes[hole]!;
    const file = join(fixtures, `compiled-${course}`, entry.fileName);
    const raw = readFileSync(file);
    const mesh = parseTerrainMesh(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    const scene = buildHoleScene(pkg, hole, [], mesh, context);
    const base = weldAndCleanTerrainMesh(mesh);
    const plan = compileHeroRegions(scene, mesh, base);
    const result = compileBaseDisplayLods(mesh, { heroPlan: { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds } });
    const patches = compileHeroPatches(scene, mesh, base, plan);
    const heroRegions: HoleHeroRegionSummary[] = plan.regions.map(r => ({ id: r.id, kind: r.kind, triangles: r.triangles.length, budgetTriangles: r.budgetTriangles }));
    const heroPatches: HoleHeroPatchSummary[] = patches.map(c => ({ id: c.patch.id, triangles: c.report.triangles, budgetTriangles: c.report.budgetTriangles, seamHeightMaxM: c.report.seamHeightMaxM, topology: c.report.topology }));
    return { physicalHoleKey: hole, canonicalTriangles: mesh.triangleFeatures.length, gate: 'pass', heroRegions, heroPatches, report: result.report };
  }

  it('validates with zero error-severity violations at the phone tier', () => {
    const report = loadOrCompileHole7();
    const violations = validateHoleBudgets(report, 'phone');
    expect(violations.filter(v => v.severity === 'error')).toEqual([]);
  }, 30_000);

  it('confirms the close-frame total stays inside the §11 90k hard envelope', () => {
    const report = loadOrCompileHole7();
    const frame = closeFrameTriangles(report);
    expect(frame.envelope).toBeLessThanOrEqual(90_000);
    expect(frame.envelope).toBeGreaterThan(0);
  }, 30_000);
});
