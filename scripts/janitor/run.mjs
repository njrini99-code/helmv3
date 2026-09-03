#!/usr/bin/env node
/**
 * The Janitor: a generator for entropy findings across a fixed set of
 * classes (duplicate helpers, dead flags, stale docs, orphan routes,
 * deprecated APIs, stale TODOs, oversized modules, unused tests, mock
 * inflation, duplicate telemetry, missing feature mappings, abandoned
 * experiments), using ONLY existing repo signals — baseline files this
 * repo already ratchets, scripts it already ships (orphans:mounts,
 * memory/registry.yml's own reader), `git ls-files`/`git grep`/`git log`.
 *
 * READ-ONLY. This script never modifies source files — it only writes its
 * own two output files:
 *
 *   docs/generated/JANITOR_REPORT.md      human-readable, ranked
 *   docs/generated/janitor-findings.json  machine-readable, same data
 *
 * Neither is `config/control-plane-gaps.json`, and nothing here writes to
 * that file. See scripts/janitor/lib/report.mjs's header for why.
 *
 * Every classifier returns one of three verdicts (see lib/verdicts.mjs):
 * FINDINGS / ZERO_FINDINGS_VERIFIED / NO_SIGNAL. A classifier that cannot
 * tell "checked, found nothing" from "nothing to check" must say NO_SIGNAL
 * — this generator refuses to average that distinction away.
 *
 * Usage: node scripts/janitor/run.mjs   (or: npm run janitor)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertClassifierResult } from './lib/verdicts.mjs';
import { rankFindings } from './lib/rank.mjs';
import { buildFindingsJson, buildMarkdownReport } from './lib/report.mjs';

import * as duplicateHelpers from './classifiers/duplicate-helpers.mjs';
import * as deadFlags from './classifiers/dead-flags.mjs';
import * as staleDocs from './classifiers/stale-docs.mjs';
import * as orphanRoutes from './classifiers/orphan-routes.mjs';
import * as deprecatedApis from './classifiers/deprecated-apis.mjs';
import * as staleTodos from './classifiers/stale-todos.mjs';
import * as oversizedModules from './classifiers/oversized-modules.mjs';
import * as unusedTests from './classifiers/unused-tests.mjs';
import * as mockInflation from './classifiers/mock-inflation.mjs';
import * as duplicateTelemetry from './classifiers/duplicate-telemetry.mjs';
import * as missingFeatureMappings from './classifiers/missing-feature-mappings.mjs';
import * as abandonedExperiments from './classifiers/abandoned-experiments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');

// Explicit list, not a directory scan — a new classifier must be wired here
// by name to run, the same "add its caller in the same change" discipline
// .claude/rules/quality-gates.md asks of every guard in this repo.
const CLASSIFIERS = [
  duplicateHelpers,
  deadFlags,
  staleDocs,
  orphanRoutes,
  deprecatedApis,
  staleTodos,
  oversizedModules,
  unusedTests,
  mockInflation,
  duplicateTelemetry,
  missingFeatureMappings,
  abandonedExperiments,
];

/**
 * Run every classifier against `repoRoot`. A single classifier throwing
 * does NOT abort the run — the failure is itself reported as a class-level
 * problem (never silently dropped from the report) and the process exits
 * non-zero at the end, distinct from a normal "some classes had findings"
 * exit.
 */
export async function runAll({ repoRoot }) {
  const results = [];
  const crashes = [];

  for (const mod of CLASSIFIERS) {
    const classId = mod.CLASS_ID ?? 'unknown_classifier';
    let result;
    try {
      result = await mod.run({ repoRoot });
      assertClassifierResult(result, classId);
    } catch (err) {
      crashes.push({ classId, error: err });
      result = {
        classId,
        title: `${mod.TITLE ?? classId} (CRASHED)`,
        verdict: 'NO_SIGNAL',
        note: `Classifier threw: ${err.message}`,
        evidenceCommand: 'node scripts/janitor/run.mjs',
      };
    }
    results.push(result);
  }

  return { results, crashes };
}

async function main() {
  const repoRoot = process.env.JANITOR_REPO_ROOT ? resolve(process.env.JANITOR_REPO_ROOT) : DEFAULT_ROOT;
  const { results, crashes } = await runAll({ repoRoot });

  const rankedFindings = rankFindings(results);
  const generatedAt = new Date().toISOString();

  const json = buildFindingsJson({ repoRoot, classResults: results, rankedFindings, generatedAt });
  const markdown = buildMarkdownReport({ repoRoot, classResults: results, rankedFindings, generatedAt });

  const outDir = resolve(repoRoot, 'docs', 'generated');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'janitor-findings.json'), JSON.stringify(json, null, 2) + '\n');
  writeFileSync(resolve(outDir, 'JANITOR_REPORT.md'), markdown);

  console.log(`janitor: ${results.length} classes checked, ${rankedFindings.length} finding(s) ranked, ${crashes.length} classifier crash(es).`);
  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(24)} ${r.classId}`);
  }
  console.log('Wrote docs/generated/JANITOR_REPORT.md and docs/generated/janitor-findings.json.');

  if (crashes.length > 0) {
    console.error(`\n${crashes.length} classifier(s) crashed — see NO_SIGNAL entries above and the note field in the report.`);
    process.exit(1);
  }
  process.exit(0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
