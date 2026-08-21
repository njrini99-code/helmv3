#!/usr/bin/env node
// npm run release:budget [-- --json] [--no-vercel] [--now <ISO>]
//
// spec §16 — hard limit of routine_max_deploys_per_calendar_week (default 2,
// config/release-policy.yml) production deploys, counted over the current
// America/New_York calendar week from memory/ledgers/deployments.md, and
// best-effort cross-checked against the live Vercel production deployment.
//
// Exit codes:
//   0 — routine slots remain
//   1 — budget exhausted (the routine release workflow must refuse; spec §16
//       is explicit that a true P0 does NOT silently convert into a third
//       deploy — this script only reports the number, a human decides)
//   2 — this script itself crashed (fail closed — never a false green)
//
// A MISSING ledger file is NOT exit 2: on first adoption that is the
// expected state and is treated as zero history, loudly (see
// parseDeploymentLedger's warning in lib/release-common.mjs) — a ledger that
// exists but can't be parsed as a table also degrades to zero rows with a
// warning rather than crashing, by the same "don't block over a docs
// formatting slip" reasoning repo-doctor uses for UNKNOWN vs BLOCKED.
// --no-vercel skips the live cross-check entirely (used by tests, and by
// anyone without the Vercel CLI authenticated locally) — the budget count
// itself never depends on Vercel being reachable.

import {
  resolveRepoRoot, loadReleasePolicy, parseDeploymentLedger, summarizeBudget,
  resolveProductionState, parseArgs, warn,
} from './lib/release-common.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();

  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    process.stderr.write(`--now was not a parseable date: "${args.now}"\n`);
    process.exit(2);
    return;
  }

  const { policy, source: policySource } = loadReleasePolicy(repoRoot);
  const ledger = parseDeploymentLedger(repoRoot);
  const budget = summarizeBudget({ entries: ledger.entries, policy, now });

  // Best-effort cross-check: what does Vercel say production is running
  // right now? This does NOT recompute deploys_this_week from Vercel — there
  // is no reliable, scriptable "deploys in a date range" surface in the CLI
  // without parsing `vercel ls` table output, and a fragile scrape has no
  // place deciding a hard budget gate. It only confirms the ledger's most
  // recent entry agrees with the live alias target, and WARNS (never fails)
  // on disagreement — the ledger stays the number of record either way.
  const useVercel = !args['no-vercel'];
  const prodState = resolveProductionState({ repoRoot, ledger, useVercel });
  const latestLedgerEntry = [...ledger.entries].sort((a, b) => b.date - a.date)[0] ?? null;
  if (
    useVercel && prodState.source === 'vercel' && latestLedgerEntry?.vercel_deployment_id &&
    prodState.deploymentId && prodState.deploymentId !== latestLedgerEntry.vercel_deployment_id
  ) {
    warn(
      `Live Vercel production deployment id (${prodState.deploymentId}) does not match the most ` +
      `recent ledger entry (${latestLedgerEntry.vercel_deployment_id}) — the ledger may be missing ` +
      'a promote. The counts below are ledger-only and may undercount.',
    );
  }

  const result = {
    ok: !budget.atOrOverCap,
    policySource,
    ledgerSource: ledger.sourceExists ? ledger.path : 'default-empty (no ledger file)',
    week: budget.weekLabel,
    weekStartUtc: budget.weekStart,
    weekEndUtc: budget.weekEnd,
    timezone: budget.timezone,
    routineMaxDeploysPerCalendarWeek: budget.max,
    deploysThisWeek: budget.deploysThisWeek,
    routineSlotsRemaining: budget.routineSlotsRemaining,
    // snake_case top-level aliases for the same two numbers — fixed
    // interface: scripts/operations' (P4) report.mjs calls this script with
    // --json and reads deploys_this_week / routine_slots_remaining at the
    // top level. Kept alongside the camelCase fields above rather than
    // replacing them so nothing else that reads this script's --json output
    // (including this repo's own release-budget.test.ts) breaks.
    deploys_this_week: budget.deploysThisWeek,
    routine_slots_remaining: budget.routineSlotsRemaining,
    atOrOverCap: budget.atOrOverCap,
    unknownShaCount: budget.unknownShaCount,
    deploysThisWeekEntries: budget.deploysThisWeekEntries.map((e) => ({
      dateUtc: e.date_utc, sha: e.sha, vercelDeploymentId: e.vercel_deployment_id, type: e.type,
    })),
    productionState: { source: prodState.source, sha: prodState.sha, deploymentId: prodState.deploymentId },
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`\nRELEASE BUDGET — ${result.week}\n`);
    process.stdout.write(`${'='.repeat(52)}\n`);
    process.stdout.write(`policy source        : ${result.policySource}\n`);
    process.stdout.write(`ledger source        : ${result.ledgerSource}\n`);
    process.stdout.write(`production (source)  : ${result.productionState.sha ?? result.productionState.deploymentId ?? 'unresolved'} (${result.productionState.source})\n`);
    process.stdout.write(`deploys this week    : ${result.deploysThisWeek} / ${result.routineMaxDeploysPerCalendarWeek}\n`);
    process.stdout.write(`routine slots left   : ${result.routineSlotsRemaining}\n`);
    for (const e of result.deploysThisWeekEntries) {
      process.stdout.write(`  - ${e.dateUtc}  sha=${e.sha}  deployment=${e.vercelDeploymentId}  type=${e.type}\n`);
    }
    process.stdout.write('\n');
    if (result.atOrOverCap) {
      process.stdout.write(
        `REFUSED: ${result.deploysThisWeek} routine production deploy(s) already happened this calendar ` +
        `week (cap ${result.routineMaxDeploysPerCalendarWeek}). The routine release workflow will not ` +
        'proceed. A true P0 does not silently override this — investigate, prepare, and let the owner ' +
        'explicitly decide (spec §16).\n\n',
      );
    } else {
      process.stdout.write(`OK: ${result.routineSlotsRemaining} routine release slot(s) remain this calendar week.\n\n`);
    }
  }

  process.exit(result.atOrOverCap ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`release:budget crashed: ${err?.stack ?? err}\n`);
  process.exit(2);
});
