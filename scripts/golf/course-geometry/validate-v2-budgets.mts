#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 budget validator CLI (V2 plan §10, §11, §15, §90–96, §113,
 * §115; Task 25). Reads the per-hole reports `compile-display-lods.mts`
 * already wrote (`<reports>/<course>/<hole>.display-lods.json`) and, when
 * present, the per-hole artifact summary `compile-visual-artifacts-v2.mts`
 * writes (`<artifacts>/<course>/summary.json`) — absent that file, the
 * bytes/draw-call/texture rules simply have nothing to check and are
 * skipped per hole, exactly as `validateHoleBudgets` (v2-budgets.ts) does
 * when no `artifact` is passed. Prints a worst-values-vs-limits table and
 * every violation, then exits 1 if any is error-severity.
 *
 *   node_modules/.bin/tsx scripts/golf/course-geometry/validate-v2-budgets.mts \
 *     --course peek-n-peak-upper [--tier phone|desktop] \
 *     [--reports output/course-geometry/display-lods] \
 *     [--artifacts output/course-geometry/visual-v2] [--max-bytes 4000000]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  closeFrameTriangles, type HoleArtifactSummary, type HoleDisplayLodsReport, type V2BudgetTier, validateHoleBudgets, type Violation,
} from '../../../src/lib/golf/course-geometry/v2-budgets';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : fallback; };
const course = option('course', 'peek-n-peak-upper');
const tier = option('tier', 'phone') as V2BudgetTier;
if (tier !== 'phone' && tier !== 'desktop') { console.error(`--tier must be "phone" or "desktop", got "${tier}"`); process.exit(2); }
const reportsDir = join(option('reports', 'output/course-geometry/display-lods'), course);
const artifactsDir = join(option('artifacts', 'output/course-geometry/visual-v2'), course);
const maxBytesArg = option('max-bytes', '');
const maxDownloadBytes = maxBytesArg ? Number(maxBytesArg) : undefined;

// Discovered from the report files themselves, not summary.json's `holes`
// list: that summary is overwritten whole by every compile-display-lods.mts
// run, including a `--holes` filtered one, so it can list fewer holes than
// actually have a report on disk.
if (!existsSync(reportsDir)) { console.error(`no reports at ${reportsDir} — run compile-display-lods.mts --course ${course} first`); process.exit(2); }
const holeFile = new RegExp(`^${course}-(.+)\\.display-lods\\.json$`);
const holes = readdirSync(reportsDir).map(name => holeFile.exec(name)?.[1]).filter((short): short is string => short != null).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!holes.length) { console.error(`no <hole>.display-lods.json files in ${reportsDir}`); process.exit(2); }

let artifactByHole = new Map<string, HoleArtifactSummary>();
const artifactSummaryPath = join(artifactsDir, 'summary.json');
if (existsSync(artifactSummaryPath)) {
  const artifactSummary = JSON.parse(readFileSync(artifactSummaryPath, 'utf8')) as { holes: HoleArtifactSummary[] };
  artifactByHole = new Map(artifactSummary.holes.map(row => [row.hole, row]));
  console.log(`artifact byte/draw-call/texture rules: using ${artifactSummaryPath} (${artifactByHole.size} holes)`);
} else {
  console.log(`no artifact summary at ${artifactSummaryPath} yet (compile-visual-artifacts-v2.mts) — bytes/draw-call/texture rules skipped for every hole`);
}

const rows: Record<string, string | number>[] = [];
const allViolations: Violation[] = [];
for (const shortHole of holes) {
  const reportPath = join(reportsDir, `${course}-${shortHole}.display-lods.json`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as HoleDisplayLodsReport;
  const artifact = artifactByHole.get(shortHole);
  const violations = validateHoleBudgets(report, tier, { artifact, maxDownloadBytes });
  allViolations.push(...violations);
  const errors = violations.filter(v => v.severity === 'error').length, warnings = violations.filter(v => v.severity === 'warn').length;
  const frame = closeFrameTriangles(report);
  const { lod0, lod1, lod2 } = report.report.lods;
  const worstHausdorff = report.report.hausdorff.reduce((worst, h) => Math.max(worst, h.distancesM.lod0, h.distancesM.lod1, h.distancesM.lod2), 0);
  const worstSeamM = report.heroPatches.reduce((worst, p) => Math.max(worst, p.seamHeightMaxM), 0);
  rows.push({
    hole: shortHole, gate: report.gate === 'pass' ? 'pass' : 'FAIL',
    lod0: lod0.triangles, lod1: lod1.triangles, lod2: lod2.triangles,
    visibleTris: frame.visible, envelopeTris: frame.envelope, envelopeVs90k: `${((frame.envelope / 90_000) * 100).toFixed(0)}%`,
    hausdorffM: worstHausdorff.toFixed(3), seamM: worstSeamM, artifact: artifact ? `${(artifact.bytes / 1_000_000).toFixed(1)} MB` : '·',
    errors, warnings,
  });
}
console.log(`${course} · tier ${tier} · ${rows.length} holes (visibleTris/envelopeTris: §11 close-frame reading vs the 90k envelope; envelopeVs90k over 100% is a §11 warning; hausdorffM: worst boundary distance any class; seamM: worst §115 hero seam)`);
console.table(rows);

if (allViolations.length) {
  console.log(`\n${allViolations.length} violation(s):`);
  console.table(allViolations.map(v => ({ hole: v.hole, rule: v.rule, value: v.value, limit: v.limit, severity: v.severity, section: v.section })));
} else {
  console.log('\nno violations at any severity');
}

const errorCount = allViolations.filter(v => v.severity === 'error').length;
if (errorCount) { console.error(`\n${errorCount} error-severity violation(s)`); process.exit(1); }
