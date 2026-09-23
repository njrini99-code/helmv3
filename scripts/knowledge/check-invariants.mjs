#!/usr/bin/env node
/**
 * check-invariants.mjs — memory/invariants/registry.yml must point at
 * checks that are real and actually wired, not aspirational.
 *
 * Bridge Control Plane Phase D.4.3
 * (docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md §2 item 3).
 * Same discipline as check-journeys.mjs (structural, provable-from-the-
 * working-tree checks only — no natural-language judgment on whether a
 * `description` is true):
 *
 *   - the file parses as YAML with a top-level `invariants` array
 *   - every id is unique, snake_case
 *   - every feature_id is a real key under `features:` in
 *     memory/registry.yml (same loader check-journeys.mjs uses, so this can
 *     never disagree with the retrieval path about what a valid feature id
 *     is)
 *   - severity is critical|warning; status is active|collecting
 *   - `module` is a git-tracked file, and `symbol` resolves as
 *     `export function <symbol>` OR `export const <symbol>` inside it
 *   - `runner` is a git-tracked file, and `id` appears there as a
 *     single-quoted string literal — proof the check is actually invoked,
 *     not just declared
 *   - `incident`, when present, is a git-tracked file
 *
 * Usage: node scripts/knowledge/check-invariants.mjs [path/to/registry.yml]
 * Exit 0 = every citation resolves. Exit 1 = at least one does not.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { loadRegistry } from './lib/registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PATH = 'memory/invariants/registry.yml';

const VALID_SEVERITY = new Set(['critical', 'warning']);
const VALID_STATUS = new Set(['active', 'collecting']);
const SNAKE_CASE = /^[a-z][a-z0-9-]*$/;

export function validateInvariantsDoc(doc, { registryFeatureIds, readFileText, fileTracked }) {
  const problems = [];
  const fail = (where, detail) => problems.push(`${where}: ${detail}`);

  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.invariants)) {
    fail('root', 'expected a top-level `invariants` array');
    return problems;
  }

  const ids = new Set();

  doc.invariants.forEach((inv, index) => {
    const where = `invariants[${index}]${inv?.id ? ` (${inv.id})` : ''}`;

    if (typeof inv.id !== 'string' || !SNAKE_CASE.test(inv.id)) {
      fail(where, `id must be a lowercase, hyphen/underscore-safe string, got ${JSON.stringify(inv.id)}`);
    } else if (ids.has(inv.id)) {
      fail(where, `duplicate id "${inv.id}"`);
    } else {
      ids.add(inv.id);
    }

    if (typeof inv.feature_id !== 'string' || !registryFeatureIds.has(inv.feature_id)) {
      fail(where, `feature_id ${JSON.stringify(inv.feature_id)} is not a key under features: in memory/registry.yml`);
    }

    if (!VALID_SEVERITY.has(inv.severity)) {
      fail(where, `severity must be one of ${[...VALID_SEVERITY].join('|')}, got ${JSON.stringify(inv.severity)}`);
    }

    if (!VALID_STATUS.has(inv.status)) {
      fail(where, `status must be one of ${[...VALID_STATUS].join('|')}, got ${JSON.stringify(inv.status)}`);
    }

    if (typeof inv.description !== 'string' || inv.description.trim().length === 0) {
      fail(where, 'description must be a non-empty string');
    }

    checkTrackedFileCitation(inv.module, where, fail, fileTracked, 'module');
    if (typeof inv.symbol !== 'string' || inv.symbol.length === 0) {
      fail(where, 'symbol must be a non-empty string');
    } else if (fileTracked(inv.module)) {
      const text = readFileText(inv.module);
      if (!text.includes(`export function ${inv.symbol}`) && !text.includes(`export const ${inv.symbol}`)) {
        fail(where, `symbol ${JSON.stringify(inv.symbol)} was not found as \`export function ${inv.symbol}\` or \`export const ${inv.symbol}\` in ${inv.module}`);
      }
    }

    checkTrackedFileCitation(inv.runner, where, fail, fileTracked, 'runner');
    if (typeof inv.id === 'string' && fileTracked(inv.runner)) {
      const text = readFileText(inv.runner);
      if (!text.includes(`'${inv.id}'`)) {
        fail(where, `id ${JSON.stringify(inv.id)} was not found as a single-quoted string literal in ${inv.runner} — the check is declared but not provably wired`);
      }
    }

    if (inv.incident !== undefined) {
      checkTrackedFileCitation(inv.incident, where, fail, fileTracked, 'incident');
    }
  });

  return problems;
}

function checkTrackedFileCitation(path, where, fail, fileTracked, fieldName) {
  if (typeof path !== 'string' || path.length === 0) {
    fail(where, `${fieldName} must be a non-empty string`);
    return;
  }
  if (!fileTracked(path)) {
    fail(where, `${fieldName} ${JSON.stringify(path)} does not resolve to a tracked file`);
  }
}

async function main() {
  const registryPath = process.argv[2] ?? DEFAULT_PATH;
  const absPath = resolve(ROOT, registryPath);

  if (!existsSync(absPath)) {
    console.error(`check-invariants: ${registryPath} does not exist.`);
    process.exit(1);
  }

  let doc;
  try {
    doc = yaml.load(readFileSync(absPath, 'utf8'));
  } catch (err) {
    console.error(`check-invariants: ${registryPath} is not valid YAML: ${err.message}`);
    process.exit(1);
  }

  const registry = await loadRegistry(ROOT);
  const registryFeatureIds = new Set(Object.keys(registry.features ?? {}));

  let tracked;
  try {
    tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean));
  } catch {
    console.error('check-invariants: `git ls-files` failed — cannot verify citations without a git repo. Treating every citation as untracked.');
    tracked = new Set();
  }

  const fileTracked = (p) => typeof p === 'string' && tracked.has(p);
  const readFileText = (p) => readFileSync(resolve(ROOT, p), 'utf8');

  const problems = validateInvariantsDoc(doc, { registryFeatureIds, readFileText, fileTracked });

  if (problems.length > 0) {
    console.error(`check-invariants: ${problems.length} problem(s) in ${registryPath}:\n`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const activeCount = doc.invariants.filter((i) => i.status === 'active').length;
  console.log(
    `check-invariants: PASS — ${doc.invariants.length} invariants (${activeCount} active, ${doc.invariants.length - activeCount} collecting), every citation resolved.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
