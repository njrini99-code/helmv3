/**
 * The outer Repair runner's contract: a run that fails before Claude can speak
 * must still leave evidence — but only evidence the runner can actually prove.
 *
 * WHY THIS EXISTS. The 06:40 scheduled Repair run hung for 30 minutes, was
 * killed by the watchdog, and wrote NOTHING. `/admin/jobs` could not tell that
 * from a laptop that was asleep — the exact confusion the heartbeat exists to
 * prevent, reproduced one layer above it.
 *
 * THE RULE THAT MAKES IT SAFE. A fallback row is written ONLY after a
 * SUCCESSFUL read proves no heartbeat exists for this run:
 *
 *     heartbeat query failed   !=   heartbeat absent
 *
 * Writing on an unreadable store would manufacture failure rows during a
 * Supabase outage. Inventing bad news is no better than inventing good news,
 * and it is the same unknown-vs-none error this program keeps closing.
 *
 * Identity is a per-run UUID, never a timestamp window: timestamps cannot
 * distinguish "this run" from "a run that happened to overlap".
 */
import { describe, it, expect, vi } from 'vitest';
import { reconcileRepairRun, TIMEOUT_EXIT_CODE } from '../../../scripts/lib/selfheal-repair-runner.mjs';

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const STARTED = '2026-08-29T06:40:00.000Z';
const COMPLETED = '2026-08-29T07:10:00.000Z';

/** A fake heartbeat store. Unit tests never touch production Supabase. */
function store(opts: {
  lookup: { readable: true; found: boolean } | { readable: false; error: string };
  insert?: { ok: true } | { ok: false; error: string };
}) {
  const inserts: unknown[] = [];
  return {
    inserts,
    findByRunId: vi.fn(async () => opts.lookup),
    insertRunnerFailure: vi.fn(async (row: unknown) => {
      inserts.push(row);
      return opts.insert ?? { ok: true as const };
    }),
  };
}

const run = (childExit: number, s: ReturnType<typeof store>) =>
  reconcileRepairRun({ runId: RUN_ID, childExit, startedAt: STARTED, completedAt: COMPLETED, store: s as never });

describe('reconcileRepairRun — the runner records only what it can prove', () => {
  it('Claude wrote its own heartbeat: the runner writes nothing', async () => {
    const s = store({ lookup: { readable: true, found: true } });
    const result = await run(0, s);

    expect(result).toEqual({ kind: 'heartbeat-present', childExit: 0 });
    expect(s.insertRunnerFailure).not.toHaveBeenCalled();
  });

  it('TIMEOUT with no heartbeat: one fallback row, marked as a timeout', async () => {
    const s = store({ lookup: { readable: true, found: false } });
    const result = await run(TIMEOUT_EXIT_CODE, s);

    expect(result).toEqual({ kind: 'fallback-written', childExit: 124, timeout: true });
    expect(s.insertRunnerFailure).toHaveBeenCalledTimes(1);
    expect(s.inserts[0]).toMatchObject({
      runId: RUN_ID,
      childExit: 124,
      timeout: true,
      durationMs: 30 * 60 * 1000,
    });
    expect((s.inserts[0] as { errorMessage: string }).errorMessage).toMatch(/timeout/i);
  });

  it('non-zero exit with no heartbeat: fallback, but NOT labelled a timeout', async () => {
    // The distinction the operator needs: a crash is not a hang, and treating
    // every runner failure as a timeout would hide which one happened.
    const s = store({ lookup: { readable: true, found: false } });
    const result = await run(1, s);

    expect(result).toEqual({ kind: 'fallback-written', childExit: 1, timeout: false });
    expect(s.inserts[0]).toMatchObject({ childExit: 1, timeout: false });
  });

  it('exit 0 with no heartbeat is still a FAILURE', async () => {
    // Exiting cleanly without writing the contract's final heartbeat means the
    // run did not complete its contract, whatever the exit code claimed.
    const s = store({ lookup: { readable: true, found: false } });
    const result = await run(0, s);

    expect(result).toEqual({ kind: 'fallback-written', childExit: 0, timeout: false });
    expect((s.inserts[0] as { errorMessage: string }).errorMessage).toMatch(/without writing the final Repair heartbeat/);
  });

  it('heartbeat store UNREADABLE: nothing is written, and the state says unknown', async () => {
    // The heart of it. A failed read is not proof of absence, and writing on it
    // would manufacture failure rows during a Supabase outage.
    const s = store({ lookup: { readable: false, error: 'permission denied' } });
    const result = await run(TIMEOUT_EXIT_CODE, s);

    expect(result).toEqual({
      kind: 'heartbeat-state-unknown',
      childExit: 124,
      error: 'permission denied',
    });
    expect(s.insertRunnerFailure).not.toHaveBeenCalled();
  });

  it('a failed fallback WRITE is reported, not silently swallowed', async () => {
    const s = store({
      lookup: { readable: true, found: false },
      insert: { ok: false, error: 'insert denied' },
    });
    const result = await run(TIMEOUT_EXIT_CODE, s);

    expect(result).toEqual({ kind: 'fallback-failed', childExit: 124, error: 'insert denied' });
  });

  it('the run is identified by run_id, and only that run_id is looked up', async () => {
    // Not a timestamp window: timestamps cannot tell "this run" from "a run
    // that happened to overlap", and inferring absence from a range is how a
    // healthy run earns a spurious failure row.
    const s = store({ lookup: { readable: true, found: true } });
    await run(0, s);

    expect(s.findByRunId).toHaveBeenCalledWith(RUN_ID);
  });
});
