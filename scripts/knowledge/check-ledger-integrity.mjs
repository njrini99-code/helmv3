#!/usr/bin/env node
/**
 * check-ledger-integrity.mjs — the durable records must refer to things that
 * exist, and every "none" must be a decision rather than a blank.
 *
 * Five record types, five different lifecycles, all keyed on the same semantic
 * feature id (`memory/registry.yml`):
 *
 *   memory/incidents/<feature_id>/INC-*.md      confirmed product defects
 *   memory/operations/release-queue.yml         repair units in flight
 *   memory/ledgers/{changes,tests}/<id>.md      behavioural / test history
 *   config/control-plane-gaps.json              accepted limitations
 *   memory/decisions/ADR-*.md                   architecture decisions
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK
 *
 * That a repair unit's `incident_id` lives under its own feature. It does not
 * always, and that is CORRECT: the dedupe rule in memory/incidents/README.md is
 * one incident per proven root cause, so two features can legitimately trace to
 * one incident file. Measured 2026-08-30, `coachhelm-safety-net-anon-client`
 * carries `feature_id: coachhelm_ai` and points at an `admin_platform`
 * incident, and that is the rule working, not a violation. The cross-reference
 * is REPORTED so it stays visible, and never failed.
 *
 * That every feature HAS a ledger. A ledger is appended after a behavioural
 * mutation (memory/ledgers/README.md), so a feature with no recorded mutation
 * legitimately has no file, and requiring one would produce empty documents
 * that assert a history nobody wrote. What WOULD be dishonest is letting a
 * one-directional pass read as "every feature has history", so the coverage is
 * PRINTED every run and the features without a ledger are named.
 *
 * `incident_id: null` IS checked, in the other direction: a repair unit with no
 * incident must say why. An unexplained null is indistinguishable from a
 * forgotten link, which is the whole class of failure these records exist to
 * remove.
 *
 * Usage: node scripts/knowledge/check-ledger-integrity.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

/**
 * The repository this checks is the one containing the current working
 * directory, not the one containing this script — same rule as
 * check-doc-schema-drift.mjs and, more importantly, as the lifecycle tool,
 * where resolving from import.meta.url once pointed a destructive command at
 * the live checkout during a fixture test. Here the stakes are only a wrong
 * verdict, but a checker that cannot be aimed cannot be tested either.
 */
const ROOT = process.cwd();
const P = (...p) => resolve(ROOT, ...p);

/** The statuses a repair unit may carry, from the release-queue header. */
const QUEUE_STATUSES = new Set([
  'observed', 'triaging', 'reproduced', 'repairing', 'verification_failed',
  'verified', 'queued_for_release', 'released', 'verified_in_production',
  'blocked', 'wont_fix', 'expected', 'duplicate',
]);

const INCIDENT_FILE = /^INC-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
const ADR_FILE = /^ADR-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;

const problems = [];
const notes = [];
const fail = (kind, detail) => problems.push({ kind, detail });

function loadYaml(rel) {
  return yaml.load(readFileSync(P(rel), 'utf8'));
}
function loadJson(rel) {
  return JSON.parse(readFileSync(P(rel), 'utf8'));
}

const registry = loadYaml('memory/registry.yml');
const featureIds = new Set(Object.keys(registry.features ?? {}));

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
const incidentsDir = P('memory/incidents');
const incidentPaths = new Set();
for (const entry of readdirSync(incidentsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!featureIds.has(entry.name)) {
    fail('INCIDENT_DIR_NOT_A_FEATURE',
      `memory/incidents/${entry.name}/ is not a memory/registry.yml feature id`);
    continue;
  }
  for (const f of readdirSync(P('memory/incidents', entry.name))) {
    if (f === 'README.md') continue;
    if (!INCIDENT_FILE.test(f)) {
      fail('INCIDENT_FILENAME',
        `memory/incidents/${entry.name}/${f} does not match INC-YYYY-MM-DD-<slug>.md`);
      continue;
    }
    const rel = `memory/incidents/${entry.name}/${f}`;
    incidentPaths.add(rel);
    const body = readFileSync(P(rel), 'utf8');
    const m = body.match(/^- Feature:\s*`([a-z0-9_]+)`/m);
    if (!m) {
      fail('INCIDENT_NO_FEATURE_LINE', `${rel} declares no "- Feature: \`<id>\`" line`);
    } else if (m[1] !== entry.name) {
      fail('INCIDENT_FEATURE_MISMATCH',
        `${rel} declares feature '${m[1]}' but lives under '${entry.name}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// Release queue
// ---------------------------------------------------------------------------
const queue = loadYaml('memory/operations/release-queue.yml');
const seenUnitIds = new Set();
for (const item of queue?.items ?? []) {
  const id = item?.id ?? '(no id)';
  if (seenUnitIds.has(id)) fail('DUPLICATE_REPAIR_UNIT', `release-queue has two items with id '${id}'`);
  seenUnitIds.add(id);

  if (!featureIds.has(item?.feature_id)) {
    fail('REPAIR_UNIT_UNKNOWN_FEATURE',
      `repair unit '${id}': feature_id '${item?.feature_id}' is not in memory/registry.yml`);
  }
  if (!QUEUE_STATUSES.has(item?.status)) {
    fail('REPAIR_UNIT_BAD_STATUS',
      `repair unit '${id}': status '${item?.status}' is outside the documented vocabulary`);
  }
  if (item?.incident_id) {
    if (!existsSync(P(item.incident_id))) {
      fail('REPAIR_UNIT_DEAD_INCIDENT',
        `repair unit '${id}' points at ${item.incident_id}, which does not exist`);
    } else {
      const owner = item.incident_id.split('/')[2];
      if (owner !== item.feature_id) {
        notes.push(
          `repair unit '${id}' (${item.feature_id}) references an incident under '${owner}' — ` +
          'legal: one incident per proven root cause can serve several features',
        );
      }
    }
  } else if (!item?.no_incident_reason) {
    fail('REPAIR_UNIT_UNEXPLAINED_NULL_INCIDENT',
      `repair unit '${id}' has incident_id: null and no no_incident_reason — ` +
      'an unexplained null is indistinguishable from a forgotten link');
  }
}

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------
const ledgerCoverage = new Map();
for (const kind of ['changes', 'tests']) {
  const dir = P('memory/ledgers', kind);
  if (!existsSync(dir)) {
    fail('LEDGER_DIR_MISSING', `memory/ledgers/${kind}/ does not exist`);
    continue;
  }
  const covered = new Set();
  ledgerCoverage.set(kind, covered);
  for (const f of readdirSync(dir)) {
    if (f === 'README.md') continue;
    if (!f.endsWith('.md')) {
      fail('LEDGER_FILENAME', `memory/ledgers/${kind}/${f} is not a .md file`);
      continue;
    }
    const id = f.slice(0, -3);
    if (featureIds.has(id)) covered.add(id);
    if (!featureIds.has(id)) {
      // The one normalization rule: ledgers use the registry key verbatim.
      // A kebab-cased sibling is the same feature under a second spelling,
      // which is exactly what makes a history file unfindable.
      const kebab = id.replaceAll('-', '_');
      fail('LEDGER_NOT_A_FEATURE',
        featureIds.has(kebab)
          ? `memory/ledgers/${kind}/${f} uses a second spelling of '${kebab}' — ledgers use the registry key verbatim`
          : `memory/ledgers/${kind}/${f} is not a memory/registry.yml feature id`);
    }
  }
}

// ---------------------------------------------------------------------------
// Control-plane gaps
// ---------------------------------------------------------------------------
const gaps = loadJson('config/control-plane-gaps.json');
const openIds = new Set();
for (const g of gaps.gaps ?? []) {
  if (openIds.has(g.id)) fail('DUPLICATE_GAP_ID', `two open gaps share id '${g.id}'`);
  openIds.add(g.id);
  if (g.contract && !existsSync(P(g.contract))) {
    fail('GAP_DEAD_CONTRACT', `gap '${g.id}' names contract ${g.contract}, which does not exist`);
  }
  for (const field of ['owner', 'opened', 'reason', 'closes_when']) {
    if (!g[field]) fail('GAP_INCOMPLETE', `gap '${g.id}' has no ${field}`);
  }
}
for (const c of gaps.closed ?? []) {
  if (openIds.has(c.id)) {
    fail('GAP_OPEN_AND_CLOSED', `gap '${c.id}' appears in both gaps[] and closed[]`);
  }
  if (!c.how) fail('GAP_CLOSED_WITHOUT_EVIDENCE', `closed gap '${c.id}' records no 'how'`);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------
const adrDir = P('memory/decisions');
const adrIds = new Set();
const adrFiles = readdirSync(adrDir).filter((f) => f !== 'README.md');
for (const f of adrFiles) {
  if (!ADR_FILE.test(f)) {
    fail('ADR_FILENAME', `memory/decisions/${f} does not match ADR-YYYY-MM-DD-<slug>.md`);
    continue;
  }
  if (adrIds.has(f)) fail('DUPLICATE_ADR', `two decisions share the filename ${f}`);
  adrIds.add(f);
  const body = readFileSync(P('memory/decisions', f), 'utf8');
  const sup = body.match(/\*\*Supersedes:\*\*\s*(.+)/);
  if (sup && !/nothing/i.test(sup[1])) {
    for (const ref of sup[1].match(/ADR-[0-9a-z-]+/g) ?? []) {
      if (!adrFiles.some((x) => x.startsWith(ref))) {
        fail('ADR_DEAD_SUPERSEDES', `${f} supersedes ${ref}, which does not exist`);
      }
    }
  }
}

// ---------------------------------------------------------------------------

console.log(
  `Ledger integrity: ${incidentPaths.size} incident(s), ${(queue?.items ?? []).length} repair unit(s), ` +
    `${(gaps.gaps ?? []).length} open gap(s), ${adrIds.size} decision(s).`,
);
for (const kind of ['changes', 'tests']) {
  const covered = ledgerCoverage.get(kind);
  if (!covered) continue;
  const missing = [...featureIds].filter((id) => !covered.has(id)).sort();
  console.log(
    `   ledgers/${kind}: ${covered.size}/${featureIds.size} feature(s) have one` +
      (missing.length ? ` — none yet for ${missing.join(', ')}` : ''),
  );
}
for (const n of notes) console.log(`   note: ${n}`);

if (problems.length === 0) {
  console.log(
    '✅ Every durable record refers to something that exists. ' +
      '(Ledger COVERAGE is reported above, never enforced — see this file\'s header.)',
  );
} else {
  const byKind = new Map();
  for (const p of problems) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  console.error(`\n❌ ${problems.length} integrity problem(s):\n`);
  for (const [kind, list] of byKind) {
    console.error(`   ${kind}`);
    for (const p of list) console.error(`     - ${p.detail}`);
    console.error('');
  }
  process.exitCode = 1;
}
