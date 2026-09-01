/**
 * A `round_missing` result must never reach the player as the literal key.
 *
 * MEASURED 2026-09-01 (review of HEAD 6a7577c71, production at fb425aa2b):
 * `submitGolfRoundComprehensive` returns `{ error: 'round_missing' }` once it
 * has PROVED the target row does not exist (#1705, 6cc92de43), with the comment
 * that the client "may re-submit as new". No client did. New Round threw it,
 * `isRecoverableRoundSubmitError('round_missing')` matched neither pattern
 * list, and `FairwayRoundSubmitOverlay` rendered the raw string
 * "round_missing" under "Submission failed". Continue Round was identical, the
 * recovery screen did `setError(result.error)`, and the v1 sync drain retried
 * the same dead id on every cycle.
 *
 * THE INVARIANT pinned here: a round write that comes back `round_missing`
 * against an id is re-issued once WITHOUT an id — the server's no-id branch
 * creates the row from the same full snapshot and, for submit, completes it in
 * the same atomic call — and if that second write fails too the caller gets a
 * sentence a player can act on, never a key. Nothing here touches local
 * storage: preserving the device snapshot on failure is the caller's job, and
 * every caller only clears after `success`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ROUND_MISSING_ERROR,
  ROUND_RECREATE_FAILED_MESSAGE,
  describeRoundWriteFailure,
  writeRoundRecreatingIfMissing,
  type RoundWriteResult,
} from '../round-missing-recovery';

const DEAD_ROUND = 'a45714a0-62fa-4e9b-bfe5-a25e71ca6bc9';
const NEW_ROUND = '33333333-3333-4333-8333-333333333333';

type Result = RoundWriteResult<{ roundId: string; updatedAt?: string }>;

describe('writeRoundRecreatingIfMissing', () => {
  it('passes a success straight through and writes exactly once', async () => {
    const action = vi.fn(async (): Promise<Result> => ({ success: true, data: { roundId: DEAD_ROUND } }));

    const outcome = await writeRoundRecreatingIfMissing(action, { any: 'payload' }, DEAD_ROUND);

    expect(outcome).toEqual({
      result: { success: true, data: { roundId: DEAD_ROUND } },
      recreated: false,
      staleRoundId: null,
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ any: 'payload' }, DEAD_ROUND);
  });

  it('passes every other failure through untouched — conflict is not a reason to re-create', async () => {
    const action = vi.fn(async (): Promise<Result> => ({ success: false, error: 'conflict' }));

    const outcome = await writeRoundRecreatingIfMissing(action, {}, DEAD_ROUND);

    expect(outcome.result).toEqual({ success: false, error: 'conflict' });
    expect(outcome.recreated).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('re-issues the SAME snapshot without an id when the target round is gone', async () => {
    const action = vi.fn(async (_data: unknown, existingRoundId?: string): Promise<Result> =>
      existingRoundId
        ? { success: false, error: ROUND_MISSING_ERROR }
        : { success: true, data: { roundId: NEW_ROUND, updatedAt: '2026-09-01T03:00:00Z' } });
    const onRoundMissing = vi.fn();
    const snapshot = { holes: [1, 2, 3] };

    const outcome = await writeRoundRecreatingIfMissing(action, snapshot, DEAD_ROUND, { onRoundMissing });

    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[0]).toEqual([snapshot, DEAD_ROUND]);
    expect(action.mock.calls[1]).toEqual([snapshot, undefined]);
    // The caller learns which id died so it can re-key any device snapshot
    // still stored under it — and learns it BEFORE the re-create runs.
    expect(onRoundMissing).toHaveBeenCalledWith(DEAD_ROUND);
    expect(onRoundMissing.mock.invocationCallOrder[0]).toBeLessThan(action.mock.invocationCallOrder[1]!);
    expect(outcome).toEqual({
      result: { success: true, data: { roundId: NEW_ROUND, updatedAt: '2026-09-01T03:00:00Z' } },
      recreated: true,
      staleRoundId: DEAD_ROUND,
    });
  });

  it('turns a failed re-create into a sentence, never the raw key, and keeps the code', async () => {
    const action = vi.fn(async (_data: unknown, existingRoundId?: string): Promise<Result> =>
      existingRoundId
        ? { success: false, error: ROUND_MISSING_ERROR }
        : { success: false, error: 'busy' });

    const outcome = await writeRoundRecreatingIfMissing(action, {}, DEAD_ROUND);

    expect(outcome.recreated).toBe(true);
    expect(outcome.staleRoundId).toBe(DEAD_ROUND);
    expect(outcome.result.success).toBe(false);
    if (outcome.result.success) throw new Error('unreachable');
    expect(outcome.result.error).not.toBe('busy');
    expect(outcome.result.error).not.toBe(ROUND_MISSING_ERROR);
    expect(outcome.result.error).toMatch(/try again/i);
    expect(outcome.result.code).toBe(ROUND_MISSING_ERROR);
  });

  it('never re-creates more than once — a second round_missing is reported, not looped', async () => {
    const action = vi.fn(async (): Promise<Result> => ({ success: false, error: ROUND_MISSING_ERROR }));

    const outcome = await writeRoundRecreatingIfMissing(action, {}, DEAD_ROUND);

    expect(action).toHaveBeenCalledTimes(2);
    expect(outcome.result).toEqual({
      success: false,
      error: ROUND_RECREATE_FAILED_MESSAGE,
      code: ROUND_MISSING_ERROR,
    });
  });

  it('does not retry when there was no id to lose, but still hides the key', async () => {
    const action = vi.fn(async (): Promise<Result> => ({ success: false, error: ROUND_MISSING_ERROR }));

    const outcome = await writeRoundRecreatingIfMissing(action, {}, undefined);

    expect(action).toHaveBeenCalledTimes(1);
    expect(outcome.recreated).toBe(false);
    expect(outcome.result).toEqual({
      success: false,
      error: ROUND_RECREATE_FAILED_MESSAGE,
      code: ROUND_MISSING_ERROR,
    });
  });
});

describe('describeRoundWriteFailure', () => {
  it('maps every bare signal key the round actions return to a sentence', () => {
    for (const key of ['busy', 'retry', 'conflict', ROUND_MISSING_ERROR]) {
      const described = describeRoundWriteFailure(key);
      expect(described).not.toBe(key);
      expect(described.length).toBeGreaterThan(20);
      expect(described).toMatch(/[.!]$/);
    }
  });

  it('leaves a message that is already a sentence alone', () => {
    expect(describeRoundWriteFailure('Failed to save round. Please try again.'))
      .toBe('Failed to save round. Please try again.');
  });

  it('never returns an empty string', () => {
    expect(describeRoundWriteFailure(undefined).length).toBeGreaterThan(0);
    expect(describeRoundWriteFailure('').length).toBeGreaterThan(0);
  });
});
