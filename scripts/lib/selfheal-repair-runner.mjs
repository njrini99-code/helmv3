// scripts/lib/selfheal-repair-runner.mjs — the outer contract around a Repair run.
//
// WHAT THIS OWNS, AND WHAT IT DOES NOT
//
//   Claude owns the NORMAL final heartbeat. It knows what it did — candidates,
//   confirmed, corrected, PRs opened — and this file must never invent any of
//   those numbers.
//
//   The outer runner owns exactly one thing: recording that the RUN ITSELF
//   failed, in the case where Claude never got far enough to say so.
//
// WHY IT IS NEEDED
//
//   The 06:40 scheduled Repair run hung for 30 minutes, was killed by the
//   watchdog, and wrote NOTHING. `/admin/jobs` therefore could not tell that
//   from a laptop that was asleep — which is the exact confusion the heartbeat
//   exists to prevent, reproduced at the layer above it.
//
// THE RULE THAT MAKES THIS SAFE
//
//   A fallback row is written ONLY after a SUCCESSFUL read proves no heartbeat
//   exists for this run. If the heartbeat store cannot be read, the answer is
//   UNKNOWN and nothing is written:
//
//       heartbeat query failed   !=   heartbeat absent
//
//   Writing on an unreadable store would manufacture failures during a
//   Supabase outage — inventing bad news is no better than inventing good.
//
//   Identity is a per-run UUID (`HELM_REPAIR_RUN_ID`), not a timestamp window.
//   Timestamps cannot distinguish "this run" from "a run that happened to
//   overlap", and inferring absence from a time range is how a healthy run gets
//   a spurious failure row.

/** @typedef {{kind:'heartbeat-present', childExit:number}
 *          | {kind:'fallback-written', childExit:number, timeout:boolean}
 *          | {kind:'fallback-failed', childExit:number, error:string}
 *          | {kind:'heartbeat-state-unknown', childExit:number, error:string}} RepairRunnerResult */

/** timeout(1)'s code, and what scripts/run-bounded.mjs exits with. */
export const TIMEOUT_EXIT_CODE = 124;

/**
 * Decide what the outer runner should record, given how the child ended.
 *
 * @param {object} input
 * @param {string} input.runId
 * @param {number} input.childExit
 * @param {string} input.startedAt   ISO
 * @param {string} input.completedAt ISO
 * @param {import('./selfheal-repair-runner.mjs').RepairHeartbeatStore} input.store
 * @returns {Promise<RepairRunnerResult>}
 */
export async function reconcileRepairRun({ runId, childExit, startedAt, completedAt, store }) {
  const timeout = childExit === TIMEOUT_EXIT_CODE;

  const lookup = await store.findByRunId(runId);

  // UNKNOWN. Never infer absence from a failed read, and never write on it.
  if (!lookup.readable) {
    return { kind: 'heartbeat-state-unknown', childExit, error: lookup.error };
  }

  // Claude wrote its own row. It knows more than this wrapper ever will, and a
  // second row for one run would double-count on every board that reads them.
  if (lookup.found) {
    return { kind: 'heartbeat-present', childExit };
  }

  // A successful read proved there is no row. Even childExit === 0 lands here:
  // exiting cleanly without writing the contract's final heartbeat means the
  // run did not complete its contract, whatever the exit code claimed.
  const errorMessage = timeout
    ? 'runner timeout: the Repair child exceeded its deadline and wrote no heartbeat'
    : childExit === 0
      ? 'child exited 0 without writing the final Repair heartbeat'
      : `child exited ${childExit} without writing the final Repair heartbeat`;

  const write = await store.insertRunnerFailure({
    runId,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    childExit,
    timeout,
    errorMessage,
  });

  if (!write.ok) {
    // The wrapper could not record its own failure. Say so rather than
    // reporting a fallback that does not exist.
    return { kind: 'fallback-failed', childExit, error: write.error };
  }

  return { kind: 'fallback-written', childExit, timeout };
}
