#!/usr/bin/env node
// npm run release:status [-- --json] [--no-vercel]
//
// A single dashboard combining the three questions "are we behind main",
// "is anything queued for the next release", and "could we release right
// now" — spec §20 (main can move; production does not have to), §17 (the
// release queue), §16 (the budget) — instead of stitching three commands
// together by hand every time. Read-only; never mutates anything.

import {
  resolveRepoRoot, loadReleasePolicy, parseDeploymentLedger, summarizeBudget,
  resolveProductionState, resolveMainSha, git, loadReleaseQueue, parseArgs,
} from './lib/release-common.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const useVercel = !args['no-vercel'];

  const { policy, source: policySource } = loadReleasePolicy(repoRoot);
  const ledger = parseDeploymentLedger(repoRoot);
  const budget = summarizeBudget({ entries: ledger.entries, policy, now: new Date() });
  const prodState = resolveProductionState({ repoRoot, ledger, useVercel });
  const main = resolveMainSha(repoRoot);

  let commitsAhead = null;
  let lineageWarning = null;
  if (prodState.sha && main.sha) {
    const r = git(repoRoot, ['rev-list', '--count', `${prodState.sha}..${main.sha}`]);
    if (r.ok) {
      commitsAhead = Number(r.value);
    } else {
      lineageWarning = `could not compute commits-ahead: ${r.error}`;
    }
  } else {
    lineageWarning = 'production SHA or main SHA is unresolved — commits-ahead is UNKNOWN, not zero.';
  }

  const queue = loadReleaseQueue(repoRoot);
  const queueCounts = {};
  for (const item of queue.items) {
    const status = item?.status ?? 'unknown';
    queueCounts[status] = (queueCounts[status] ?? 0) + 1;
  }

  const result = {
    productionSha: prodState.sha,
    productionSource: prodState.source,
    productionDeploymentId: prodState.deploymentId,
    mainSha: main.sha,
    mainRef: main.ref,
    commitsAhead,
    lineageWarning,
    queueCounts,
    queueTotal: queue.items.length,
    queueSource: queue.sourceExists ? queue.path : 'default-empty (no queue file)',
    budget: {
      week: budget.weekLabel,
      deploysThisWeek: budget.deploysThisWeek,
      max: budget.max,
      routineSlotsRemaining: budget.routineSlotsRemaining,
      atOrOverCap: budget.atOrOverCap,
    },
    policySource,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`\nRELEASE STATUS\n${'='.repeat(52)}\n`);
  process.stdout.write(`production : ${result.productionSha ?? '(unresolved)'} (${result.productionSource}${result.productionDeploymentId ? `, ${result.productionDeploymentId}` : ''})\n`);
  process.stdout.write(`main       : ${result.mainSha ?? '(unresolved)'} (${result.mainRef})\n`);
  process.stdout.write(`commits ahead of production: ${result.commitsAhead ?? 'UNKNOWN'}${lineageWarning ? `  (${lineageWarning})` : ''}\n\n`);

  process.stdout.write(`RELEASE QUEUE (${result.queueTotal} item(s), source: ${result.queueSource})\n`);
  for (const [status, count] of Object.entries(queueCounts)) {
    process.stdout.write(`  ${status}: ${count}\n`);
  }
  if (result.queueTotal === 0) process.stdout.write('  (empty)\n');

  process.stdout.write(`\nBUDGET — ${result.budget.week}\n`);
  process.stdout.write(`  ${result.budget.deploysThisWeek} / ${result.budget.max} used, ${result.budget.routineSlotsRemaining} slot(s) remaining${result.budget.atOrOverCap ? '  — AT CAP' : ''}\n\n`);
}

main().catch((err) => {
  process.stderr.write(`release:status crashed: ${err?.stack ?? err}\n`);
  process.exit(2);
});
