#!/usr/bin/env tsx
/**
 * score-change.ts — change-risk scoring for a release/PR.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §4 F.4.1.
 * Gathers real inputs (a real `git diff`, `memory/registry.yml` criticality,
 * the World Model's blast-radius graph, `memory/incidents/<feature>/` file
 * counts) and hands them to the pure `scoreChange` function
 * (`src/lib/admin/release-intel/risk-score.ts`) — the ONLY thing F.5's
 * synthetic-diff tests pin. This file is orchestration only: gather inputs,
 * call the pure function, print the result. It never mutates anything and
 * never fails a CI job on its own (no threshold enforcement here — that is
 * a separate, later decision the plan does not make yet); it prints and
 * exits 0 unless invoked wrong.
 *
 * Usage:
 *   npx tsx scripts/release-intel/score-change.ts --files <path...>
 *   npx tsx scripts/release-intel/score-change.ts --diff [base]   # git diff --name-only <base>...HEAD, base defaults to origin/main
 *   npx tsx scripts/release-intel/score-change.ts --diff --json
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

import { scoreChange } from '../../src/lib/admin/release-intel/risk-score';
import type { ChangeRiskInput } from '../../src/lib/admin/release-intel/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sh(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64e6 }).trim();
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]) {
  const filesIdx = argv.indexOf('--files');
  const diffIdx = argv.indexOf('--diff');
  const json = argv.includes('--json');
  if (filesIdx !== -1) {
    const files = argv.slice(filesIdx + 1).filter((a) => !a.startsWith('--'));
    return { mode: 'files' as const, files, json };
  }
  if (diffIdx !== -1) {
    const rest = argv.slice(diffIdx + 1).filter((a) => !a.startsWith('--'));
    return { mode: 'diff' as const, base: rest[0] ?? 'origin/main', json };
  }
  return { mode: 'none' as const, json };
}

/** Real changed-file list + real diff text (for the migration/auth/
 *  destructive-write greps) from an actual `git diff`. */
function gatherDiff(base: string): { files: string[]; diffText: string | null } {
  const files = sh('git', ['diff', '--name-only', `${base}...HEAD`]);
  const diffText = sh('git', ['diff', `${base}...HEAD`]);
  return { files: files ? files.split('\n').filter(Boolean) : [], diffText };
}

const MIGRATION_PATTERN = /supabase\/migrations\//;
const AUTH_RLS_PATTERN =
  /\.auth\.getUser\(\)|requireSuperAdmin|requireAuth|CREATE POLICY|ALTER POLICY|DROP POLICY|ENABLE ROW LEVEL SECURITY/i;
const DESTRUCTIVE_WRITE_PATTERN = /\bDELETE FROM\b|\bDROP TABLE\b|\bTRUNCATE\b|\.delete\(\)/i;
const TEST_FILE_PATTERN = /__tests__\/|\.test\.tsx?$|\.test\.mjs$|\.test\.ts$/;

function detectFromDiff(files: string[], diffText: string | null) {
  const touchesMigration = files.some((f) => MIGRATION_PATTERN.test(f));
  const touchesAuthOrRls = diffText !== null ? AUTH_RLS_PATTERN.test(diffText) : null;
  const touchesDestructiveWrite = diffText !== null ? DESTRUCTIVE_WRITE_PATTERN.test(diffText) : null;

  const nonTestFiles = files.filter((f) => !TEST_FILE_PATTERN.test(f));
  const testFiles = files.filter((f) => TEST_FILE_PATTERN.test(f));
  let testCoverageConfidence: ChangeRiskInput['testCoverageConfidence'] = null;
  if (files.length > 0) {
    if (testFiles.length === 0) testCoverageConfidence = 'none';
    else if (nonTestFiles.length === 0) testCoverageConfidence = 'covered';
    else testCoverageConfidence = 'partial';
  }

  return { touchesMigration, touchesAuthOrRls, touchesDestructiveWrite, testCoverageConfidence };
}

interface RegistryFeature {
  criticality?: 'high' | 'medium' | 'low';
  code?: { routes?: string[]; components?: string[]; api?: string[]; actions?: string[]; services?: string[]; db?: string[]; tests?: string[] };
}

function loadRegistry(): Record<string, RegistryFeature> | null {
  const path = resolve(ROOT, 'memory/registry.yml');
  if (!existsSync(path)) return null;
  try {
    const parsed = yaml.load(readFileSync(path, 'utf8')) as { features?: Record<string, RegistryFeature> };
    return parsed.features ?? null;
  } catch {
    return null;
  }
}

/** Minimal glob-to-regex — same conversions this repo's own registry
 *  tooling relies on for `code:` globs (`*` -> any run of non-slash chars,
 *  `**` -> any run of chars). Good enough for matching a changed file path
 *  against a feature's globs; not a general-purpose glob engine. */
function globToRegex(glob: string): RegExp {
  // `*` is deliberately excluded from this escape class -- it is handled by
  // the single-pass replacer below, which tells `**` from `*` apart by
  // matching the longer alternative first. An earlier version of this
  // function round-tripped a placeholder character through two separate
  // `.replace()` calls and it silently became a NUL byte on disk; a single
  // pass with no intermediate placeholder avoids that class of bug entirely.
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*\*|\*/g, (match) => (match === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${pattern}$`);
}

function featuresForFiles(files: string[], registry: Record<string, RegistryFeature>): Set<string> {
  const matched = new Set<string>();
  for (const [featureId, feature] of Object.entries(registry)) {
    const globs = [
      ...(feature.code?.routes ?? []),
      ...(feature.code?.components ?? []),
      ...(feature.code?.api ?? []),
      ...(feature.code?.actions ?? []),
      ...(feature.code?.services ?? []),
      ...(feature.code?.db ?? []),
      ...(feature.code?.tests ?? []),
    ];
    if (globs.length === 0) continue;
    const regexes = globs.map(globToRegex);
    if (files.some((f) => regexes.some((r) => r.test(f)))) matched.add(featureId);
  }
  return matched;
}

function incidentDensityFor(featureIds: Set<string>): number | null {
  let total = 0;
  let anyReadable = false;
  for (const featureId of featureIds) {
    const dir = resolve(ROOT, 'memory/incidents', featureId);
    if (!existsSync(dir)) continue; // a real zero, not unknown
    anyReadable = true;
    try {
      total += readdirSync(dir).filter((f) => /^INC-.*\.md$/i.test(f)).length;
    } catch {
      // leave anyReadable as-is; a readdir failure on an existing path is
      // rare enough not to special-case further here.
    }
  }
  return featureIds.size === 0 ? 0 : anyReadable || total > 0 ? total : 0;
}

function impactedFeatureCount(featureIds: Set<string>): number | null {
  const path = resolve(ROOT, 'docs/generated/WORLD_MODEL.json');
  if (!existsSync(path)) return null;
  try {
    const model = JSON.parse(readFileSync(path, 'utf8')) as {
      edges: Array<{ source: string; target: string; kind: string }>;
    };
    const neighbors = new Set<string>();
    for (const edge of model.edges) {
      if (edge.kind !== 'feature_relation') continue;
      if (featureIds.has(edge.source) && !featureIds.has(edge.target)) neighbors.add(edge.target);
      if (featureIds.has(edge.target) && !featureIds.has(edge.source)) neighbors.add(edge.source);
    }
    return neighbors.size;
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.mode === 'none') {
    console.error('Usage: score-change.ts --files <path...> | --diff [base] [--json]');
    process.exitCode = 2;
    return;
  }

  const { files, diffText } =
    args.mode === 'files' ? { files: args.files, diffText: null } : gatherDiff(args.base);

  if (files.length === 0) {
    console.error('No changed files resolved — nothing to score.');
    process.exitCode = 2;
    return;
  }

  const registry = loadRegistry();
  const touchedFeatures = registry ? featuresForFiles(files, registry) : new Set<string>();
  const criticalities = registry
    ? [...touchedFeatures].map((id) => registry[id]?.criticality ?? null)
    : [null];

  const { touchesMigration, touchesAuthOrRls, touchesDestructiveWrite, testCoverageConfidence } =
    detectFromDiff(files, diffText);

  const input: ChangeRiskInput = {
    featureCriticalities: criticalities,
    impactedFeatureCount: registry ? impactedFeatureCount(touchedFeatures) : null,
    touchesMigration,
    touchesAuthOrRls,
    touchesDestructiveWrite,
    incidentDensity: registry ? incidentDensityFor(touchedFeatures) : null,
    testCoverageConfidence,
  };

  const score = scoreChange(input);

  if (args.json) {
    console.log(JSON.stringify({ files, touchedFeatures: [...touchedFeatures], input, score }, null, 2));
    return;
  }

  console.log(`Change-risk tier: ${score.tier}`);
  console.log(`Files scored: ${files.length}${touchedFeatures.size ? `, touching ${[...touchedFeatures].join(', ')}` : ''}`);
  if (score.inputsMissing.length > 0) {
    console.log(`Inputs unread (biased upward): ${score.inputsMissing.join(', ')}`);
  }
  console.log('Reasons:');
  for (const reason of score.reasons) {
    console.log(`  - [${reason.input}]${reason.raisedTier ? ' (raised tier)' : ''} ${reason.detail}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
