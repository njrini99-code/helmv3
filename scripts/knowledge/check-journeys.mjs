#!/usr/bin/env node
/**
 * check-journeys.mjs — the golden-path registry must point at things that
 * are real, not aspirational.
 *
 * Bridge Control Plane Phase D.4.1
 * (docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md section 2):
 * "A scripts/knowledge/-style check ... fails if a listed spec_path does not
 * exist or a feature_id is not in [the feature registry]." This is that
 * check, extended to the stage-level schema memory/journeys/golden-paths.yml
 * actually uses (see that file's header comment for the full schema).
 *
 * WHAT THIS VALIDATES (all structural, all provable from the working tree —
 * same discipline as check-authority.mjs: no natural-language judgment, only
 * "does this citation resolve"):
 *
 *   - the file parses as YAML with a top-level `journeys` array
 *   - every journey id is unique, snake_case, and has all required fields
 *   - every journey's status is `active` or `collecting`
 *   - every journey's environment_strategy uses the vocabulary
 *     GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md §6-7 defines
 *   - every stage's `order` matches its 1-based position in the array
 *   - every stage's feature_id is a real key under `features:` in
 *     memory/registry.yml (loaded via lib/registry.mjs — the SAME parser
 *     knowledge:map and knowledge:context use, so this can never disagree
 *     with the retrieval path about what a valid feature id is)
 *   - every stage's invariant_status agrees with invariant_ids being
 *     empty (MISSING) or non-empty (LINKED)
 *   - every stage has at least one observable_signals entry
 *   - a `planned` signal is legal ONLY when the journey's status is
 *     `collecting` — an `active` journey may not lean on an unverified
 *     citation
 *   - an e2e signal's spec_path is a git-tracked file, and its test_name
 *     string is found VERBATIM inside that file — this is the check that
 *     catches a renamed test or a stale line number, not just a missing
 *     file
 *   - a flight_recorder signal's source_path is a git-tracked file, and its
 *     workflow / step_key strings (whichever are present) are found
 *     VERBATIM (as single-quoted string literals) inside that file
 *   - a span signal's source_path is tracked and its symbol is found as
 *     `export const <symbol>` inside that file
 *   - a metric signal with build_status `live` is held to the same
 *     existence+symbol proof as flight_recorder/span; build_status
 *     `planned_not_merged` is exempt from file-existence (the vocabulary is
 *     documented but not yet merged into this branch — see
 *     docs/ai-system/HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md)
 *
 * WHAT THIS DOES NOT ATTEMPT: whether a `notes` field's prose is TRUE. That
 * is a human/review judgment, same boundary check-authority.mjs draws
 * around its own prose sweep.
 *
 * Usage: node scripts/knowledge/check-journeys.mjs [path/to/golden-paths.yml]
 * Exit 0 = every citation resolves. Exit 1 = at least one does not.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadRegistry } from './lib/registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PATH = 'memory/journeys/golden-paths.yml';

const VALID_ROLES = new Set(['player', 'coach']);
const VALID_CRITICALITY = new Set(['high', 'medium', 'low']);
const VALID_STATUS = new Set(['active', 'collecting']);
const VALID_PRODUCTION_STRATEGY = new Set(['read_only_observation', 'not_observed']);
const VALID_PREVIEW_STRATEGY = new Set(['executable', 'not_executed']);
const VALID_PRODUCTION_OBSERVATION = new Set(['natural', 'preview_only', 'untested']);
const VALID_INVARIANT_STATUS = new Set(['MISSING', 'LINKED']);
const VALID_SIGNAL_TYPES = new Set(['e2e', 'flight_recorder', 'span', 'metric', 'planned']);
const VALID_BUILD_STATUS = new Set(['live', 'planned_not_merged']);
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

export function validateJourneysDoc(doc, { registryFeatureIds, readFileText, fileTracked }) {
  const problems = [];
  const fail = (where, detail) => problems.push(`${where}: ${detail}`);

  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.journeys)) {
    fail('root', 'expected a top-level `journeys` array');
    return problems;
  }

  const journeyIds = new Set();

  doc.journeys.forEach((journey, journeyIndex) => {
    const where = `journeys[${journeyIndex}]${journey?.id ? ` (${journey.id})` : ''}`;

    if (typeof journey.id !== 'string' || !SNAKE_CASE.test(journey.id)) {
      fail(where, `id must be a snake_case string, got ${JSON.stringify(journey.id)}`);
    } else if (journeyIds.has(journey.id)) {
      fail(where, `duplicate journey id "${journey.id}"`);
    } else {
      journeyIds.add(journey.id);
    }

    if (typeof journey.name !== 'string' || journey.name.length === 0) {
      fail(where, 'name must be a non-empty string');
    }
    if (!VALID_ROLES.has(journey.role)) {
      fail(where, `role must be one of ${[...VALID_ROLES].join('|')}, got ${JSON.stringify(journey.role)}`);
    }
    if (!VALID_CRITICALITY.has(journey.criticality)) {
      fail(where, `criticality must be one of ${[...VALID_CRITICALITY].join('|')}, got ${JSON.stringify(journey.criticality)}`);
    }
    if (!VALID_STATUS.has(journey.status)) {
      fail(where, `status must be one of ${[...VALID_STATUS].join('|')}, got ${JSON.stringify(journey.status)}`);
    }
    if (typeof journey.description !== 'string' || journey.description.trim().length === 0) {
      fail(where, 'description must be a non-empty string');
    }

    const env = journey.environment_strategy ?? {};
    if (!VALID_PRODUCTION_STRATEGY.has(env.production)) {
      fail(where, `environment_strategy.production must be one of ${[...VALID_PRODUCTION_STRATEGY].join('|')}, got ${JSON.stringify(env.production)}`);
    }
    if (!VALID_PREVIEW_STRATEGY.has(env.preview)) {
      fail(where, `environment_strategy.preview must be one of ${[...VALID_PREVIEW_STRATEGY].join('|')}, got ${JSON.stringify(env.preview)}`);
    }

    if (!Array.isArray(journey.stages) || journey.stages.length === 0) {
      fail(where, 'stages must be a non-empty array');
      return;
    }

    const stageIds = new Set();
    journey.stages.forEach((stage, stageIndex) => {
      const stageWhere = `${where}.stages[${stageIndex}]${stage?.id ? ` (${stage.id})` : ''}`;

      if (typeof stage.id !== 'string' || stage.id.length === 0) {
        fail(stageWhere, 'id must be a non-empty string');
      } else if (stageIds.has(stage.id)) {
        fail(stageWhere, `duplicate stage id "${stage.id}" within journey "${journey.id}"`);
      } else {
        stageIds.add(stage.id);
      }

      if (stage.order !== stageIndex + 1) {
        fail(stageWhere, `order must equal 1-based array position (${stageIndex + 1}), got ${JSON.stringify(stage.order)}`);
      }

      if (typeof stage.feature_id !== 'string' || !registryFeatureIds.has(stage.feature_id)) {
        fail(
          stageWhere,
          `feature_id ${JSON.stringify(stage.feature_id)} is not a key under features: in memory/registry.yml`,
        );
      }

      if (!VALID_PRODUCTION_OBSERVATION.has(stage.production_observation)) {
        fail(
          stageWhere,
          `production_observation must be one of ${[...VALID_PRODUCTION_OBSERVATION].join('|')}, got ${JSON.stringify(stage.production_observation)}`,
        );
      }

      const invariantIds = Array.isArray(stage.invariant_ids) ? stage.invariant_ids : null;
      if (invariantIds === null) {
        fail(stageWhere, 'invariant_ids must be an array (use [] when none apply)');
      }
      if (!VALID_INVARIANT_STATUS.has(stage.invariant_status)) {
        fail(stageWhere, `invariant_status must be one of ${[...VALID_INVARIANT_STATUS].join('|')}, got ${JSON.stringify(stage.invariant_status)}`);
      } else if (invariantIds !== null) {
        if (stage.invariant_status === 'MISSING' && invariantIds.length !== 0) {
          fail(stageWhere, 'invariant_status is MISSING but invariant_ids is non-empty');
        }
        if (stage.invariant_status === 'LINKED' && invariantIds.length === 0) {
          fail(stageWhere, 'invariant_status is LINKED but invariant_ids is empty');
        }
      }

      if (!Array.isArray(stage.observable_signals) || stage.observable_signals.length === 0) {
        fail(stageWhere, 'observable_signals must be a non-empty array');
        return;
      }

      stage.observable_signals.forEach((signal, signalIndex) => {
        const signalWhere = `${stageWhere}.observable_signals[${signalIndex}]`;
        validateSignal(signal, signalWhere, journey, fail, { readFileText, fileTracked });
      });
    });
  });

  return problems;
}

function validateSignal(signal, where, journey, fail, { readFileText, fileTracked }) {
  if (!VALID_SIGNAL_TYPES.has(signal?.type)) {
    fail(where, `type must be one of ${[...VALID_SIGNAL_TYPES].join('|')}, got ${JSON.stringify(signal?.type)}`);
    return;
  }

  if (signal.type === 'planned') {
    if (journey.status !== 'collecting') {
      fail(where, `type "planned" is only legal when the journey's status is "collecting" (got "${journey.status}")`);
    }
    if (typeof signal.reason !== 'string' || signal.reason.trim().length === 0) {
      fail(where, 'a "planned" signal must carry a non-empty `reason`');
    }
    if (signal.spec_path || signal.source_path) {
      fail(where, 'a "planned" signal must not carry spec_path/source_path — that would be an unverified citation dressed as a real one');
    }
    return;
  }

  if (signal.type === 'e2e') {
    checkTrackedFileCitation(signal.spec_path, where, fail, { fileTracked }, 'spec_path');
    if (typeof signal.test_name !== 'string' || signal.test_name.length === 0) {
      fail(where, 'e2e signal must carry a non-empty test_name');
      return;
    }
    if (fileTracked(signal.spec_path)) {
      const text = readFileText(signal.spec_path);
      if (!text.includes(signal.test_name)) {
        fail(
          where,
          `test_name ${JSON.stringify(signal.test_name)} was not found verbatim in ${signal.spec_path} — the citation has drifted (renamed test or stale copy)`,
        );
      }
    }
    return;
  }

  if (signal.type === 'flight_recorder') {
    checkTrackedFileCitation(signal.source_path, where, fail, { fileTracked }, 'source_path');
    if (!signal.workflow && !signal.step_key) {
      fail(where, 'flight_recorder signal must carry workflow and/or step_key');
      return;
    }
    if (fileTracked(signal.source_path)) {
      const text = readFileText(signal.source_path);
      if (signal.workflow && !text.includes(`'${signal.workflow}'`)) {
        fail(where, `workflow ${JSON.stringify(signal.workflow)} was not found as a quoted string literal in ${signal.source_path}`);
      }
      if (signal.step_key && !text.includes(`'${signal.step_key}'`)) {
        fail(where, `step_key ${JSON.stringify(signal.step_key)} was not found as a quoted string literal in ${signal.source_path}`);
      }
    }
    return;
  }

  if (signal.type === 'span') {
    checkTrackedFileCitation(signal.source_path, where, fail, { fileTracked }, 'source_path');
    if (typeof signal.symbol !== 'string' || signal.symbol.length === 0) {
      fail(where, 'span signal must carry a non-empty symbol');
      return;
    }
    if (fileTracked(signal.source_path)) {
      const text = readFileText(signal.source_path);
      if (!text.includes(`export const ${signal.symbol}`)) {
        fail(where, `symbol ${JSON.stringify(signal.symbol)} was not found as \`export const ${signal.symbol}\` in ${signal.source_path}`);
      }
    }
    return;
  }

  if (signal.type === 'metric') {
    if (!VALID_BUILD_STATUS.has(signal.build_status)) {
      fail(where, `metric signal must carry build_status: one of ${[...VALID_BUILD_STATUS].join('|')}, got ${JSON.stringify(signal.build_status)}`);
      return;
    }
    if (signal.build_status === 'planned_not_merged') {
      return; // vocabulary documented in the handoff, not yet on this branch — nothing to verify
    }
    checkTrackedFileCitation(signal.source_path, where, fail, { fileTracked }, 'source_path');
    if (typeof signal.symbol !== 'string' || signal.symbol.length === 0) {
      fail(where, 'metric signal with build_status "live" must carry a non-empty symbol');
      return;
    }
    if (fileTracked(signal.source_path)) {
      const text = readFileText(signal.source_path);
      if (!text.includes(signal.symbol)) {
        fail(where, `symbol ${JSON.stringify(signal.symbol)} was not found in ${signal.source_path}`);
      }
    }
  }
}

function checkTrackedFileCitation(path, where, fail, { fileTracked }, fieldName) {
  if (typeof path !== 'string' || path.length === 0) {
    fail(where, `${fieldName} must be a non-empty string`);
    return;
  }
  if (!fileTracked(path)) {
    fail(where, `${fieldName} ${JSON.stringify(path)} does not resolve to a tracked file`);
  }
}

async function main() {
  const journeysPath = process.argv[2] ?? DEFAULT_PATH;
  const absPath = resolve(ROOT, journeysPath);

  if (!existsSync(absPath)) {
    console.error(`check-journeys: ${journeysPath} does not exist.`);
    process.exit(1);
  }

  let doc;
  try {
    doc = yaml.load(readFileSync(absPath, 'utf8'));
  } catch (err) {
    console.error(`check-journeys: ${journeysPath} is not valid YAML: ${err.message}`);
    process.exit(1);
  }

  const registry = await loadRegistry(ROOT);
  const registryFeatureIds = new Set(Object.keys(registry.features ?? {}));

  let tracked;
  try {
    tracked = new Set(
      execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    );
  } catch {
    console.error('check-journeys: `git ls-files` failed — cannot verify citations without a git repo. Treating every citation as untracked.');
    tracked = new Set();
  }

  const fileTracked = (p) => typeof p === 'string' && tracked.has(p);
  const readFileText = (p) => readFileSync(resolve(ROOT, p), 'utf8');

  const problems = validateJourneysDoc(doc, { registryFeatureIds, repoRoot: ROOT, readFileText, fileTracked });

  if (problems.length > 0) {
    console.error(`check-journeys: ${problems.length} problem(s) in ${journeysPath}:\n`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const journeyCount = doc.journeys.length;
  const stageCount = doc.journeys.reduce((sum, j) => sum + j.stages.length, 0);
  const activeCount = doc.journeys.filter((j) => j.status === 'active').length;
  console.log(
    `check-journeys: PASS — ${journeyCount} journeys (${activeCount} active, ${journeyCount - activeCount} collecting), ${stageCount} stages, every citation resolved.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
