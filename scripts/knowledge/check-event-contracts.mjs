#!/usr/bin/env node
/**
 * check-event-contracts.mjs — memory/analytics/event-contracts.yml must name
 * real journeys and real, actually-wired call sites for every `live` event.
 *
 * Bridge Control Plane Phase D.4.4
 * (docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md §2 item 4).
 * Same discipline as check-journeys.mjs/check-invariants.mjs:
 *
 *   - the file parses as YAML with a top-level `contracts` array
 *   - every `event` name is unique across the whole file
 *   - `journey_id` is a real id in memory/journeys/golden-paths.yml
 *   - `platform` is server|client; `status` is live|planned
 *   - a `live` event's `source_path` is a git-tracked file containing the
 *     event name as a quoted string literal — proof it is actually emitted,
 *     not merely declared
 *   - a `planned` event's `source_path` must be null — an unverified
 *     citation dressed as a real one is exactly the trap check-journeys.mjs
 *     already refuses for a `planned` observable_signal
 *   - `allowed_properties` and `prohibited_properties` are both present
 *     arrays (may be empty), and share no property name — a name cannot be
 *     both allowed and prohibited
 *
 * Usage: node scripts/knowledge/check-event-contracts.mjs [path/to/event-contracts.yml]
 * Exit 0 = every citation resolves. Exit 1 = at least one does not.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PATH = 'memory/analytics/event-contracts.yml';
const JOURNEYS_PATH = 'memory/journeys/golden-paths.yml';

const VALID_PLATFORM = new Set(['server', 'client']);
const VALID_STATUS = new Set(['live', 'planned']);

export function validateEventContractsDoc(doc, { journeyIds, readFileText, fileTracked }) {
  const problems = [];
  const fail = (where, detail) => problems.push(`${where}: ${detail}`);

  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.contracts)) {
    fail('root', 'expected a top-level `contracts` array');
    return problems;
  }

  const eventNames = new Set();

  doc.contracts.forEach((c, index) => {
    const where = `contracts[${index}]${c?.event ? ` (${c.event})` : ''}`;

    if (typeof c.event !== 'string' || c.event.length === 0) {
      fail(where, 'event must be a non-empty string');
    } else if (eventNames.has(c.event)) {
      fail(where, `duplicate event name "${c.event}"`);
    } else {
      eventNames.add(c.event);
    }

    if (typeof c.journey_id !== 'string' || !journeyIds.has(c.journey_id)) {
      fail(where, `journey_id ${JSON.stringify(c.journey_id)} is not a journey id in ${JOURNEYS_PATH}`);
    }

    if (!VALID_PLATFORM.has(c.platform)) {
      fail(where, `platform must be one of ${[...VALID_PLATFORM].join('|')}, got ${JSON.stringify(c.platform)}`);
    }

    if (!VALID_STATUS.has(c.status)) {
      fail(where, `status must be one of ${[...VALID_STATUS].join('|')}, got ${JSON.stringify(c.status)}`);
    }

    if (!Array.isArray(c.allowed_properties)) fail(where, 'allowed_properties must be an array (use [] when none apply)');
    if (!Array.isArray(c.prohibited_properties)) fail(where, 'prohibited_properties must be an array (use [] when none apply)');
    if (Array.isArray(c.allowed_properties) && Array.isArray(c.prohibited_properties)) {
      const overlap = c.allowed_properties.filter((p) => c.prohibited_properties.includes(p));
      if (overlap.length > 0) fail(where, `propert${overlap.length === 1 ? 'y' : 'ies'} both allowed and prohibited: ${overlap.join(', ')}`);
    }

    if (c.status === 'planned') {
      if (c.source_path !== null) {
        fail(where, 'a "planned" event must have source_path: null — an unverified citation dressed as a real one');
      }
      return;
    }

    if (c.status === 'live') {
      if (typeof c.source_path !== 'string' || c.source_path.length === 0) {
        fail(where, 'a "live" event must carry a non-empty source_path');
        return;
      }
      if (!fileTracked(c.source_path)) {
        fail(where, `source_path ${JSON.stringify(c.source_path)} does not resolve to a tracked file`);
        return;
      }
      const text = readFileText(c.source_path);
      if (!text.includes(`'${c.event}'`) && !text.includes(`"${c.event}"`)) {
        fail(where, `event ${JSON.stringify(c.event)} was not found as a quoted string literal in ${c.source_path} — declared live but not provably wired`);
      }
    }
  });

  return problems;
}

async function main() {
  const contractsPath = process.argv[2] ?? DEFAULT_PATH;
  const absPath = resolve(ROOT, contractsPath);

  if (!existsSync(absPath)) {
    console.error(`check-event-contracts: ${contractsPath} does not exist.`);
    process.exit(1);
  }

  let doc;
  try {
    doc = yaml.load(readFileSync(absPath, 'utf8'));
  } catch (err) {
    console.error(`check-event-contracts: ${contractsPath} is not valid YAML: ${err.message}`);
    process.exit(1);
  }

  let journeysDoc;
  try {
    journeysDoc = yaml.load(readFileSync(resolve(ROOT, JOURNEYS_PATH), 'utf8'));
  } catch (err) {
    console.error(`check-event-contracts: could not parse ${JOURNEYS_PATH}: ${err.message}`);
    process.exit(1);
  }
  const journeyIds = new Set((journeysDoc?.journeys ?? []).map((j) => j.id));

  let tracked;
  try {
    tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean));
  } catch {
    console.error('check-event-contracts: `git ls-files` failed — cannot verify citations without a git repo. Treating every citation as untracked.');
    tracked = new Set();
  }

  const fileTracked = (p) => typeof p === 'string' && tracked.has(p);
  const readFileText = (p) => readFileSync(resolve(ROOT, p), 'utf8');

  const problems = validateEventContractsDoc(doc, { journeyIds, readFileText, fileTracked });

  if (problems.length > 0) {
    console.error(`check-event-contracts: ${problems.length} problem(s) in ${contractsPath}:\n`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const liveCount = doc.contracts.filter((c) => c.status === 'live').length;
  console.log(
    `check-event-contracts: PASS — ${doc.contracts.length} contracts (${liveCount} live, ${doc.contracts.length - liveCount} planned), every citation resolved.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
