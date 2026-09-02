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
  ROUND_CONFLICT_MESSAGE,
  ROUND_MISSING_ERROR,
  ROUND_RECREATE_FAILED_MESSAGE,
  describeRoundWriteFailure,
  describeRoundWriteResult,
  isQualifierClosedError,
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
    // A 3rd (options) argument is always passed through now — `undefined`
    // here since no `firstCallOptions` was given.
    expect(action).toHaveBeenCalledWith({ any: 'payload' }, DEAD_ROUND, undefined);
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
    // A 3rd (options) argument is always passed through now — `undefined`
    // here since no `firstCallOptions` was given — see the
    // firstCallOptions-specific test below for the case where one is.
    expect(action.mock.calls[0]).toEqual([snapshot, DEAD_ROUND, undefined]);
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

  /**
   * A1 (2026-09-02) — `savePartialRound` gained a 3rd `options` parameter
   * (`{ allowReuse?: boolean }`). `hooks.firstCallOptions` forwards it to
   * ONLY the caller's own first write, never to the round_missing re-create
   * retry: that retry's intent is CREATE (the server already proved the
   * given id is gone), and forwarding reuse intent there would re-open
   * exactly the merge-into-an-unrelated-round hazard A1 closed.
   */
  it('forwards firstCallOptions to the first write only, never to the round_missing recreate retry', async () => {
    type OptResult = RoundWriteResult<{ roundId: string }>;
    const action = vi.fn(async (_data: unknown, existingRoundId?: string): Promise<OptResult> =>
      existingRoundId
        ? { success: false, error: ROUND_MISSING_ERROR }
        : { success: true, data: { roundId: NEW_ROUND } });
    const snapshot = { holes: [] };

    await writeRoundRecreatingIfMissing(action, snapshot, DEAD_ROUND, {
      firstCallOptions: { allowReuse: true },
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[0]).toEqual([snapshot, DEAD_ROUND, { allowReuse: true }]);
    // The recreate retry carries no options at all — not even `undefined`
    // explicitly forwarded — matching the plain no-hooks call shape.
    expect(action.mock.calls[1]).toEqual([snapshot, undefined]);
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

  it('exposes the conflict sentence as the single source both write-blocking UI and this map draw from (B6)', () => {
    expect(describeRoundWriteFailure('conflict')).toBe(ROUND_CONFLICT_MESSAGE);
  });
});

// B6: one helper every round-write call site uses instead of inventing its
// own branch on `result.error === 'hole_invalid'`. The two round-write
// actions disagree on WHERE the human sentence lives for this code:
// `savePartialRound` returns the bare key in `error` with the sentence in a
// separate `message` field; `submitGolfRoundComprehensive`'s own Zod-failure
// path already puts the sentence directly in `error` (only `code` says
// 'hole_invalid'). A single result-shaped helper must get both right without
// the caller needing to know which action produced the result.
describe('describeRoundWriteResult', () => {
  it('prefers `message` when the bare `hole_invalid` key is in `error` (savePartialRound shape)', () => {
    const result = {
      success: false as const,
      error: 'hole_invalid',
      code: 'hole_invalid',
      hole: 4,
      field: 'distanceToHoleBefore',
      message: 'Hole 4, shot 1: distance to the hole must be 1000 yards or less.',
    };
    expect(describeRoundWriteResult(result)).toBe(result.message);
  });

  it('uses `error` directly when it is already the sentence (submitGolfRoundComprehensive shape)', () => {
    const result = {
      success: false as const,
      error: 'Hole 2, shot 3: strokes must be 20 or less.',
      code: 'hole_invalid',
    };
    expect(describeRoundWriteResult(result)).toBe(result.error);
  });

  it('falls back to describeRoundWriteFailure for every other signal key', () => {
    expect(describeRoundWriteResult({ error: 'busy' }))
      .toBe(describeRoundWriteFailure('busy'));
    expect(describeRoundWriteResult({ error: 'round_missing', code: 'round_missing' }))
      .toBe(describeRoundWriteFailure('round_missing'));
  });

  it('never returns an empty string, even with nothing to work from', () => {
    expect(describeRoundWriteResult(undefined).length).toBeGreaterThan(0);
    expect(describeRoundWriteResult({ error: '' }).length).toBeGreaterThan(0);
  });
});

/**
 * C3: the qualifier-closed refusal from `submit_round_atomic`
 * (`supabase/migrations/20260823000000_preserve_started_round_identity.sql`,
 * the guard's `new_update_anchor` block) ALSO contains "already been
 * completed" — about the QUALIFIER, not the round — and both round screens'
 * `isCompletedRoundError` matched it as a substring, redirecting to the
 * round's own detail page. That page redirects BACK to Continue Round for an
 * `in_progress` round (the refusal fires before any write, so the round
 * never actually completes), looping submit forever. `isQualifierClosedError`
 * is checked FIRST and excluded from `isCompletedRoundError`'s own match in
 * both screens.
 */
describe('isQualifierClosedError', () => {
  it('matches the literal RPC refusal (20260823000000_preserve_started_round_identity.sql)', () => {
    expect(isQualifierClosedError(
      'This qualifier has already been completed. Rounds can no longer be submitted.',
    )).toBe(true);
  });

  it('does not match the round-already-completed sentences (golf.ts)', () => {
    expect(isQualifierClosedError(
      'This round has already been submitted. It cannot be submitted again.',
    )).toBe(false);
    expect(isQualifierClosedError('This round may have already been completed.')).toBe(false);
  });

  it('does not match a bare "already completed" with no mention of a qualifier', () => {
    expect(isQualifierClosedError('This round is already completed.')).toBe(false);
  });

  it('handles non-string input', () => {
    expect(isQualifierClosedError(undefined)).toBe(false);
  });
});
