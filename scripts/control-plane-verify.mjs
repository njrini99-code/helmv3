#!/usr/bin/env node
/**
 * Ask the control plane whether it is still true.
 *
 *   npm run control-plane:verify           static + runtime (local)
 *   npm run control-plane:verify:static    CI-safe subset, no user-global deps
 *
 * THIS VERIFIER IS READ-ONLY. It does not clean up, regenerate, delete a
 * branch, or edit a config. A verifier that repairs what it inspects cannot
 * tell you what was wrong — and the previous docs gate did exactly that:
 * it re-ran the generator and diffed, so the only way to learn the docs were
 * stale was to have already fixed them.
 *
 * EXIT SEMANTICS
 *
 *   0  VERIFIED           every check passed, or is a named acknowledged gap
 *   1  CONTROL FAILURE    a control that should hold does not
 *   2  UNKNOWN            a required state could not be established
 *
 * UNKNOWN never becomes PASS. That rule is the whole point: this repo's
 * recurring failure is not missing controls, it is controls that stopped
 * running while their documentation stayed put.
 *
 *   guard-bash.sh        existed, unwired, deleted
 *   guard-sql.sh         existed, unwired, deleted
 *   retire-worktrees.sh  existed, never invoked
 *   four rule files      claimed hooks that were gone
 *   worktree GC          keyed on a ref GitHub deletes on merge
 *   Docs Regen           opened a PR that sat open instead of keeping main current
 *
 * An ACKNOWLEDGED_GAP is different from an UNKNOWN: it has an id, an owner, a
 * reason and a date in config/control-plane-gaps.json, and it is PRINTED on
 * every run so it cannot fade.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// The worktree-policy vocabulary has ONE definition. A second literal here is
// how the two halves of a rule drift apart.
import { WORKTREE_POLICIES } from './lib/worktree-lifecycle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The tree under inspection. Overridable so failure injections can run against
 * a disposable COPY and never against the live checkout — §21's requirement,
 * and the direct regression for the #1676 near miss where a fixture test
 * resolved its target back to the real repo and removed a live worktree.
 *
 * Safe to expose because this verifier is READ-ONLY. It never writes, deletes,
 * regenerates or mutates anything, so pointing it somewhere else can produce a
 * wrong ANSWER but never a wrong ACTION.
 */
const ROOT = resolve(process.env.HELM_CONTROL_PLANE_ROOT || resolve(HERE, '..'));

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const UNKNOWN = 'UNKNOWN';
export const GAP = 'ACKNOWLEDGED_GAP';

const STATIC_ONLY = process.argv.includes('--static');
const JSON_OUT = process.argv.includes('--json');

const results = [];
const add = (section, id, state, detail) => results.push({ section, id, state, detail });

/**
 * The GitHub CLI, overridable for tests. Same reason as HELM_CONTROL_PLANE_ROOT
 * and the lifecycle tool's HELM_PR_LOOKUP: a check that decides whether a
 * control is in place has to be provable able to FAIL, and the only honest way
 * to prove that is to hand it the failing answer. Read-only either way.
 */
const GH = process.env.HELM_CP_GH || 'gh';

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function git(args, cwd = ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}
function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Fold check states into a process result. Exported so the precedence is
 * testable without running the whole verifier.
 *
 * UNKNOWN outranks FAIL: if we could not establish some required state, the
 * run's honest summary is "unknown", not "these specific things are broken" —
 * the latter implies everything else was checked.
 */
/**
 * TWO DIFFERENT THINGS, and the summary line used to print one under the other's
 * name.
 *
 *   registered_gap_count    config/control-plane-gaps.json -> gaps[]
 *                           the authority. Five, on 2026-08-30.
 *   gap_state_check_count   checks that returned ACKNOWLEDGED_GAP this run.
 *                           One, because only sandbox/filesystem reports that
 *                           state; the other four gaps have no check at all.
 *
 * The final line read "1 acknowledged gap(s)" against five registered gaps —
 * a number that made four owned, dated, closing-condition-bearing gaps invisible
 * on the one output anybody reads. Exit-code precedence is untouched: gaps never
 * change it, and UNKNOWN still outranks FAIL.
 */
export function summarise(all, registeredGaps = []) {
  const fails = all.filter((r) => r.state === FAIL);
  const unknowns = all.filter((r) => r.state === UNKNOWN);
  const counts = {
    passes: all.filter((r) => r.state === PASS).length,
    registered_gap_count: registeredGaps.length,
    gap_state_check_count: all.filter((r) => r.state === GAP).length,
  };
  if (unknowns.length) return { outcome: UNKNOWN, code: 2, fails, unknowns, ...counts };
  if (fails.length) return { outcome: 'CONTROL FAILURE', code: 1, fails, unknowns, ...counts };
  return { outcome: 'VERIFIED', code: 0, fails, unknowns, ...counts };
}

/**
 * Open-PR disposition residue.
 *
 * The registry is CURRENT STATE: an open PR needs a row, and a row for a PR
 * that is no longer open is residue. Both directions fail, and both are load-
 * bearing — this file carried ACTIVE rows for #1623, #1638, #1679 and #1680
 * long after they closed.
 *
 * THE CLOSING TRAP, and the one exception that removes it.
 *
 * A PR that carries its own row makes `main` fail this check the instant it
 * merges. Measured 2026-08-30: #1687 merged, and `open-pr-residue` went red
 * seconds later. The only two ways out were a second PR — which needs its own
 * row, so the same thing happens again — or a direct push to main. The direct
 * push is what actually happened, twice, bypassing branch protection. A control
 * whose only exit is bypassing another control is a defect in the first one.
 *
 * The exception is deliberately the narrowest thing that closes it:
 *
 *     row's PR is no longer OPEN
 *     AND GitHub says it MERGED
 *     AND its merge_commit_sha === the verified checkout's HEAD
 *          -> TRANSITIONALLY CLOSED, not a failure
 *
 * That is exact merge IDENTITY, not "merged recently", "merged today", or
 * "merged within N commits" — all three are time or ancestry approximations
 * that widen silently as history grows. This one narrows on its own: the
 * moment any other commit lands on main, HEAD moves and the row fails again.
 * It survives its own merge, and nothing more. The next ordinary PR clears it
 * while adding its own row, which is the workflow that removes the trap.
 *
 * THE SAME TRAP, BEFORE THE MERGE. A row that lives in its own PR is absent
 * from main for the PR's whole flight, so "open PR with no recorded
 * disposition" fails main from the moment the PR opens until it lands. Adding
 * the row in an EARLIER PR only moves the problem, and pushing it straight to
 * main is the bypass this whole change exists to remove. Second exception,
 * proved the same way — by identity, not by assumption:
 *
 *     the row is absent from the verified checkout
 *     AND it IS present in config/open-pr-dispositions.json at that PR's OWN head
 *          -> IN FLIGHT, not unclassified
 *
 * A row that cannot be read at the PR head, or is genuinely not there, still
 * fails. This distinguishes "arriving" from "missing", which is the same
 * distinction as everything else here: #1623 sat open for weeks with no row
 * anywhere, and must still fail.
 *
 * Everything else about a stale row still fails, including the cases where the
 * evidence for the exception is missing. Refusing to grant a RELAXATION on
 * unreadable evidence is the safe direction; it is not the same as the
 * fail-safe on the open-PR listing itself, which stays UNKNOWN, because there
 * we cannot even establish what is open.
 *
 * facts:
 *   openPrs      [{ number, ref }]     PRs GitHub reports OPEN
 *   recorded     { '<n>': { disposition, worktree_policy } }
 *   mergeFacts   { '<n>': { lookup: 'OK'|'FAILED', state, mergeCommitSha } }
 *   headSha      string|null           full sha of the verified checkout's HEAD
 *   inFlightRows { '<n>': true|false|null }  row present at that PR's own head;
 *                                            null = could not read, which fails
 */
export function classifyDispositionResidue(facts) {
  const f = facts ?? {};
  const openPrs = f.openPrs ?? [];
  const recorded = f.recorded ?? {};
  const mergeFacts = f.mergeFacts ?? {};
  const headSha = f.headSha ?? null;

  const openSet = new Set(openPrs.map((p) => String(p.number)));
  const keys = Object.keys(recorded);
  const problems = [];
  const transitional = [];

  const inFlightRows = f.inFlightRows ?? {};
  const inFlight = [];
  const unclassified = [];
  for (const pr of openPrs.filter((p) => !recorded[String(p.number)])) {
    if (inFlightRows[String(pr.number)] === true) inFlight.push(String(pr.number));
    else unclassified.push(`${pr.number} ${pr.ref ?? ''}`.trim());
  }
  if (unclassified.length) {
    problems.push('open PRs with no recorded disposition: ' + unclassified.join('; '));
  }

  const rejected = [];
  for (const k of keys.filter((k) => !openSet.has(k))) {
    const m = mergeFacts[k];
    if (!m || m.lookup !== 'OK') {
      rejected.push(`#${k} — merge state could not be read, and the exception needs exact merge identity`);
    } else if (m.state !== 'MERGED') {
      rejected.push(`#${k} — closed without merging`);
    } else if (!m.mergeCommitSha) {
      rejected.push(`#${k} — MERGED but GitHub reports no merge commit`);
    } else if (!headSha) {
      rejected.push(`#${k} — could not read local HEAD to compare against`);
    } else if (m.mergeCommitSha !== headSha) {
      // The remedy, not just the diagnosis. This row was TRANSITIONALLY closed
      // while HEAD sat on its merge commit; the grace ends the moment any other
      // commit lands. A session that meets this failure without the explanation
      // has no way to tell it from an ordinary stale row, and the fix costs
      // nothing: delete it in the PR already being opened.
      rejected.push(`#${k} — merged at ${m.mergeCommitSha.slice(0, 9)}, HEAD has moved past it; its transitional grace has ENDED — delete this row in the PR you are already opening`);
    } else {
      transitional.push(k);
    }
  }
  if (rejected.length) {
    problems.push('disposition rows for PRs no longer open: ' + rejected.join(' | '));
  }

  const badPolicy = keys
    .filter((k) => openSet.has(k))
    .filter((k) => !WORKTREE_POLICIES.has(recorded[k]?.worktree_policy))
    .map((k) => '#' + k + ' worktree_policy=' + (recorded[k]?.worktree_policy ?? 'unset'));
  if (badPolicy.length) {
    problems.push('worktree_policy missing or outside {KEEP, PARK_IF_REPRODUCIBLE}: ' + badPolicy.join('; '));
  }

  return { problems, transitional, inFlight };
}

/**
 * The two aggregate contexts this repo's own rules name as the pre-merge
 * gates (.claude/rules/code-review-tooling.md). CodeQL's `Analyze (...)`
 * contexts are required today too, but their names track the languages CodeQL
 * scans, so pinning them here would make a language change read as a control
 * regression. The aggregates are what a RENAME breaks — and a rename is exactly
 * what made every PR unsatisfiable on 2026-08-19, against a context called
 * `Review Gate / all` that posts nothing.
 *
 * `Smoke checks` was the third entry until 2026-09-02. It was playwright.yml's
 * build-only job — `npm ci` + `next build`, the same steps ci.yml's `Next
 * build` runs inside `CI aggregate` — so it doubled every PR's build for no
 * second fact. The job and the required context were removed together (the
 * context first, via the branch-protection API, so no PR was ever left waiting
 * on a name nothing posts).
 */
export const REQUIRED_AGGREGATE_CONTEXTS = ['CI aggregate', 'Review Gate aggregate'];

/**
 * Branch protection on main, as a fact the verifier reads rather than something
 * a human has to remember.
 *
 * On 2026-08-30 two unreviewed commits reached main. Both printed "Bypassed
 * rule violations for refs/heads/main: Changes must be made through a pull
 * request", and both were green on all six required contexts afterwards — so
 * the state of main was never the problem. The problem is that the bypass was
 * standing, available to ordinary agent credentials, and nothing noticed.
 *
 * TWO MECHANISMS, and reading only one is how a check becomes decorative.
 * Classic branch protection reports `enforce_admins` on
 * /branches/main/protection. Repository RULESETS are a separate system with
 * their own bypass_actors list and report on /rulesets — measured 2026-08-30,
 * this repo has classic protection and zero rulesets, but a bypass reinstated
 * through the rulesets UI would be invisible to a check that reads only the
 * first endpoint.
 *
 * A KNOWN condition is a gap only while it is REGISTERED. If the admin bypass
 * exists and config/control-plane-gaps.json does not carry
 * MAIN_ADMIN_BYPASS_AVAILABLE, that is a FAIL, not a gap — otherwise a check
 * could quietly excuse a condition nobody owns.
 *
 * facts:
 *   lookup        'OK' | 'FAILED'
 *   protection    the /branches/main/protection body, or null
 *   rulesets      [{ name, enforcement, targetsMain, bypassActorCount }] | null
 *   gapRegistered bool   MAIN_ADMIN_BYPASS_AVAILABLE is open in gaps.json
 */
export function classifyBranchProtection(facts) {
  const f = facts ?? {};
  if (f.lookup !== 'OK') {
    return { state: UNKNOWN, detail: 'could not read branch protection for main' };
  }
  if (!f.protection) {
    return { state: FAIL, detail: 'main reports no branch protection at all' };
  }

  const contexts = f.protection.required_status_checks?.contexts ?? [];
  const missing = REQUIRED_AGGREGATE_CONTEXTS.filter((c) => !contexts.includes(c));
  if (missing.length) {
    return { state: FAIL, detail: `main no longer requires: ${missing.join(', ')}` };
  }

  if (f.rulesets === null || f.rulesets === undefined) {
    return { state: UNKNOWN, detail: 'protection reads fine, but repository rulesets could not be listed — a ruleset bypass would be invisible' };
  }
  const bypassing = f.rulesets.filter((r) => r.enforcement === 'active' && r.targetsMain && r.bypassActorCount > 0);
  if (bypassing.length) {
    return {
      state: FAIL,
      detail: `ruleset(s) targeting main carry bypass actors: ${bypassing.map((r) => `${r.name} (${r.bypassActorCount})`).join(', ')}`,
    };
  }

  if (f.protection.enforce_admins?.enabled !== true) {
    return f.gapRegistered
      ? { state: GAP, detail: 'enforce_admins is off — administrators may bypass the PR and required-check rules (MAIN_ADMIN_BYPASS_AVAILABLE)' }
      : { state: FAIL, detail: 'enforce_admins is off and no MAIN_ADMIN_BYPASS_AVAILABLE gap is registered — an unowned standing bypass' };
  }

  return {
    state: PASS,
    detail: `protected, ${contexts.length} required context(s), enforce_admins on, no ruleset bypass`,
  };
}

// ---------------------------------------------------------------------------
// STATIC — everything provable from the repository alone.

function checkGenerated() {
  for (const [id, args] of [
    ['enforcement-inventory-current', ['scripts/gen-enforcement-inventory.mjs', '--check']],
    ['generated-docs-current', ['scripts/regen-docs.mjs', '--check']],
    ['tool-authority-matrix-current', ['scripts/gen-tool-authority.mjs', '--check']],
  ]) {
    const r = sh('node', args);
    add('generated', id, r.status === 0 ? PASS : FAIL,
      r.status === 0 ? 'matches its sources' : (r.stderr || r.stdout || '').trim().split('\n')[0]);
  }
}

function checkHookWiring() {
  const settings = readJson(resolve(ROOT, '.claude/settings.json'));
  if (!settings) return add('hooks', 'hook-config-readable', UNKNOWN, 'could not read .claude/settings.json');

  const rows = [];
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const e of entries ?? []) {
      for (const h of e.hooks ?? []) rows.push({ event, matcher: e.matcher ?? '', command: h.command ?? '' });
    }
  }
  if (!rows.length) return add('hooks', 'hooks-declared', UNKNOWN, 'no hooks declared at all');

  const missing = rows
    .map((r) => (r.command.match(/[^\s"']*\.claude\/hooks\/[A-Za-z0-9._/-]+/) ?? [])[0])
    .filter(Boolean)
    .map((p) => p.replace(/^"?\$\{?CLAUDE_PROJECT_DIR\}?"?/, '').replace(/^\/+/, ''))
    .filter((p) => !existsSync(resolve(ROOT, p)));
  add('hooks', 'hook-scripts-exist', missing.length ? FAIL : PASS,
    missing.length ? `configured hooks whose script is absent: ${missing.join(', ')}` : `${rows.length} configured hooks all resolve`);

  // A blocking hook whose matcher cannot reach the tool it claims to guard is
  // the exact shape of guard-bash.sh: wired, and unable to fire.
  const pre = rows.filter((r) => r.event === 'PreToolUse');
  const canary = pre.filter((r) => /guard-canonical-write/.test(r.command));
  if (!canary.length) {
    add('hooks', 'canonical-write-guard-wired', FAIL, 'no PreToolUse hook runs guard-canonical-write.mjs');
  } else {
    const reaches = /Write|Edit|MultiEdit/.test(canary[0].matcher);
    add('hooks', 'canonical-write-guard-reachable', reaches ? PASS : FAIL,
      reaches ? `matcher '${canary[0].matcher}' can reach the tools it guards` : `matcher '${canary[0].matcher}' cannot reach Write/Edit/MultiEdit`);
  }
}

function checkClaimConsistency() {
  // Prose must not claim stronger enforcement than the generated inventory.
  const inv = existsSync(resolve(ROOT, 'docs/CONTROL_PLANE_ENFORCEMENT.md'))
    ? readFileSync(resolve(ROOT, 'docs/CONTROL_PLANE_ENFORCEMENT.md'), 'utf-8')
    : null;
  if (!inv) return add('claims', 'enforcement-inventory-present', UNKNOWN, 'docs/CONTROL_PLANE_ENFORCEMENT.md missing');

  const files = ['CLAUDE.md', 'AGENTS.md', '.claude/rules/database.md', '.claude/rules/shipping.md', '.claude/rules/autonomy.md'];
  // Quoted spans are corrections recording what the old text said; an assertion
  // is what the file says in its own voice.
  const strip = (t) => t.replace(/[“”"][^“”"]*[“”"]/g, ' ');
  const banned = [
    { re: /are blocked by a PreToolUse hook/i, why: 'claims a destructive-SQL hook that does not exist' },
    { re: /A governed edit is blocked until/i, why: 'claims prevention where only Stop-time detection exists' },
    { re: /they block the shapes\s+that actually matter/i, why: 'claims hooks block force push / destructive SQL / recursive rm' },
  ];
  const offenders = [];
  for (const f of files) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    const text = strip(readFileSync(p, 'utf-8'));
    for (const b of banned) if (b.re.test(text)) offenders.push(`${f}: ${b.why}`);
  }
  add('claims', 'no-prose-overclaims-enforcement', offenders.length ? FAIL : PASS,
    offenders.length ? offenders.join(' | ') : 'no file asserts enforcement the inventory does not show');
}

function checkToolStaticAuthority() {
  const decl = readJson(resolve(ROOT, 'config/tool-authority.json'));
  const obs = readJson(resolve(ROOT, 'config/control-plane-observations.json'));
  if (!decl) return add('tools', 'authority-declared', UNKNOWN, 'config/tool-authority.json missing');
  if (!obs) return add('tools', 'observations-present', UNKNOWN, 'config/control-plane-observations.json missing');

  const declared = new Set();
  for (const s of decl.services) {
    declared.add(s.authority);
    for (const a of s.alternates ?? []) declared.add(a.namespace);
  }
  const unrecorded = [...declared].filter(
    (n) => !(obs.observations ?? []).some((o) => o.namespace === n),
  );
  add('tools', 'every-declared-namespace-observed', unrecorded.length ? FAIL : PASS,
    unrecorded.length ? `declared but never observed: ${unrecorded.join(', ')}` : `${declared.size} namespaces declared and observed`);
}

/**
 * MCP deny rules vs the connector ids the session actually exposes.
 *
 * Permission rules match tool NAMES. Measured 2026-09-01: the account
 * connectors appear in the session as `mcp__<uuid>__<tool>` and under NO
 * `mcp__claude_ai_*` name, so every MCP deny rule written against the display
 * name matched nothing the session could call — while the enforcement
 * inventory reported them EXERCISED. The UUID spellings are denied too now, and
 * config/mcp-connector-ids.json is the one place the ids live.
 *
 * Two things this check can establish from the repo alone, and one it cannot:
 *
 *   FAIL   a deny rule names a UUID the file does not record — a rule nobody
 *          can trace to an observation
 *   FAIL   a display-name deny rule has no twin under the recorded UUID prefix
 *          for the same service — the spelling that runs is uncovered
 *   GAP    both hold, but the id's stability across sessions is UNVERIFIED
 *          (MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS) — a script cannot
 *          see the live tool inventory, so consistent is the most it can say
 *
 * PASS is reserved for a connector whose stability has been recorded as
 * VERIFIED in the file, which only repeated measurement can earn.
 */
export function classifyMcpDenyConnectorIds(facts) {
  const f = facts ?? {};
  const deny = f.deny ?? [];
  const connectors = f.connectors ?? [];
  const gapRegistered = f.gapRegistered === true;

  const recorded = new Map(connectors.filter((c) => c?.id).map((c) => [c.id, c]));
  const uuidRule = /^mcp__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})__(.+)$/;

  const untraceable = deny
    .map((r) => r.match(uuidRule))
    .filter((m) => m && !recorded.has(m[1]))
    .map((m) => m[0]);
  if (untraceable.length) {
    return { state: FAIL, detail: `deny rules name connector ids config/mcp-connector-ids.json does not record: ${untraceable.join(', ')}` };
  }

  const uncovered = [];
  for (const c of recorded.values()) {
    if (!c.display_name_prefix) continue;
    for (const r of deny.filter((x) => x.startsWith(c.display_name_prefix))) {
      const tool = r.slice(c.display_name_prefix.length);
      if (!deny.includes(`mcp__${c.id}__${tool}`)) uncovered.push(`${r} -> mcp__${c.id}__${tool}`);
    }
  }
  if (uncovered.length) {
    return { state: FAIL, detail: `display-name deny rules with no twin under the spelling the session exposes: ${uncovered.join(', ')}` };
  }

  const unverified = [...recorded.values()].filter((c) => !/^VERIFIED/i.test(String(c.stability ?? '')));
  if (unverified.length) {
    const ids = unverified.map((c) => `${c.service}=${c.id.slice(0, 8)}… (observed ${c.observed_at ?? '?'})`).join(', ');
    return gapRegistered
      ? { state: GAP, detail: `rules and recorded ids agree; id stability across sessions UNVERIFIED for ${ids} (MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS)` }
      : { state: FAIL, detail: `id stability UNVERIFIED for ${ids} and no MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS gap is registered — an unowned bet` };
  }
  return { state: PASS, detail: `${recorded.size} connector id(s) recorded as VERIFIED, every display-name deny rule has its UUID twin` };
}

function checkMcpDenyConnectorIds() {
  const settings = readJson(resolve(ROOT, '.claude/settings.json'));
  const ids = readJson(resolve(ROOT, 'config/mcp-connector-ids.json'));
  if (!settings) return add('tools', 'mcp-deny-connector-ids', UNKNOWN, 'could not read .claude/settings.json');
  if (!ids) return add('tools', 'mcp-deny-connector-ids', UNKNOWN, 'config/mcp-connector-ids.json missing or unreadable — the UUID deny rules cannot be traced to an observation');
  const gaps = readJson(resolve(ROOT, 'config/control-plane-gaps.json'))?.gaps ?? [];
  const v = classifyMcpDenyConnectorIds({
    deny: settings.permissions?.deny ?? [],
    connectors: ids.connectors ?? [],
    gapRegistered: gaps.some((g) => g.id === 'MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS'),
  });
  add('tools', 'mcp-deny-connector-ids', v.state, v.detail);
}

function checkWorktreePolicy() {
  const src = existsSync(resolve(ROOT, 'scripts/new-worktree.sh'))
    ? readFileSync(resolve(ROOT, 'scripts/new-worktree.sh'), 'utf-8')
    : null;
  if (!src) return add('lifecycle', 'worktree-creator-present', UNKNOWN, 'scripts/new-worktree.sh missing');

  const budget = /check-mutation-budget\.mjs/.test(src);
  const reserve = /HELM_DISK_RESERVE_GIB|WORKTREE_MIN_FREE_GIB/.test(src);
  // Order matters: the budget must be enforced BEFORE `git worktree add`, or a
  // refusal has already cost what it was refusing to spend.
  //
  // Line-based and comment-aware on purpose. A first draft used indexOf over the
  // whole file and matched `git worktree add` inside the script's own help text
  // at line 15, reporting a false FAIL against a correctly-ordered script. That
  // is the same substring-is-not-a-mechanism error the enforcement generator
  // made on its first run.
  const lines = src.split('\n');
  const execIdx = (needle) =>
    lines.findIndex((l) => !l.trimStart().startsWith('#') && l.includes(needle));
  const addIdx = execIdx('git worktree add');
  const budgetIdx = execIdx('check-mutation-budget.mjs');
  const beforeAlloc = budgetIdx !== -1 && addIdx !== -1 && budgetIdx < addIdx;

  add('lifecycle', 'mutation-budget-enforced', budget && beforeAlloc ? PASS : FAIL,
    !budget ? 'new-worktree.sh does not consult the mutation budget'
      : !beforeAlloc ? 'budget is checked AFTER git worktree add — a refusal would already have allocated'
        : 'budget enforced before allocation');
  add('lifecycle', 'disk-reserve-enforced', reserve ? PASS : FAIL,
    reserve ? 'reserve checked before allocation' : 'no disk reserve in the worktree creator');
}

function checkControlPlaneTests() {
  // This check spawns vitest. When the verifier is itself invoked FROM a test
  // — which the failure-injection suite does, deliberately, to prove the
  // verifier discriminates — that nests vitest inside vitest under full-suite
  // load and the inner run becomes unreliable.
  //
  // Skipping reports UNKNOWN, never PASS. A check that did not run is not a
  // check that passed, and this file exists to keep that distinction.
  if (process.env.HELM_CP_SKIP_NESTED_TESTS === '1') {
    return add('tests', 'control-plane-suites', UNKNOWN,
      'skipped: nested invocation (HELM_CP_SKIP_NESTED_TESTS=1) — not run, therefore not passed');
  }
  const r = sh('npx', ['vitest', 'run', '--project', 'unit',
    'src/test/scripts/worktree-lifecycle.test.ts',
    'src/test/scripts/control-plane-enforcement.test.ts',
    'src/test/scripts/repo-guards.test.ts',
    'src/test/scripts/new-worktree-precheck.test.ts',
    'src/test/scripts/control-plane-verify.test.ts']);
  const m = (r.stdout ?? '').match(/Tests\s+(\d+) passed/);
  add('tests', 'control-plane-suites', r.status === 0 ? PASS : FAIL,
    r.status === 0 ? `${m ? m[1] : '?'} control-plane assertions pass` : 'control-plane suites failing');
}

// ---------------------------------------------------------------------------
// RUNTIME — needs this machine, this checkout, the network.

function checkRepoIdentity() {
  const top = git(['rev-parse', '--show-toplevel']);
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  if (!top || !head) return add('repo', 'identity', UNKNOWN, 'not inside a git repository');
  add('repo', 'identity', originMain ? PASS : UNKNOWN,
    originMain ? `${top} @ ${head.slice(0, 9)} (origin/main ${originMain.slice(0, 9)})` : 'origin/main unresolvable');
}

function checkDisk() {
  const r = sh('/bin/df', ['-Pk', ROOT]);
  const line = (r.stdout ?? '').trim().split('\n')[1];
  if (!line) return add('disk', 'free-space', UNKNOWN, 'could not measure free space');
  const freeGib = Math.floor(Number(line.split(/\s+/)[3]) / 1048576);
  const reserve = Number(process.env.HELM_DISK_RESERVE_GIB ?? 12);
  const budget = Number(process.env.HELM_INSTALL_BUDGET_GIB ?? 5);
  add('disk', 'free-space', freeGib >= reserve ? PASS : FAIL,
    `${freeGib} GiB free; reserve ${reserve}; install budget ${budget}; install threshold ${reserve + budget}`);
}

function checkLifecycleRuntime() {
  const r = sh('node', ['scripts/worktree-lifecycle.mjs', '--json']);
  if (r.status !== 0 && !r.stdout) return add('lifecycle', 'reporter', UNKNOWN, 'lifecycle reporter produced nothing');
  // Exit 2 from the reporter means INFRASTRUCTURE_FAILURE: every PR lookup
  // failed, so the rows are shaped correctly and say nothing. Short-circuit
  // BEFORE the checks below, which would otherwise read an evidence blackout
  // as `PASS ... 0 NO_UPSTREAM_UNIQUE_WORK` — a green check standing on no
  // evidence, which is the failure this whole file exists to refuse.
  if (r.status === 2) {
    return add('lifecycle', 'reporter', UNKNOWN,
      'lifecycle reporter returned INFRASTRUCTURE_FAILURE (every PR lookup failed) — no lifecycle claim can be made from this run');
  }
  let rows;
  try {
    rows = JSON.parse(r.stdout);
  } catch {
    return add('lifecycle', 'reporter', UNKNOWN, 'lifecycle reporter output unparseable');
  }

  // Safe GC waiting to happen is itself a control failure: it means the
  // retire-at-merge step was skipped, which is the original leak.
  const retirable = rows.filter((x) => x.branchVerdict === 'DELETE_MERGED_EXACT' && x.worktree === 'none');
  add('lifecycle', 'no-retirable-branches-waiting', retirable.length ? FAIL : PASS,
    retirable.length ? `${retirable.length} branch(es) provably merged and deletable: ${retirable.map((x) => x.branch).join(', ')}` : 'no safe GC pending');

  const budgetRes = sh('node', ['scripts/check-mutation-budget.mjs', '--json']);
  let bd = null;
  try {
    bd = JSON.parse(budgetRes.stdout);
  } catch { /* fall through */ }
  if (!bd) add('lifecycle', 'mutation-budget', UNKNOWN, 'could not evaluate the mutation budget');
  else add('lifecycle', 'mutation-budget', bd.decision.ok || bd.decision.used <= bd.decision.budget ? PASS : FAIL,
    `${bd.decision.used}/${bd.decision.budget} mutation workspace(s) in use`);

  const unknowns = rows.filter((x) => String(x.branchVerdict).startsWith('UNKNOWN'));
  const unique = rows.filter((x) => x.branchVerdict === 'NO_UPSTREAM_UNIQUE_WORK');
  add('lifecycle', 'unclassified-branches', PASS,
    `${unknowns.length} UNKNOWN_*, ${unique.length} NO_UPSTREAM_UNIQUE_WORK (preserved deliberately — never auto-deleted)`);
}

function checkDangerousUpstreams() {
  const raw = git(['for-each-ref', '--format=%(refname:short) %(upstream:short)', 'refs/heads']) ?? '';
  const bad = raw.split('\n').filter(Boolean).map((l) => l.split(/\s+/))
    .filter(([b, up]) => up && b !== 'main' && /^origin\/(main|master)$/.test(up));
  add('repo', 'no-task-branch-tracks-trunk', bad.length ? FAIL : PASS,
    bad.length ? `a bare push from these would target trunk: ${bad.map(([b]) => b).join(', ')}` : 'no task branch tracks origin/main');
}

function checkObservationFreshness() {
  const settings = readJson(resolve(ROOT, '.claude/settings.json'));
  const mcp = readJson(resolve(ROOT, '.mcp.json')) ?? {};
  const obs = readJson(resolve(ROOT, 'config/control-plane-observations.json'));
  if (!settings || !obs) return add('tools', 'observation-freshness', UNKNOWN, 'settings or observations unreadable');
  return import('./gen-tool-authority.mjs').then(({ fingerprintFor }) => {
    const stale = (obs.observations ?? []).filter(
      (o) => o.configuration_fingerprint !== fingerprintFor(o.service, { settings, mcp }),
    );
    add('tools', 'observation-freshness', stale.length ? FAIL : PASS,
      stale.length
        ? `configuration changed since these were observed: ${stale.map((o) => o.namespace).join(', ')} — re-exercise or re-record`
        : `${(obs.observations ?? []).length} observations still describe the current configuration`);
  });
}

/**
 * GitHub capability drift, measured live.
 *
 * GITHUB_CAPABILITY_UNGOVERNED was an acknowledged gap on the reasoning that
 * nothing in this repo governs the gh CLI, so its capability could not be
 * fingerprinted. Measured 2026-08-30, that was wrong: the authenticated account
 * id, the repository id and the OAuth scope set are all stable, all exposed
 * (the scopes arrive in the X-Oauth-Scopes response header), and none of them
 * is secret material.
 *
 * Branch deletion depends on this path — PR state and head OID — so a silent
 * scope change is a silent change in what the lifecycle can prove. Static mode
 * skips this: it needs the network and an authenticated gh.
 */
/**
 * ONE implementation, used both to record the fingerprint and to check it.
 *
 * A first draft computed the recorded value in Python (sorted keys) and the
 * live value in JS (insertion order), so identical capability produced
 * different digests and the check failed against itself. Two implementations of
 * one fact is the same defect this repo keeps finding; keys are sorted here so
 * serialisation order cannot be the difference.
 */
export function githubCapabilityFingerprint(cap) {
  // NOTE ON THE FIELD NAME. This was `oauth_scopes`, and CodeQL raised
  // js/insufficient-password-hash and js/clear-text-logging against it — its
  // heuristic reads `oauth_*` as credential material, so hashing it with a
  // plain sha256 looks like a bad password hash and printing it looks like
  // leaking a secret.
  //
  // Both are false positives. The value is a list of PERMISSION NAMES —
  // `gist, read:org, repo, workflow` — that GitHub returns in the public
  // X-Oauth-Scopes RESPONSE HEADER. It is not a token, it grants nothing, and
  // printing it is the entire point: a drift message that will not say which
  // scope changed is useless.
  //
  // Renamed anyway, because a name that misleads a scanner misleads a reader
  // too, and `granted_scope_names` is simply more accurate about what is held.
  // The digest is a content fingerprint, never an authentication secret.
  const canonical = JSON.stringify({
    account_id: cap.account_id,
    granted_scope_names: [...(cap.granted_scope_names ?? [])].sort(),
    repo_id: cap.repo_id,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function checkGithubCapability() {
  const obs = readJson(resolve(ROOT, 'config/control-plane-observations.json'));
  const recorded = (obs?.observations ?? []).find(
    (o) => o.service === 'GitHub' && String(o.namespace).startsWith('gh CLI'),
  );
  if (!recorded?.capability_fingerprint) {
    return add('tools', 'github-capability-fingerprint', UNKNOWN, 'no capability fingerprint recorded for the gh path');
  }

  const scopes = sh(GH, ['api', '-i', 'user']);
  if (scopes.status !== 0) {
    return add('tools', 'github-capability-fingerprint', UNKNOWN, 'gh unavailable or unauthenticated — capability could not be measured');
  }
  const m = (scopes.stdout ?? '').match(/^x-oauth-scopes:\s*(.*)$/im);
  const live = {
    account_id: Number(sh(GH, ['api', 'user', '--jq', '.id']).stdout?.trim()),
    repo_id: Number(sh(GH, ['api', 'repos/{owner}/{repo}', '--jq', '.id']).stdout?.trim()),
    granted_scope_names: (m?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean).sort(),
  };
  const digest = githubCapabilityFingerprint(live);
  add('tools', 'github-capability-fingerprint', digest === recorded.capability_fingerprint ? PASS : FAIL,
    digest === recorded.capability_fingerprint
      ? `account/repo/scopes unchanged since ${recorded.observed_at} (${digest})`
      : `CHANGED since ${recorded.observed_at}: recorded ${recorded.capability_fingerprint}, live ${digest} — scopes now [${live.granted_scope_names.join(', ')}]. Branch deletion depends on this path; re-verify before trusting a lifecycle verdict.`);
}

function checkUserGlobal() {
  const p = resolve(process.env.HOME ?? '', '.claude/settings.json');
  if (!existsSync(p)) return add('user-global', 'readable', UNKNOWN, 'user-global settings not readable from here');
  const text = readFileSync(p, 'utf-8');
  const stale = /blocked by a PreToolUse hook/.test(text);
  add('user-global', 'no-stale-hook-claim', stale ? FAIL : PASS,
    stale ? 'autoMode prose still claims a PreToolUse hook blocks destructive SQL' : 'no stale hook claim');

  const d = readJson(p);
  const allow = (d?.permissions?.allow ?? []);
  const phantom = allow.filter((r) => r.startsWith('mcp__plugin_supabase_supabase'));
  add('user-global', 'no-phantom-plugin-grants', phantom.length ? FAIL : PASS,
    phantom.length ? `grants for an uninstalled plugin: ${phantom.join(', ')}` : 'no phantom plugin grants');
}

function checkSandbox() {
  const p = resolve(process.env.HOME ?? '', '.claude/settings.json');
  const d = readJson(p);
  const fs = d?.sandbox?.filesystem;
  if (!fs) return add('sandbox', 'filesystem', UNKNOWN, 'sandbox.filesystem not present in user-global settings');
  add('sandbox', 'filesystem', fs.disabled ? GAP : PASS,
    fs.disabled
      ? 'sandbox.filesystem.disabled=true — measured 2026-08-29 as NOT enforced (10/10 probes allowed, including denyRead paths). See gap SANDBOX_FILESYSTEM_DISABLED.'
      : 'sandbox.filesystem enabled');
}

/**
 * config/open-pr-dispositions.json must equal the live open-PR set, in BOTH
 * directions.
 *
 * The missing direction was always checked. The stale direction was not, and
 * the file had accumulated ACTIVE rows for #1623, #1638, #1679 and #1680 long
 * after they closed or merged — a current-state registry quietly asserting
 * things that had stopped being true. A registry that only grows is a history
 * file wearing a registry's name.
 *
 * The vocabulary check lives here rather than in the lifecycle tool because
 * the lifecycle tool must fail SAFE on a malformed entry (unrecognised policy
 * => KEEP) and would therefore never report one. Something has to notice.
 */
function checkOpenPrResidue() {
  const r = sh(GH, ['api', 'repos/{owner}/{repo}/pulls?state=open&per_page=50', '--jq', '.[] | "\\(.number) \\(.head.ref)"']);
  // Not knowing what is OPEN is different from a row being wrong. This one stays
  // UNKNOWN: without the open set, every row below is unclassifiable.
  if (r.status !== 0) return add('github', 'open-pr-residue', UNKNOWN, 'could not list open PRs');
  const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  const openPrs = lines.map((l) => {
    const [number, ...rest] = l.split(' ');
    return { number, ref: rest.join(' ') };
  });

  const known = readJson(resolve(ROOT, 'config/open-pr-dispositions.json')) ?? {};
  // Keys beginning with a dollar sign are documentation, not rows.
  const recorded = Object.fromEntries(Object.entries(known).filter(([k]) => !k.startsWith('$')));

  // Only rows whose PR is NOT open need a merge lookup. One request each, and
  // there is at most a handful — the registry is current state, not history.
  const openSet = new Set(openPrs.map((p) => p.number));
  const mergeFacts = {};
  for (const k of Object.keys(recorded).filter((k) => !openSet.has(k))) {
    const m = sh(GH, ['api', `repos/{owner}/{repo}/pulls/${k}`,
      '--jq', '"\\(if .merged_at then "MERGED" else (.state|ascii_upcase) end) \\(.merge_commit_sha // "-")"']);
    if (m.status !== 0) { mergeFacts[k] = { lookup: 'FAILED' }; continue; }
    const [state, sha] = (m.stdout ?? '').trim().split(/\s+/);
    mergeFacts[k] = { lookup: 'OK', state, mergeCommitSha: sha && sha !== '-' ? sha : null };
  }

  // A row that is absent HERE may be arriving in the PR that adds it. Read the
  // file at that PR's own head and find out, rather than assuming either way.
  const inFlightRows = {};
  for (const pr of openPrs.filter((x) => !recorded[x.number])) {
    if (!pr.ref) { inFlightRows[pr.number] = null; continue; }
    const c = sh(GH, ['api', `repos/{owner}/{repo}/contents/config/open-pr-dispositions.json?ref=${pr.ref}`,
      '-H', 'Accept: application/vnd.github.raw']);
    if (c.status !== 0) { inFlightRows[pr.number] = null; continue; }
    try {
      const atHead = JSON.parse(c.stdout);
      inFlightRows[pr.number] = Object.prototype.hasOwnProperty.call(atHead, pr.number);
    } catch {
      inFlightRows[pr.number] = null;
    }
  }

  const headSha = git(['rev-parse', 'HEAD']);
  const { problems, transitional, inFlight } = classifyDispositionResidue({
    openPrs, recorded, mergeFacts, headSha, inFlightRows,
  });

  // A transitional row is REPORTED, never silent. It is a row that must go in
  // the next PR, and a reader who cannot see it will not remove it.
  const note =
    (transitional.length
      ? ` | transitionally closed (merged at HEAD, clear in the next PR): ${transitional.map((k) => '#' + k).join(', ')}`
      : '') +
    (inFlight.length
      ? ` | in flight (row present at the PR's own head): ${inFlight.map((k) => '#' + k).join(', ')}`
      : '');

  add('github', 'open-pr-residue', problems.length ? FAIL : PASS,
    problems.length
      ? problems.join(' | ') + note
      : `${openPrs.length} open PR(s), all classified or in flight, no stale rows${note}`);
}

function checkMainBranchProtection() {
  const prot = sh(GH, ['api', 'repos/{owner}/{repo}/branches/main/protection']);
  const protection = prot.status === 0 ? (() => { try { return JSON.parse(prot.stdout); } catch { return null; } })() : null;

  // Rulesets are a SECOND mechanism, with their own bypass list. Reading only
  // classic protection would report PASS against a bypass reinstated there.
  const rs = sh(GH, ['api', 'repos/{owner}/{repo}/rulesets']);
  let rulesets = null;
  if (rs.status === 0) {
    try {
      const list = JSON.parse(rs.stdout);
      rulesets = [];
      for (const entry of list) {
        const one = sh(GH, ['api', `repos/{owner}/{repo}/rulesets/${entry.id}`]);
        if (one.status !== 0) { rulesets = null; break; }
        const d = JSON.parse(one.stdout);
        const refs = d.conditions?.ref_name?.include ?? [];
        rulesets.push({
          name: d.name ?? String(entry.id),
          enforcement: d.enforcement,
          targetsMain: refs.includes('~DEFAULT_BRANCH') || refs.includes('refs/heads/main'),
          bypassActorCount: (d.bypass_actors ?? []).length,
        });
      }
    } catch {
      rulesets = null;
    }
  }

  const gaps = readJson(resolve(ROOT, 'config/control-plane-gaps.json'))?.gaps ?? [];
  const verdict = classifyBranchProtection({
    lookup: prot.status === 0 ? 'OK' : 'FAILED',
    protection,
    rulesets,
    gapRegistered: gaps.some((g) => g.id === 'MAIN_ADMIN_BYPASS_AVAILABLE'),
  });
  add('github', 'main-branch-protection', verdict.state, verdict.detail);
}

// ---------------------------------------------------------------------------

async function run() {
  checkGenerated();
  checkHookWiring();
  checkClaimConsistency();
  checkToolStaticAuthority();
  checkMcpDenyConnectorIds();
  checkWorktreePolicy();
  checkControlPlaneTests();

  if (!STATIC_ONLY) {
    checkRepoIdentity();
    checkDisk();
    checkLifecycleRuntime();
    checkDangerousUpstreams();
    await checkObservationFreshness();
    checkGithubCapability();
    checkUserGlobal();
    checkSandbox();
    checkOpenPrResidue();
    checkMainBranchProtection();
  }

  const gaps = readJson(resolve(ROOT, 'config/control-plane-gaps.json'))?.gaps ?? [];
  const summary = summarise(results, gaps);

  if (JSON_OUT) {
    console.log(JSON.stringify({ mode: STATIC_ONLY ? 'static' : 'full', results, gaps, summary }, null, 2));
    process.exit(summary.code);
  }

  let section = '';
  for (const r of results) {
    if (r.section !== section) {
      section = r.section;
      console.log(`\n  ${section.toUpperCase()}`);
    }
    const mark = r.state === PASS ? 'PASS ' : r.state === FAIL ? 'FAIL ' : r.state === GAP ? 'GAP  ' : 'UNKN ';
    console.log(`    ${mark} ${r.id.padEnd(38)} ${r.detail}`);
  }

  if (gaps.length) {
    console.log('\n  ACKNOWLEDGED GAPS — established, owned, and deliberately open');
    for (const g of gaps) console.log(`    ${g.id.padEnd(38)} owner=${g.owner} since ${g.opened}`);
    console.log('    These are NOT unknowns. Each has an owner and a closing condition.');
  }

  console.log('');
  console.log(`  ${summary.outcome}  (exit ${summary.code})  —  ${summary.passes} pass, ` +
    `${summary.fails.length} fail, ${summary.unknowns.length} unknown`);
  console.log(`  REGISTERED OPEN GAPS — ${summary.registered_gap_count}` +
    `   (checks reporting GAP state this run: ${summary.gap_state_check_count})`);
  if (summary.unknowns.length) {
    console.log('  UNKNOWN is not PASS. A state that could not be established is reported as unknown.');
  }
  process.exit(summary.code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error('control-plane-verify: the verifier itself failed');
    console.error(err);
    process.exit(2);
  });
}
