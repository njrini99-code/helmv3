/**
 * Recovery for a round write whose target row no longer exists.
 *
 * `savePartialRound` and `submitGolfRoundComprehensive` answer `round_missing`
 * only after proving there is no row for the id they were given (see the
 * `ROUND_MISSING_RPC_ERROR` / `SUBMIT_ROUND_UNAVAILABLE` handling in
 * src/app/golf/actions/golf.ts). Retrying the same id can never succeed. Both
 * actions carry the COMPLETE round snapshot on every call, and both have a
 * no-id branch that creates the row from that snapshot — for submit, it also
 * completes the round inside the same atomic RPC. So the correct response is
 * to re-issue the identical write once, without the id.
 *
 * This module is client-safe (no server imports) and owns nothing but that
 * decision. Device snapshots are the caller's: every caller clears them only
 * after `success`, so a failed re-create leaves the local round intact.
 *
 * Why a helper rather than four copies: measured 2026-09-01, the four call
 * sites (New Round submit, Continue Round submit, the recovery screen, the v1
 * sync drain) each handled `round_missing` differently — three showed the
 * literal key to the player and one retried the dead id every cycle.
 */

export const ROUND_MISSING_ERROR = 'round_missing';

/**
 * Shown when the re-create itself fails with no better sentence available.
 * The local snapshot is untouched by then, and saying so is the point.
 */
export const ROUND_RECREATE_FAILED_MESSAGE =
  'This round is no longer on the server and could not be re-created yet. '
  + 'Every hole is still saved on this device — check your connection and try again.';

export type RoundWriteResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type RoundWriteAction<TData, TResult> = (
  data: TData,
  existingRoundId?: string,
) => Promise<RoundWriteResult<TResult>>;

export interface RoundWriteOutcome<TResult> {
  result: RoundWriteResult<TResult>;
  /** True when the first write reported `round_missing` and a re-create ran. */
  recreated: boolean;
  /** The id the first write targeted, when a re-create ran; the caller re-keys any device snapshot stored under it. */
  staleRoundId: string | null;
}

export interface RoundWriteHooks {
  /**
   * Called with the dead id BEFORE the re-create runs, so a caller can forget
   * the id (and the `updated_at` that belonged to it) ahead of the new write.
   */
  onRoundMissing?: (staleRoundId: string) => void | Promise<void>;
}

/**
 * The bare signal keys the round actions return instead of sentences. Anything
 * else the actions return is already player-readable.
 */
const SIGNAL_KEY_MESSAGES: Readonly<Record<string, string>> = {
  busy: 'Another save for this round is just finishing. Try again in a moment.',
  retry: 'That save did not go through. Your shots are still on this device. Please try again.',
  conflict: 'This round was updated on another device. Please reload before continuing.',
  [ROUND_MISSING_ERROR]: ROUND_RECREATE_FAILED_MESSAGE,
};

/** A player-readable sentence for any round-write failure string. */
export function describeRoundWriteFailure(error: string | undefined): string {
  const trimmed = (error ?? '').trim();
  if (trimmed.length === 0) return ROUND_RECREATE_FAILED_MESSAGE;
  return SIGNAL_KEY_MESSAGES[trimmed] ?? trimmed;
}

/**
 * Run a round write; if it reports `round_missing` against an id, run it once
 * more without the id. A second failure comes back as a sentence, never a key,
 * with `code: 'round_missing'` preserved for anything that classifies it.
 */
export async function writeRoundRecreatingIfMissing<TData, TResult extends { roundId: string }>(
  action: RoundWriteAction<TData, TResult>,
  data: TData,
  existingRoundId: string | undefined,
  hooks?: RoundWriteHooks,
): Promise<RoundWriteOutcome<TResult>> {
  const first = await action(data, existingRoundId);
  if (first.success || first.error !== ROUND_MISSING_ERROR) {
    return { result: first, recreated: false, staleRoundId: null };
  }

  if (!existingRoundId) {
    // Nothing to re-create from: the write already had no id. Do not loop —
    // report it in words and leave the device snapshot to the caller.
    return {
      result: { success: false, error: ROUND_RECREATE_FAILED_MESSAGE, code: ROUND_MISSING_ERROR },
      recreated: false,
      staleRoundId: null,
    };
  }

  await hooks?.onRoundMissing?.(existingRoundId);

  const second = await action(data, undefined);
  if (second.success) {
    return { result: second, recreated: true, staleRoundId: existingRoundId };
  }
  return {
    result: {
      success: false,
      error: describeRoundWriteFailure(second.error),
      code: second.code ?? ROUND_MISSING_ERROR,
    },
    recreated: true,
    staleRoundId: existingRoundId,
  };
}
