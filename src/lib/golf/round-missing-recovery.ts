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

/**
 * B2/B6: the ONE sentence for an optimistic-lock conflict, shared by the bare
 * `'conflict'` signal key below and by the write-blocking UI
 * (`new-round-client.tsx` / `continue-round-client.tsx`) that engages once a
 * conflict or polling-detected staleness proves this device is behind the
 * server. A save/submit RPC's `conflict` result and a background status
 * poll's staleness are the same underlying fact — the round moved on another
 * device — and must read as the same instruction to the player, not two
 * differently-worded warnings depending on which code path noticed it.
 */
export const ROUND_CONFLICT_MESSAGE =
  'This round was updated on another device. Reload to continue.';

export type RoundWriteResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * `TOptions` is a 3rd, optional call-shape parameter — `savePartialRound`'s
 * `{ allowReuse?: boolean }` (see its own header, A1) — that
 * `submitGolfRoundComprehensive` does not have. Defaulting it to `never`
 * keeps every existing 2-arg action assignable here unchanged.
 */
export type RoundWriteAction<TData, TResult, TOptions = never> = (
  data: TData,
  existingRoundId?: string,
  options?: TOptions,
) => Promise<RoundWriteResult<TResult>>;

export interface RoundWriteOutcome<TResult> {
  result: RoundWriteResult<TResult>;
  /** True when the first write reported `round_missing` and a re-create ran. */
  recreated: boolean;
  /** The id the first write targeted, when a re-create ran; the caller re-keys any device snapshot stored under it. */
  staleRoundId: string | null;
}

export interface RoundWriteHooks<TOptions = never> {
  /**
   * Called with the dead id BEFORE the re-create runs, so a caller can forget
   * the id (and the `updated_at` that belonged to it) ahead of the new write.
   */
  onRoundMissing?: (staleRoundId: string) => void | Promise<void>;
  /**
   * Passed to ONLY the first write below — never to the round_missing
   * re-create retry. That retry's intent is CREATE (the server already
   * proved the given id is gone), so it must never carry reuse intent: doing
   * so would re-open exactly the merge-into-an-unrelated-round hazard A1
   * closed. Set this when the CALLER's own first write is itself a
   * recovery/restore (a real device snapshot being reconnected to the
   * server, not a plain "begin new" call) — see `savePartialRound`'s
   * `allowReuse` option.
   */
  firstCallOptions?: TOptions;
}

/**
 * The bare signal keys the round actions return instead of sentences. Anything
 * else the actions return is already player-readable.
 */
const SIGNAL_KEY_MESSAGES: Readonly<Record<string, string>> = {
  busy: 'Another save for this round is just finishing. Try again in a moment.',
  retry: 'That save did not go through. Your shots are still on this device. Please try again.',
  conflict: ROUND_CONFLICT_MESSAGE,
  [ROUND_MISSING_ERROR]: ROUND_RECREATE_FAILED_MESSAGE,
  // Fallback only — `describeRoundWriteResult` below prefers the specific
  // hole/field sentence carried alongside this key. This bare-key mapping is
  // what a caller sees if it (incorrectly) passes only `result.error` for a
  // hole_invalid result instead of the full result object.
  hole_invalid: 'One of your holes needs a fix before this can be saved. Open it to see what to change.',
};

/** A player-readable sentence for any round-write failure string. */
export function describeRoundWriteFailure(error: string | undefined): string {
  const trimmed = (error ?? '').trim();
  if (trimmed.length === 0) return ROUND_RECREATE_FAILED_MESSAGE;
  return SIGNAL_KEY_MESSAGES[trimmed] ?? trimmed;
}

/**
 * B6: the one helper every round-write call site should use to turn a
 * failed `ActionResult` into a player-facing sentence, instead of each site
 * inventing its own branch on `result.error === 'hole_invalid'` (or worse,
 * showing `result.error` unconditionally and rendering a bare signal key).
 *
 * `savePartialRound`'s `hole_invalid` result carries the bare key in `error`
 * with the real sentence in a separate `message` field; `submitGolfRoundComprehensive`'s
 * own Zod-failure path instead puts the sentence directly in `error` (only
 * `code` says `'hole_invalid'`). This accepts either shape.
 */
export function describeRoundWriteResult(
  result: { error?: string; message?: string; code?: string } | null | undefined,
): string {
  if (!result) return ROUND_RECREATE_FAILED_MESSAGE;
  if (result.code === 'hole_invalid' && typeof result.message === 'string' && result.message.trim().length > 0) {
    return result.message;
  }
  return describeRoundWriteFailure(result.error);
}

/**
 * Run a round write; if it reports `round_missing` against an id, run it once
 * more without the id. A second failure comes back as a sentence, never a key,
 * with `code: 'round_missing'` preserved for anything that classifies it.
 */
export async function writeRoundRecreatingIfMissing<TData, TResult extends { roundId: string }, TOptions = never>(
  action: RoundWriteAction<TData, TResult, TOptions>,
  data: TData,
  existingRoundId: string | undefined,
  hooks?: RoundWriteHooks<TOptions>,
): Promise<RoundWriteOutcome<TResult>> {
  const first = await action(data, existingRoundId, hooks?.firstCallOptions);
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

  // Deliberately NO options here — see RoundWriteHooks.firstCallOptions.
  // This retry's intent is CREATE (the server already proved the given id is
  // gone), never reuse.
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
