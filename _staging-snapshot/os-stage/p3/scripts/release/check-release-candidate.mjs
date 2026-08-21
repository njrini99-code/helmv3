#!/usr/bin/env node
// npm run release:check -- --sha <candidate> [--json] [--no-vercel] [--now <ISO>]
//
// spec §22 — fail-closed release readiness gate. Every check below produces
// a named, actionable line; nothing here reports green by omission. Exit
// code = the COUNT of hard failures (FAIL + BLOCKED) — per the P3 brief,
// deliberately not a fixed code like repo-doctor's — zero means "clear to
// enter the human-approval environment gate in
// .github/workflows/production-release.yml," never "deploy automatically."
//
// Checks: release budget; candidate SHA resolvable; candidate on main
// lineage; required CI green on that SHA (gh api check-runs, excluding the
// documented 'Supabase Preview' advisory exception); `repo:doctor` exit 0;
// `npm run knowledge:check` exit 0; the release report exists and its
// RELEASE_META block parses; every release-queue item the report says it
// includes is status=verified or queued_for_release; production deploy
// identity is resolvable. A WARN-level note also fires when the candidate
// touches supabase/migrations/** — spec §22's fuller scope ("unresolved
// high-risk migration state", "required memory updates missing", "known P0
// blocker") depends on memory/incidents/ and the daily-reliability routine,
// neither of which exists yet (P2/P4); this is a placeholder nod to that
// intent, not a claim that it is automated.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveRepoRoot, parseArgs, Status, check, summarizeGate,
  loadReleasePolicy, parseDeploymentLedger, summarizeBudget, resolveProductionState,
  resolveSha, isAncestor, resolveMainSha, resolveGhRepo, getCheckRuns,
  evaluateRequiredChecks, run, loadReleaseQueue,
} from './lib/release-common.mjs';

// Distinct from any plausible hard-failure count (there are under a dozen
// named checks total) — a crash never gets confused for "11 things failed."
const CRASH_EXIT_CODE = 99;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sha) {
    process.stderr.write('release:check requires --sha <candidate>\n');
    process.exit(1);
    return;
  }
  const repoRoot = resolveRepoRoot();
  const checks = [];

  // 1. Candidate SHA identified.
  const candidateSha = resolveSha(repoRoot, args.sha);
  checks.push(candidateSha
    ? check('candidate-sha-resolvable', Status.PASS, `candidate resolves to ${candidateSha}`)
    : check('candidate-sha-resolvable', Status.FAIL, `"${args.sha}" does not resolve to a commit in this repository`));

  // 2. On main lineage.
  const main = resolveMainSha(repoRoot);
  if (candidateSha && main.sha) {
    const onMain = isAncestor(repoRoot, candidateSha, main.ref ?? main.sha);
    checks.push(onMain
      ? check('candidate-sha-on-main-lineage', Status.PASS, `${candidateSha} is an ancestor of ${main.ref} (${main.sha})`)
      : check('candidate-sha-on-main-lineage', Status.FAIL, `${candidateSha} is NOT an ancestor of ${main.ref} (${main.sha}) — refusing to release a SHA that is not on main`));
  } else if (!candidateSha) {
    checks.push(check('candidate-sha-on-main-lineage', Status.BLOCKED, 'skipped — candidate SHA unresolved (see candidate-sha-resolvable above)'));
  } else {
    checks.push(check('candidate-sha-on-main-lineage', Status.BLOCKED, `could not resolve main (${main.ref ?? 'no ref'}) to check ancestry`));
  }

  // 3. Budget.
  const { policy, source: policySource } = loadReleasePolicy(repoRoot);
  const ledger = parseDeploymentLedger(repoRoot);
  const now = args.now ? new Date(args.now) : new Date();
  const budget = summarizeBudget({ entries: ledger.entries, policy, now });
  checks.push(budget.atOrOverCap
    ? check('release-budget', Status.FAIL, `${budget.deploysThisWeek}/${budget.max} routine deploys already used this calendar week (${budget.weekLabel}) — 0 slots remain`, { policySource })
    : check('release-budget', Status.PASS, `${budget.routineSlotsRemaining} of ${budget.max} routine slot(s) remain this calendar week (${budget.weekLabel})`));

  // 4. Required CI green on the candidate SHA.
  const { repo } = resolveGhRepo(repoRoot);
  if (!candidateSha) {
    checks.push(check('required-ci-green', Status.BLOCKED, 'skipped — candidate SHA unresolved'));
  } else if (!repo) {
    checks.push(check('required-ci-green', Status.BLOCKED, 'could not resolve GitHub owner/repo (gh repo view and git remote both failed) — cannot verify CI status'));
  } else {
    const runsResult = getCheckRuns(repoRoot, candidateSha, repo);
    if (!runsResult.ok) {
      checks.push(check('required-ci-green', Status.BLOCKED, `gh api check-runs failed: ${runsResult.error}`));
    } else {
      const evald = evaluateRequiredChecks(runsResult.runs);
      checks.push(evald.allRequiredGreen
        ? check('required-ci-green', Status.PASS, 'all 6 required checks (.github/branch-protection.md) are green on this SHA')
        : check('required-ci-green', Status.FAIL, `required checks not all green — missing: [${evald.missing.join(', ') || 'none'}], not green: [${evald.notGreen.map((n) => n.name).join(', ') || 'none'}]`, { evidence: evald }));
      if (evald.otherRed.length) {
        checks.push(check('other-checks-red', Status.WARN, `non-required, non-advisory check(s) currently red on this SHA: ${evald.otherRed.map((r) => r.name).join(', ')}`));
      }
    }
  }

  // 5. repo:doctor exit 0.
  const doctor = run('node', ['scripts/repo-doctor/cli.mjs', '--summary'], { cwd: repoRoot, timeout: 60000 });
  if (doctor.ok) {
    checks.push(check('repo-doctor', Status.PASS, 'repo:doctor exited 0'));
  } else if (doctor.code === null) {
    checks.push(check('repo-doctor', Status.BLOCKED, `repo:doctor did not run: ${doctor.error}`));
  } else {
    checks.push(check('repo-doctor', Status.FAIL, `repo:doctor exited ${doctor.code}`, { evidence: (doctor.stdout || '').split('\n').slice(-15) }));
  }

  // 6. knowledge:check exit 0.
  const knowledge = run('npm', ['run', 'knowledge:check'], { cwd: repoRoot, timeout: 120000 });
  if (knowledge.ok) {
    checks.push(check('knowledge-check', Status.PASS, 'npm run knowledge:check exited 0'));
  } else {
    checks.push(check('knowledge-check', Status.FAIL, `npm run knowledge:check exited ${knowledge.code ?? 'nonzero'}`, { evidence: (knowledge.stderr || knowledge.stdout || '').split('\n').slice(-15) }));
  }

  // 7. Release report exists (+ parse its RELEASE_META block).
  let reportMeta = null;
  if (candidateSha) {
    const reportPath = join(repoRoot, `docs/releases/${candidateSha}.md`);
    if (!existsSync(reportPath)) {
      checks.push(check('release-report-exists', Status.FAIL, `docs/releases/${candidateSha}.md not found — run npm run release:prepare -- --sha ${candidateSha} first`));
    } else {
      checks.push(check('release-report-exists', Status.PASS, `docs/releases/${candidateSha}.md exists`));
      try {
        const text = readFileSync(reportPath, 'utf-8');
        const m = text.match(/<!-- RELEASE_META\n([\s\S]*?)\nEND_RELEASE_META -->/);
        reportMeta = m ? JSON.parse(m[1]) : null;
        checks.push(reportMeta
          ? check('release-report-parseable', Status.PASS, 'RELEASE_META block parsed')
          : check('release-report-parseable', Status.BLOCKED, 'release report exists but has no parseable RELEASE_META block — was it hand-edited, or generated by an older version of build-release-candidate.mjs?'));
      } catch (err) {
        checks.push(check('release-report-parseable', Status.BLOCKED, `release report RELEASE_META block failed to parse: ${err?.message ?? err}`));
      }
    }
  } else {
    checks.push(check('release-report-exists', Status.BLOCKED, 'skipped — candidate SHA unresolved'));
  }

  // 8. Release-queue items included are status=verified or queued_for_release.
  if (reportMeta) {
    const queue = loadReleaseQueue(repoRoot);
    const byId = new Map(queue.items.map((i) => [i.id, i]));
    const acceptable = new Set(['verified', 'queued_for_release']);
    const bad = [];
    for (const id of reportMeta.queueItemsIncluded ?? []) {
      const item = byId.get(id);
      if (!item) bad.push({ id, reason: 'not found in memory/operations/release-queue.yml' });
      else if (!acceptable.has(item.status)) bad.push({ id, reason: `status is "${item.status}", not verified/queued_for_release` });
    }
    checks.push(bad.length === 0
      ? check('queue-items-verified', Status.PASS, `${(reportMeta.queueItemsIncluded ?? []).length} release-queue item(s) included, all verified/queued_for_release`)
      : check('queue-items-verified', Status.FAIL, `${bad.length} included release-queue item(s) are not in an acceptable status`, { evidence: bad }));
  }

  // 9. Deploy identity resolvable.
  const prodState = resolveProductionState({ repoRoot, ledger, useVercel: !args['no-vercel'] });
  checks.push(prodState.source === 'unknown'
    ? check('deploy-identity-resolvable', Status.FAIL, 'current production deploy identity could not be established from Vercel or the ledger')
    : check('deploy-identity-resolvable', Status.PASS, `production identity resolved via ${prodState.source}${prodState.sha ? ` (${prodState.sha})` : ''}`));

  // Bonus WARN — see module header on why this is not a hard gate yet.
  if (reportMeta?.migrations?.length) {
    checks.push(check('migrations-present', Status.WARN, `${reportMeta.migrations.length} migration(s) in this candidate — confirm manually that each is reviewed (spec §22 "unresolved high-risk migration state"); this gate does not yet automate that judgment`));
  }

  const result = summarizeGate(checks);

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ candidateSha, ...result }, null, 2)}\n`);
  } else {
    process.stdout.write(`\nRELEASE READINESS — ${candidateSha ?? args.sha}\n${'='.repeat(52)}\n`);
    const icons = { PASS: '✓', WARN: '!', FAIL: '✗', BLOCKED: '■' };
    for (const c of checks) {
      process.stdout.write(`  ${icons[c.status] ?? '?'} [${c.status}] ${c.id}: ${c.title}\n`);
    }
    process.stdout.write(`\n${result.ok ? 'READY' : `NOT READY — ${result.hardFailureCount} hard failure(s)`}${result.warnCount ? `, ${result.warnCount} warning(s)` : ''}\n\n`);
  }

  process.exit(result.hardFailureCount);
}

main().catch((err) => {
  process.stderr.write(`release:check crashed: ${err?.stack ?? err}\n`);
  process.exit(CRASH_EXIT_CODE);
});
