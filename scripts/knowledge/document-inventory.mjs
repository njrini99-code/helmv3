#!/usr/bin/env node
/**
 * document-inventory.mjs — render docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md.
 *
 * A GENERATED REPORT, not a new truth source. It answers one question for every
 * tracked Markdown file — *what kind of thing is this, and does anything route
 * to it* — so that "which of these 490 files should I believe" stops being a
 * judgement each reader makes alone.
 *
 * INPUT IS `git ls-files`, NEVER A FILESYSTEM WALK
 *
 * This repo has a recorded incident about exactly that: an internal
 * `.worktrees/` checkout held 4,314 .ts/.tsx files against src/'s 3,884, and
 * `find`/`grep` do not honour .gitignore, so searches returned two hits for
 * essentially every file and agents edited the copy nobody ships. Tracked git
 * state cannot contain a second checkout.
 *
 * WHY THERE IS NO LAST-TOUCH SHA COLUMN
 *
 * The plan asked for one. It cannot work here: this file is itself tracked, so
 * the commit that records every other file's last-touch SHA changes them, and a
 * `--check` gate over it would fail on its own commit — a flapping required
 * gate is worse than no column. Per-file staleness has a better answer that
 * .claude/rules/shipping.md already mandates: record an anchor SHA in the
 * document and let the reader run
 *
 *     git rev-list --count <sha>..HEAD -- <path>
 *
 * A date reads as current forever; a count does not.
 *
 * DETERMINISM is a requirement, not a nicety: `--check` re-renders and diffs, so
 * anything clock- or order-dependent would flap. Everything below iterates in
 * sorted order and nothing reads the clock.
 *
 * Usage:
 *   node scripts/knowledge/document-inventory.mjs             # write
 *   node scripts/knowledge/document-inventory.mjs --check     # verify, no write
 *   node scripts/knowledge/document-inventory.mjs --dead-refs [--update]
 *     Counts dead references (backticked repo paths that resolve to nothing
 *     tracked) restricted to the LIVING categories — REFERENCE,
 *     GENERATED_TRUTH, CURRENT_FEATURE, PROCESS_CONTRACT, RUNBOOK, POLICY,
 *     DESIGN_SPEC, STATE_SNAPSHOT, AGENT_SKILL — and ratchets the total
 *     against `.dead-refs-baseline.json`. Same shape as
 *     scripts/markdown-lint-ratchet.mjs: the baseline may only fall, never
 *     rise; `--update` rewrites it from the current count.
 *   node scripts/knowledge/document-inventory.mjs --lifecycle
 *     Lists every doc outside the attic (`docs/archive/`, `archive/`) whose
 *     own Status header reads SUPERSEDED, DONE or COMPLETE, and fails
 *     (exit 1) if that list is non-empty. The threshold is a hardcoded 0 —
 *     W1's lifecycle sweep already moved everything that qualifies into the
 *     attic, so this exists to catch the next one, not to carry a backlog.
 *   node scripts/knowledge/document-inventory.mjs --staleness
 *     Report only (always exit 0). For every tracked doc that carries an
 *     "Anchor SHA" — either inline (`Anchor SHA \`<sha>\`.`) or as a
 *     `git rev-list --count <sha>..HEAD -- <pathspec>` command — runs that
 *     count and flags anything over 200 commits since the anchor.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md');
const DEAD_REFS_BASELINE_PATH = resolve(ROOT, '.dead-refs-baseline.json');

/**
 * Categories this repo expects to stay correct day to day — the set the
 * plan names for the dead-reference ratchet. HISTORY_LEDGER, ARCHIVE, PLAN,
 * AUDIT_SNAPSHOT, ADR, INCIDENT, INDEX and UNKNOWN are excluded on purpose:
 * dated/historical records are allowed to name paths that no longer exist,
 * and re-litigating that here would just make the ratchet noisy.
 */
const LIVING_CATEGORIES = [
  'REFERENCE', 'GENERATED_TRUTH', 'CURRENT_FEATURE', 'PROCESS_CONTRACT',
  'RUNBOOK', 'POLICY', 'DESIGN_SPEC', 'STATE_SNAPSHOT', 'AGENT_SKILL',
];

/**
 * Categories. UNKNOWN is REQUIRED and is not a failure — the generator must not
 * guess a document into a class, because the next reader would treat the guess
 * as a decision somebody made.
 */
const CATEGORIES = [
  'POLICY', 'AGENT_SKILL', 'CURRENT_FEATURE', 'REFERENCE', 'GENERATED_TRUTH',
  'PROCESS_CONTRACT', 'RUNBOOK', 'DESIGN_SPEC', 'PLAN', 'AUDIT_SNAPSHOT',
  'STATE_SNAPSHOT', 'HISTORY_LEDGER', 'INCIDENT', 'ADR', 'INDEX', 'ARCHIVE',
  'UNKNOWN',
];

const POLICY_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md']);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Every tracked Markdown file EXCEPT this generator's own output.
 *
 * A report that reports on itself does not converge. This file names every
 * other path in backticks, so including it would add +1 incoming reference to
 * all ~1,690 of them and give itself an outgoing count equal to the size of its
 * own table — and regenerating would then change both, forever. Excluding it is
 * not a blind spot: nothing routes to it, and its own header states what it is.
 */
function tracked() {
  return git(['ls-files', '*.md', '*.mdx'])
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((f) => f !== 'docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md')
    .sort();
}

function categorise(path, body) {
  if (path.startsWith('docs/archive/') || path.startsWith('archive/')) return 'ARCHIVE';
  if (path.startsWith('memory/incidents/') && path.includes('/INC-')) return 'INCIDENT';
  if (path.startsWith('memory/decisions/ADR-')) return 'ADR';
  if (path.startsWith('memory/ledgers/')) return 'HISTORY_LEDGER';
  if (path.startsWith('memory/features/')) return 'CURRENT_FEATURE';
  if (path.startsWith('docs/generated/')) return 'GENERATED_TRUTH';
  // Scan the WHOLE body for an AUTOGEN marker: memory/projects/golfhelm.md
  // carries its first one at line 264, and a head-only scan classified a
  // generated inventory as UNKNOWN.
  if (/GENERATED by |DO NOT EDIT/i.test(body.slice(0, 2000)) || /<!-- AUTOGEN/.test(body)) return 'GENERATED_TRUTH';
  if (path.startsWith('.claude/rules/') || POLICY_FILES.has(path)) return 'POLICY';
  // Agent tooling: skills, subagent definitions and slash commands. Instructions
  // to an agent, not statements about the product — a real category rather than
  // 150-odd files sitting in UNKNOWN and making the bucket meaningless.
  if (/^\.claude\/(skills|agents|commands|output-styles)\//.test(path)) return 'AGENT_SKILL';
  if (path.startsWith('docs/ai-system/selfheal/') && /STATE-\d{4}-\d{2}-\d{2}\.md$/.test(path)) return 'STATE_SNAPSHOT';
  if (/-contract\.md$/.test(path) || path.startsWith('docs/ai-system/selfheal/')) return 'PROCESS_CONTRACT';
  if (path.startsWith('memory/system/')) return 'PROCESS_CONTRACT';
  if (path.startsWith('docs/superpowers/specs/')) return 'DESIGN_SPEC';
  if (path.startsWith('docs/superpowers/plans/') || /PLAN[_.-]|_PLAN|\/plans\//i.test(path)) return 'PLAN';
  if (path.startsWith('docs/audits/') || /AUDIT|FINDINGS|POSTMORTEM/i.test(path)) return 'AUDIT_SNAPSHOT';
  if (path.startsWith('docs/operations/') && /RUNBOOK|CI_RUNBOOK/i.test(path)) return 'RUNBOOK';
  if (/\/README\.md$/.test(path)) return 'INDEX';
  // Standing reference material: product/domain/architecture writing that is not
  // a per-feature current-state doc and not a dated snapshot.
  if (/^memory\/(context|brand|prompts|templates)\//.test(path)) return 'REFERENCE';
  if (/^docs\/(architecture|business|features|security|setup|research|lifting-lab)\//.test(path)) return 'REFERENCE';
  if (/^docs\/v3-/.test(path)) return 'REFERENCE';
  if (/STATE-\d{4}-\d{2}-\d{2}/.test(path) || /_\d{4}-\d{2}-\d{2}\.md$/.test(path)) return 'STATE_SNAPSHOT';
  return 'UNKNOWN';
}

/** Explicit lifecycle, read from the document rather than inferred. */
function lifecycle(path, body) {
  const head = body.slice(0, 1200);
  if (/^STATUS:\s*SUPERSEDED/mi.test(head) || /\*\*Status:\*\*\s*SUPERSEDED/i.test(head)) return 'superseded';
  if (/^STATUS:\s*HISTORICAL/mi.test(head)) return 'historical';
  if (path.startsWith('docs/archive/') || path.startsWith('archive/')) return 'archive';
  if (/GENERATED by |<!-- AUTOGEN/i.test(body.slice(0, 2000))) return 'generated';
  return 'current';
}

const AUTHORITY_RE = /\b(canonical|single source of truth|source of truth|authoritative)\b/i;
const PATH_RE = /`((?:docs|memory|src|scripts|config|supabase|\.claude|\.github)\/[A-Za-z0-9._*/-]+)`/g;

/**
 * Shared computation behind every mode. Returns one row per tracked
 * Markdown file plus the raw bodies (the staleness scan needs the body
 * text again, for the Anchor SHA pattern).
 */
function buildRows() {
  const files = tracked();
  const allTracked = new Set(git(['ls-files']).trim().split('\n').filter(Boolean));
  // Every ancestor directory of every tracked file, so a bare directory
  // reference (`src/lib/coachhelm/v2/`, no trailing glob) is not flagged
  // dead just because `allTracked` only ever holds file paths. Before this,
  // any doc naming a real, existing directory without a `*` suffix counted
  // as 100% dead-by-construction — 120 of the pre-fix 196 living-category
  // "dead references" were exactly this false positive (2026-09-06 audit).
  const trackedDirs = new Set();
  for (const f of allTracked) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i += 1) trackedDirs.add(parts.slice(0, i).join('/'));
  }

  const registry = yaml.load(readFileSync(resolve(ROOT, 'memory/registry.yml'), 'utf8'));
  const routed = new Set();
  for (const f of Object.values(registry.features ?? {})) {
    const d = f.docs ?? {};
    if (d.feature) routed.add(d.feature);
    for (const k of ['flows', 'ui', 'business_logic', 'incidents']) {
      for (const p of d[k] ?? []) routed.add(p);
    }
    for (const p of f.review?.required_docs ?? []) routed.add(p);
  }

  const bodies = new Map();
  const outgoing = new Map();
  const incoming = new Map(files.map((f) => [f, 0]));

  for (const f of files) {
    const body = readFileSync(resolve(ROOT, f), 'utf-8');
    bodies.set(f, body);
    const refs = new Set();
    for (const m of body.matchAll(PATH_RE)) refs.add(m[1]);
    outgoing.set(f, [...refs].sort());
  }
  for (const f of files) {
    for (const r of outgoing.get(f)) if (incoming.has(r)) incoming.set(r, incoming.get(r) + 1);
  }

  const rows = files.map((f) => {
    const body = bodies.get(f);
    const out = outgoing.get(f);
    const deadRefList = out.filter((r) => {
      if (r.includes('*')) return false;
      const clean = r.endsWith('/') ? r.slice(0, -1) : r;
      if (allTracked.has(r) || allTracked.has(clean)) return false;
      if (trackedDirs.has(clean)) return false;
      return true;
    });
    return {
      path: f,
      category: categorise(f, body),
      lifecycle: lifecycle(f, body),
      routed: routed.has(f),
      autogen: /<!-- AUTOGEN/.test(body),
      claimsAuthority: AUTHORITY_RE.test(body),
      incoming: incoming.get(f),
      outgoing: out.length,
      deadRefList,
      deadRefs: deadRefList.length,
    };
  });

  return { files, rows, bodies };
}

function main() {
  const check = process.argv.includes('--check');
  if (process.argv.includes('--dead-refs')) return runDeadRefs();
  if (process.argv.includes('--lifecycle')) return runLifecycle();
  if (process.argv.includes('--staleness')) return runStaleness();

  const { files, rows } = buildRows();

  const byCategory = new Map(CATEGORIES.map((c) => [c, []]));
  for (const r of rows) byCategory.get(r.category).push(r);

  const L = [];
  L.push('# Document authority inventory');
  L.push('');
  L.push('<!-- markdownlint-disable MD013 -->');
  L.push('<!-- GENERATED by scripts/knowledge/document-inventory.mjs — do not edit. -->');
  L.push('<!-- Regenerate: npm run knowledge:doc-inventory  ·  Verify: npm run knowledge:check -->');
  L.push('');
  L.push('Every tracked Markdown file, and what kind of thing it is. **A report, not');
  L.push('an authority** — where this disagrees with `docs/HELM_OS.md` or with a');
  L.push('document\'s own header, they are right and the classifier needs fixing.');
  L.push('');
  L.push('Input is `git ls-files`, never a filesystem walk: an internal `.worktrees/`');
  L.push('checkout once held more `.ts`/`.tsx` files than `src/` itself, and `find` does');
  L.push('not honour `.gitignore`. Tracked git state cannot contain a second checkout.');
  L.push('');
  L.push('**Columns.** `routed` — reachable from `memory/registry.yml`. `authority?` —');
  L.push('the text contains "canonical", "source of truth" or "authoritative", which is');
  L.push('a prompt to check, not a verdict. `dead refs` — repo-relative paths named in');
  L.push('backticks that no tracked file matches.');
  L.push('');
  L.push('There is deliberately no last-touch-SHA column: this file is tracked, so the');
  L.push('commit recording every other file\'s SHA would change them and a `--check`');
  L.push('gate would fail on its own commit. For per-file staleness use the rule');
  L.push('`.claude/rules/shipping.md` already sets — record an anchor SHA in the');
  L.push('document and run `git rev-list --count <sha>..HEAD -- <path>`.');
  L.push('');

  L.push('## Summary');
  L.push('');
  L.push('| Category | Files | Routed | Claims authority | Dead refs |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const c of CATEGORIES) {
    const list = byCategory.get(c);
    if (!list.length) continue;
    L.push(
      `| \`${c}\` | ${list.length} | ${list.filter((r) => r.routed).length} | ` +
        `${list.filter((r) => r.claimsAuthority).length} | ${list.reduce((a, r) => a + r.deadRefs, 0)} |`,
    );
  }
  L.push('');

  L.push('## Files');
  L.push('');
  for (const c of CATEGORIES) {
    const list = byCategory.get(c);
    if (!list.length) continue;
    if (c === 'ARCHIVE') {
      L.push(`### \`ARCHIVE\``);
      L.push('');
      L.push(`${list.length} file(s) under \`docs/archive/\` — historical evidence only, listed`);
      L.push('by count rather than by name because none of them is a reference and enumerating');
      L.push('them would bury everything above.');
      L.push('');
      const routedArchive = list.filter((r) => r.routed);
      if (routedArchive.length) {
        L.push('**Routed from `memory/registry.yml`, which archive files must never be:**');
        L.push('');
        for (const r of routedArchive) L.push(`- \`${r.path}\``);
        L.push('');
      }
      continue;
    }
    L.push(`### \`${c}\``);
    L.push('');
    L.push('| Path | Lifecycle | Routed | AUTOGEN | Authority? | In | Out | Dead |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of list) {
      L.push(
        `| \`${r.path}\` | ${r.lifecycle} | ${r.routed ? 'yes' : '-'} | ${r.autogen ? 'yes' : '-'} | ` +
          `${r.claimsAuthority ? 'yes' : '-'} | ${r.incoming} | ${r.outgoing} | ${r.deadRefs || '-'} |`,
      );
    }
    L.push('');
  }

  const next = `${L.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`;

  if (!check) {
    writeFileSync(OUT, next);
    console.log(`Wrote docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md (${files.length} tracked documents).`);
    return;
  }

  let current = '';
  try {
    current = readFileSync(OUT, 'utf-8');
  } catch {
    /* first run */
  }
  if (current === next) {
    console.log('✅ docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md matches the tracked tree.');
    return;
  }
  const a = current.split('\n');
  const b = next.split('\n');
  const i = a.findIndex((l, n) => l !== b[n]);
  console.error('\n❌ docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md is out of date.\n');
  console.error(`   first difference at line ${i + 1}`);
  console.error(`     file:     ${JSON.stringify(a[i] ?? '(end of file)')}`);
  console.error(`     expected: ${JSON.stringify(b[i] ?? '(end of file)')}`);
  console.error('\n   Run: npm run knowledge:doc-inventory\n');
  process.exitCode = 1;
}

/**
 * --dead-refs. Same ratchet shape as scripts/markdown-lint-ratchet.mjs: the
 * baseline is a floor that may only fall. Scoped to LIVING_CATEGORIES —
 * ARCHIVE, HISTORY_LEDGER, PLAN, AUDIT_SNAPSHOT, ADR, INCIDENT, INDEX and
 * UNKNOWN are excluded, matching what the plan calls the living set.
 */
function runDeadRefs() {
  const update = process.argv.includes('--update');
  const { rows } = buildRows();
  const living = rows.filter((r) => LIVING_CATEGORIES.includes(r.category) && r.deadRefs > 0);
  const total = living.reduce((a, r) => a + r.deadRefs, 0);

  living.sort((a, b) => a.path.localeCompare(b.path));
  if (living.length) {
    console.log(`document-inventory --dead-refs: ${total} dead reference(s) across ${living.length} living doc(s):\n`);
    for (const r of living) {
      console.log(`  ${r.path} (${r.category})`);
      for (const ref of r.deadRefList) console.log(`    -> \`${ref}\``);
    }
    console.log('');
  } else {
    console.log('document-inventory --dead-refs: 0 dead references across the living categories.');
  }

  if (update) {
    writeFileSync(DEAD_REFS_BASELINE_PATH, JSON.stringify({ total }, null, 2) + '\n', 'utf-8');
    console.log(`document-inventory --dead-refs: baseline updated — ${total} locked in ${DEAD_REFS_BASELINE_PATH}`);
    return;
  }

  if (!existsSync(DEAD_REFS_BASELINE_PATH)) {
    console.error(
      `document-inventory --dead-refs: baseline file not found at ${DEAD_REFS_BASELINE_PATH}.\n` +
        'Run `npm run docs:dead-refs -- --update` to create it.',
    );
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(DEAD_REFS_BASELINE_PATH, 'utf-8'));
  if (total > baseline.total) {
    console.error(
      `\ndocument-inventory --dead-refs: REGRESSION — ${baseline.total} -> ${total} ` +
        '(the baseline may only go down). Fix the new dead reference(s), or if the net ' +
        'count genuinely dropped, run `npm run docs:dead-refs -- --update`.\n',
    );
    process.exitCode = 1;
    return;
  }
  if (total < baseline.total) {
    console.log(
      `document-inventory --dead-refs: dropped (${baseline.total} -> ${total}) — run ` +
        '`npm run docs:dead-refs -- --update` to lock in the gain.',
    );
    return;
  }
  console.log(`document-inventory --dead-refs: OK — ${total} (at baseline, no regression).`);
}

/**
 * --lifecycle. A record's OWN Status header, not the heuristic `lifecycle()`
 * classifier above (which infers from category/AUTOGEN markers and would
 * miss a hand-written "Status: DONE" on an otherwise-REFERENCE doc). Fails
 * on anything outside the attic (`docs/archive/`, `archive/`) whose header
 * reads SUPERSEDED, DONE or COMPLETE — threshold is a hardcoded 0.
 */
const STATUS_HEADER_RE = /^\s*>?\s*\*{0,2}status\*{0,2}\s*:\s*\*{0,2}\s*([A-Za-z][A-Za-z0-9_-]*)/im;
const DONE_STATUSES = new Set(['SUPERSEDED', 'DONE', 'COMPLETE']);

function runLifecycle() {
  const { rows, bodies } = buildRows();
  const offenders = [];
  const exempted = [];
  for (const r of rows) {
    if (r.category === 'ARCHIVE') continue;
    if (r.path.startsWith('docs/archive/') || r.path.startsWith('archive/')) continue;
    const body = bodies.get(r.path);
    const m = STATUS_HEADER_RE.exec(body);
    if (!m) continue;
    const status = m[1].toUpperCase();
    if (!DONE_STATUSES.has(status)) continue;
    // "KEPT FOR HISTORY -- do not delete this file" is an existing, deliberate
    // repo convention (19 files as of 2026-09-06: docs/v3-master-plan.md,
    // docs/v3-wave-sequence.md, both docs/superpowers/plans/2026-04-22-*/
    // 00-design-contract.md and 15 more) for a SUPERSEDED doc that stays put
    // because live REFERENCE docs still cite it by path and line range (e.g.
    // docs/business/*.md cite `docs/v3-master-plan.md:80-99` dozens of
    // times). Moving those into the attic would sever every one of those
    // citations for no correctness gain — the doc author already decided
    // this file is not attic material. Respect that decision instead of
    // fighting it: exempt, but still report, so the exemption stays visible.
    if (/KEPT FOR HISTORY/i.test(body.slice(0, 2000))) {
      exempted.push({ path: r.path, status });
      continue;
    }
    offenders.push({ path: r.path, status });
  }
  offenders.sort((a, b) => a.path.localeCompare(b.path));
  exempted.sort((a, b) => a.path.localeCompare(b.path));

  if (exempted.length) {
    console.log(`document-inventory --lifecycle: ${exempted.length} record(s) marked done/superseded but exempted (explicit "KEPT FOR HISTORY"):`);
    for (const e of exempted) console.log(`  ${e.path} — Status: ${e.status}`);
    console.log('');
  }

  if (!offenders.length) {
    console.log('document-inventory --lifecycle: 0 done/superseded records outside the attic (excluding exemptions above).');
    return;
  }
  console.error(`document-inventory --lifecycle: ${offenders.length} record(s) outside the attic still read done/superseded:\n`);
  for (const o of offenders) console.error(`  ${o.path} — Status: ${o.status}`);
  console.error('\n  Move these into docs/archive/ (or the docs-attic tag), or correct the header.\n');
  process.exitCode = 1;
}

/**
 * --staleness. Report only — never fails. Every tracked doc that carries an
 * "Anchor SHA" gets `git rev-list --count <sha>..HEAD -- <pathspec>` run
 * for real; anything over 200 is flagged as a note, not a failure.
 */
const REV_LIST_CMD_RE = /`git rev-list --count ([0-9a-f]{7,40})\.\.HEAD -- ((?:'[^']+'|"[^"]+"|\S+)(?:\s+(?:'[^']+'|"[^"]+"|\S+))*)`/;
const ANCHOR_SHA_RE = /anchor sha[^`\n]{0,60}`([0-9a-f]{7,40})`/i;
const STALENESS_THRESHOLD = 200;

function splitPathspec(raw) {
  const out = [];
  const re = /'([^']+)'|"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(raw))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function runStaleness() {
  const { rows, bodies } = buildRows();
  const findings = [];
  for (const r of rows) {
    if (r.category === 'ARCHIVE') continue;
    const body = bodies.get(r.path);
    let sha;
    let pathspec = ['src'];
    const cmd = REV_LIST_CMD_RE.exec(body);
    if (cmd) {
      sha = cmd[1];
      pathspec = splitPathspec(cmd[2]);
    } else {
      const anchor = ANCHOR_SHA_RE.exec(body);
      if (anchor) sha = anchor[1];
    }
    if (!sha) continue;

    let count;
    try {
      count = parseInt(git(['rev-list', '--count', `${sha}..HEAD`, '--', ...pathspec]).trim(), 10);
    } catch {
      findings.push({ path: r.path, sha, pathspec: pathspec.join(' '), count: null });
      continue;
    }
    findings.push({ path: r.path, sha, pathspec: pathspec.join(' '), count });
  }
  findings.sort((a, b) => a.path.localeCompare(b.path));

  if (!findings.length) {
    console.log('document-inventory --staleness: no tracked doc carries an Anchor SHA.');
    return;
  }
  console.log(`document-inventory --staleness: ${findings.length} doc(s) carry an Anchor SHA:\n`);
  for (const f of findings) {
    if (f.count === null) {
      console.log(`  ${f.path} — anchor ${f.sha} not resolvable (unknown commit) against ${f.pathspec}`);
      continue;
    }
    const flag = f.count > STALENESS_THRESHOLD ? '  <-- STALE (> 200)' : '';
    console.log(`  ${f.path} — ${f.count} commit(s) since ${f.sha} on ${f.pathspec}${flag}`);
  }
  const stale = findings.filter((f) => f.count !== null && f.count > STALENESS_THRESHOLD);
  console.log(`\n${stale.length} of ${findings.length} doc(s) are past the ${STALENESS_THRESHOLD}-commit staleness threshold. Report only — this never fails.`);
}

// Only run when invoked directly — same guard, same reason, as
// scripts/regen-docs.mjs: without it, importing this module for its pure
// helper functions (categorise, lifecycle, splitPathspec, the status/anchor
// regexes) would also re-render or re-check the live inventory as a side
// effect, which is both slow and makes those helpers untestable in
// isolation.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) main();

export {
  categorise,
  lifecycle,
  buildRows,
  splitPathspec,
  LIVING_CATEGORIES,
  DONE_STATUSES,
  STATUS_HEADER_RE,
  REV_LIST_CMD_RE,
  ANCHOR_SHA_RE,
  STALENESS_THRESHOLD,
};
