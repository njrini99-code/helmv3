#!/usr/bin/env node
/**
 * The single lifecycle authority for worktrees and branches.
 *
 *   scripts/worktree-lifecycle.mjs                 report only (default)
 *   scripts/worktree-lifecycle.mjs --park          remove PARKABLE checkouts, keep branches
 *   scripts/worktree-lifecycle.mjs --retire        PARK + delete DELETE_MERGED_EXACT branches
 *   scripts/worktree-lifecycle.mjs --gc-branches   delete DELETE_MERGED_EXACT branches only
 *   scripts/worktree-lifecycle.mjs --json          machine-readable report
 *
 * This gathers facts. scripts/lib/worktree-lifecycle.mjs decides. The split is
 * so every verdict can be tested without building a git fixture per case, and
 * so a wrong verdict is a logic bug rather than a shell-quoting bug.
 *
 * REPORTING IS THE DEFAULT and stays that way. Each row is a claim about
 * somebody's unfinished work.
 *
 * STANDING OWNER AUTHORIZATION, 2026-08-29: an agent may run --park and
 * --retire without asking for rows the tool itself verdicts PARKABLE /
 * DELETE_MERGED_EXACT, and should do it in the same step that merges a PR. Anything
 * the tool declines — every KEEP_* and UNKNOWN_* — still needs a human.
 *
 * NARROWED 2026-08-30, after --retire parked a concurrent session's worktree
 * (agent/round-type-reclassify, PR #1681 OPEN). A checkout whose branch has an
 * OPEN PR is now PARKABLE only when config/open-pr-dispositions.json records
 * that PR with worktree_policy PARK_IF_REPRODUCIBLE. Clean + pushed + "lsof saw
 * nothing" is no longer enough, because lsof answers about one instant and an
 * agent session between two tool calls is invisible to it.
 *
 * WHY BRANCH DELETION NEEDS `-D`
 *
 * This repo squash-merges, so a merged branch's commits never become ancestors
 * of main and `git branch -d` always refuses. Forced deletion is therefore
 * unavoidable — which is exactly why it is gated on PR MERGED plus an exact
 * head-OID match, and never exposed as a bare command a caller can aim itself.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyWorktree,
  classifyBranch,
  combineVerdicts,
  DELETE_MERGED_EXACT,
  PARKABLE,
  REQUIRES_HUMAN_VERDICTS,
} from './lib/worktree-lifecycle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The repository this tool ACTS ON is the one containing the current working
 * directory — never the one containing this script.
 *
 * The first draft resolved REPO from `import.meta.url`. A test that built a
 * throwaway git fixture and invoked the CLI with `cwd` set to it therefore
 * operated on the REAL repository instead, and `--park` removed a live
 * worktree (`keyboard-covers-distance`, PR #1659). Nothing was lost — parking
 * is defined to keep the branch, and PARKABLE requires the tip already match
 * its pushed remote, which it did — but the tool was aimed at the wrong target
 * and did not notice.
 *
 * A tool that deletes things must take its target from where the caller is
 * standing. Falling back to the script's own location is the last resort, for
 * the case where cwd is not inside any repository at all.
 */
function resolveRepo() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (top) return top;
  } catch {
    /* not inside a repo */
  }
  return resolve(HERE, '..');
}

const REPO = resolveRepo();

const args = process.argv.slice(2);
const PARK = args.includes('--park') || args.includes('--retire');
const GC = args.includes('--gc-branches') || args.includes('--retire');
const JSON_OUT = args.includes('--json');

function git(a, opts = {}) {
  try {
    return execFileSync('git', a, {
      cwd: opts.cwd ?? REPO,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * PR lookup. HELM_PR_LOOKUP is the testability seam kept from the shell tool —
 * `gh` cannot answer for fixture branches that were never pushed. It receives a
 * branch name and prints "<number> <STATE> <headSha>", or "NONE".
 *
 * Returns { lookup: 'OK'|'FAILED', number, state, headSha }. A failed lookup is
 * FAILED, never NONE: #1668 exists because those were conflated.
 */
function prFor(branch) {
  const stub = process.env.HELM_PR_LOOKUP;
  if (stub) {
    try {
      const out = execFileSync(stub, [branch], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      if (!out || out === 'NONE') return { lookup: 'OK', state: 'NONE' };
      const [num, state, sha] = out.split(/\s+/);
      return { lookup: 'OK', number: Number(num), state, headSha: sha ?? null };
    } catch {
      return { lookup: 'FAILED' };
    }
  }
  try {
    const out = execFileSync(
      'gh',
      ['api', `repos/{owner}/{repo}/pulls?state=all&head={owner}:${branch}&per_page=1`,
       '--jq', '.[0] | if . == null then "NONE" else "\\(.number) \\(if .merged_at then "MERGED" else (.state|ascii_upcase) end) \\(.head.sha)" end'],
      { cwd: REPO, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (!out || out === 'NONE') return { lookup: 'OK', state: 'NONE' };
    const [num, state, sha] = out.split(/\s+/);
    return { lookup: 'OK', number: Number(num), state, headSha: sha ?? null };
  } catch {
    return { lookup: 'FAILED' };
  }
}

/**
 * Recorded owner intent for OPEN PRs. Read from the repository being ACTED ON,
 * like every other fact here — a fixture repo gets its own file or none, never
 * the live one's.
 *
 * Unreadable or absent is `{}`, which makes every open PR look undisposed and
 * every such checkout a KEEP. That is the safe direction: a missing file makes
 * the tool refuse to act, not act without permission.
 */
function dispositions() {
  try {
    return JSON.parse(readFileSync(resolve(REPO, 'config/open-pr-dispositions.json'), 'utf-8'));
  } catch {
    return {};
  }
}

function canonicalRoot() {
  // Resolved against REPO, so a fixture repo without the identity module gets
  // null rather than the real checkout's canonical path.
  const id = resolve(REPO, '.claude/hooks/lib/workspace-identity.mjs');
  if (!existsSync(id)) return null;
  try {
    return execFileSync('node', [id, '--canonical-root'], {
      cwd: REPO, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function worktrees() {
  const raw = git(['worktree', 'list', '--porcelain']) ?? '';
  const out = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9), branch: null, detached: false };
    } else if (line.startsWith('branch refs/heads/')) {
      cur.branch = line.slice('branch refs/heads/'.length);
    } else if (line === 'detached') {
      cur.detached = true;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Commits on this branch that are not on the integration trunk. */
function uniqueCommits(branch) {
  const n = git(['rev-list', '--count', `origin/main..${branch}`]);
  if (n === null) {
    const n2 = git(['rev-list', '--count', `main..${branch}`]);
    return n2 === null ? null : Number(n2);
  }
  return Number(n);
}

function dirtyCount(path) {
  const s = git(['status', '--porcelain'], { cwd: path });
  if (s === null) return null;
  return s === '' ? 0 : s.split('\n').length;
}

function hasLiveProcess(path) {
  try {
    const out = execFileSync('/bin/sh', ['-c', `lsof +D ${JSON.stringify(path)} 2>/dev/null | awk '$4=="cwd"' | head -1`], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim().length > 0;
  } catch {
    // lsof absent or refused: we do not know. Do not answer "no".
    return null;
  }
}

function du(path) {
  try {
    const out = execFileSync('/usr/bin/du', ['-sh', path], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split(/\s+/)[0] ?? '-';
  } catch {
    return '-';
  }
}

// ---------------------------------------------------------------------------

const CANON = canonicalRoot();
const DISPOSITIONS = dispositions();
const SELF = process.cwd();
const wts = worktrees();
const byBranch = new Map();
for (const w of wts) if (w.branch) byBranch.set(w.branch, w);

const rows = [];

for (const w of wts) {
  const isCanonical = CANON !== null && resolve(w.path) === resolve(CANON);
  const localSha = w.branch ? git(['rev-parse', w.branch]) : git(['rev-parse', 'HEAD'], { cwd: w.path });
  const upstream = w.branch
    ? git(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${w.branch}`]) || null
    : null;
  const remoteSha = upstream ? git(['rev-parse', upstream]) : null;
  const dirty = dirtyCount(w.path);

  // PR facts are gathered BEFORE the worktree is classified, because since
  // 2026-08-30 the worktree verdict depends on them: an OPEN PR's checkout is
  // parkable only with its owner's recorded consent.
  const pr = w.branch && !isCanonical ? prFor(w.branch) : { lookup: 'OK', state: 'NONE' };
  const disp = pr.number != null ? (DISPOSITIONS[String(pr.number)] ?? null) : null;

  const wFacts = {
    path: w.path,
    isCanonical,
    isCurrentExecution: resolve(SELF).startsWith(resolve(w.path)) && !isCanonical,
    branch: w.branch,
    dirtyCount: dirty,
    hasLiveProcess: isCanonical ? false : hasLiveProcess(w.path),
    upstream,
    localSha,
    remoteSha,
    prLookup: pr.lookup,
    prNumber: pr.number ?? null,
    prState: pr.state ?? null,
    disposition: disp?.disposition ?? null,
    worktreePolicy: disp?.worktree_policy ?? null,
  };
  const wv = classifyWorktree(wFacts);
  const bv = w.branch
    ? classifyBranch({
        branch: w.branch,
        localSha,
        // NOTE: the worktree is deliberately NOT passed here. This asks "would
        // the branch be deletable once the checkout is gone" — passing the tree
        // would always answer KEEP_WORKTREE_ACTIVE and RETIRE would be
        // unreachable for every worktree, forever.
        upstream,
        uniqueCommits: uniqueCommits(w.branch),
        prLookup: pr.lookup,
        prNumber: pr.number ?? null,
        prState: pr.state ?? null,
        prHeadSha: pr.headSha ?? null,
      })
    : { verdict: 'UNKNOWN_IDENTITY', reason: 'detached' };

  const combined = combineVerdicts(wv.verdict, bv.verdict);

  rows.push({
    kind: 'worktree',
    branch: w.branch ?? '(detached)',
    worktree: w.path,
    size: du(w.path),
    dirty: dirty === null ? 'UNKNOWN' : dirty > 0 ? 'yes' : 'no',
    processCwd: wFacts.hasLiveProcess === null ? 'UNKNOWN' : wFacts.hasLiveProcess ? 'yes' : 'no',
    upstream: upstream ?? 'none',
    localSha: localSha ? localSha.slice(0, 9) : '-',
    remoteSha: remoteSha ? remoteSha.slice(0, 9) : '-',
    prLookup: pr.lookup,
    prNumber: pr.number ?? '-',
    prState: pr.state ?? 'UNKNOWN',
    prHeadSha: pr.headSha ? pr.headSha.slice(0, 9) : '-',
    tipMatchesPr: pr.headSha ? (pr.headSha === localSha ? 'yes' : 'no') : '-',
    disposition: wFacts.disposition ?? '-',
    worktreePolicy: wFacts.worktreePolicy ?? '-',
    worktreeVerdict: wv.verdict,
    branchVerdict: bv.verdict,
    action: combined.action,
    reason: wv.verdict === PARKABLE ? bv.reason : wv.reason,
  });
}

// Branches with no worktree — the residue that accumulated invisibly.
const allBranches = (git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']) ?? '')
  .split('\n')
  .filter(Boolean);

for (const b of allBranches) {
  if (byBranch.has(b)) continue;
  const localSha = git(['rev-parse', b]);
  const upstream = git(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${b}`]) || null;
  const pr = prFor(b);
  const bv = classifyBranch({
    branch: b,
    localSha,
    upstream,
    uniqueCommits: uniqueCommits(b),
    prLookup: pr.lookup,
    prNumber: pr.number ?? null,
    prState: pr.state ?? null,
    prHeadSha: pr.headSha ?? null,
  });
  rows.push({
    kind: 'branch',
    branch: b,
    worktree: 'none',
    size: '-',
    dirty: 'no',
    processCwd: 'no',
    upstream: upstream ?? 'none',
    localSha: localSha ? localSha.slice(0, 9) : '-',
    remoteSha: upstream ? (git(['rev-parse', upstream]) ?? '-').slice(0, 9) : '-',
    prLookup: pr.lookup,
    prNumber: pr.number ?? '-',
    prState: pr.state ?? 'UNKNOWN',
    prHeadSha: pr.headSha ? pr.headSha.slice(0, 9) : '-',
    tipMatchesPr: pr.headSha ? (pr.headSha === localSha ? 'yes' : 'no') : '-',
    disposition: '-',
    worktreePolicy: '-',
    worktreeVerdict: '-',
    branchVerdict: bv.verdict,
    action: bv.verdict === DELETE_MERGED_EXACT ? 'DELETE_BRANCH' : 'KEEP',
    reason: bv.reason,
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const H = ['BRANCH', 'WORKTREE', 'SIZE', 'DIRTY', 'CWD', 'PR', 'PR_STATE', 'TIP=PR', 'WT_VERDICT', 'BR_VERDICT', 'ACTION'];
// WT_VERDICT is 30 wide because KEEP_PR_OWNER_INTENT_REQUIRED is 29 characters
// and a report that wraps its own verdict column is a report nobody reads.
const W = [34, 44, 6, 7, 7, 6, 9, 7, 30, 24, 14];
const line = (c) => c.map((v, i) => String(v).padEnd(W[i])).join(' ');
console.log(line(H));
console.log('-'.repeat(W.reduce((a, b) => a + b + 1, 0)));
for (const r of rows) {
  console.log(
    line([
      r.branch, r.worktree.replace(process.env.HOME ?? '~', '~'), r.size, r.dirty, r.processCwd,
      r.prNumber, r.prState, r.tipMatchesPr, r.worktreeVerdict, r.branchVerdict, r.action,
    ]),
  );
  console.log(`${' '.repeat(2)}↳ ${r.reason}`);
}

const parkable = rows.filter((r) => r.kind === 'worktree' && (r.action === 'PARK' || r.action === 'RETIRE'));
const deletable = rows.filter((r) => r.branchVerdict === DELETE_MERGED_EXACT && r.worktree === 'none');
const unknowns = rows.filter((r) => String(r.branchVerdict).startsWith('UNKNOWN') || String(r.worktreeVerdict).startsWith('UNKNOWN'));

console.log('');
console.log(`  ${parkable.length} worktree(s) parkable/retirable · ${deletable.length} branch(es) DELETE_MERGED_EXACT · ${unknowns.length} row(s) UNKNOWN`);
if (unknowns.length) {
  console.log('  UNKNOWN means evidence was unavailable. It is never a licence to remove anything.');
}

const humanRows = rows.filter(
  (r) => REQUIRES_HUMAN_VERDICTS.has(r.branchVerdict) || REQUIRES_HUMAN_VERDICTS.has(r.worktreeVerdict),
);
if (humanRows.length) {
  console.log('');
  console.log('  STANDING AUTHORIZATION covers ONLY DELETE_MERGED_EXACT and PARKABLE.');
  console.log(`  ${humanRows.length} row(s) carry a verdict that requires a human and will never be`);
  console.log('  acted on automatically — including NO_UPSTREAM_UNIQUE_WORK, which is the');
  console.log('  only copy of real commits, and KEEP_PR_OWNER_INTENT_REQUIRED, which is an');
  console.log('  open PR whose owner has not recorded that the checkout may go.');
}

if (!PARK && !GC) {
  console.log('');
  console.log('  Reporting is the default. To act:');
  console.log('    scripts/worktree-lifecycle.mjs --park          remove disposable checkouts, keep branches');
  console.log('    scripts/worktree-lifecycle.mjs --gc-branches   delete branches proven merged');
  console.log('    scripts/worktree-lifecycle.mjs --retire        both');
  process.exit(0);
}

let acted = 0;
if (PARK) {
  for (const r of parkable) {
    console.log(`park: removing checkout ${r.worktree} (branch ${r.branch} kept)`);
    if (git(['worktree', 'remove', r.worktree]) === null) {
      console.log('  refused — left in place');
    } else {
      acted++;
    }
  }
}
if (GC) {
  // Re-derive after parking: a branch whose worktree just went away becomes
  // eligible, and one whose removal was refused must not be.
  const stillHeld = new Set(worktrees().map((w) => w.branch).filter(Boolean));
  const targets = rows.filter((r) => r.branchVerdict === DELETE_MERGED_EXACT && !stillHeld.has(r.branch));
  for (const r of targets) {
    // Re-verify the exact head match immediately before deleting. The report
    // may be seconds old; the deletion is not reversible from here.
    const now = git(['rev-parse', r.branch]);
    if (!now || !now.startsWith(r.localSha)) {
      console.log(`gc: SKIP ${r.branch} — tip moved since classification`);
      continue;
    }
    console.log(`gc: deleting ${r.branch} (${r.reason})`);
    if (git(['branch', '-D', r.branch]) === null) {
      console.log('  refused — left in place');
    } else {
      acted++;
    }
  }
  git(['worktree', 'prune']);
}
console.log(`\n  ${acted} action(s) taken.`);
