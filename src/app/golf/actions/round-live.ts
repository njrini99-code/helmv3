'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { fromUntyped } from '@/lib/supabase/untyped';
import { isLiveShareLevel, liveShareFailureFromError, liveShareFailureFromReason, type LiveShareFailure, type LiveShareLevel } from './round-live-errors';

/**
 * Live rounds, the player's writes (P-6, slice 2). Each is a call to a database function or a one-row upsert of the
 * player's own preferences; nothing here touches a score, a shot or the round's draft. Until migration 20261025050000 is
 * applied the functions do not exist and these answer CH-16666 ("Sharing isn't available yet."), which is why the
 * controls are only drawn when the live table is there.
 */

export type LiveShareResult =
  | { success: true; data: { share: LiveShareLevel; seq: number | null; clamped: boolean } }
  | { success: false; error: string; code: LiveShareFailure['code']; retryable: boolean };

export type LivePrefsResult = { success: true; data: { practiceShare: LiveShareLevel } } | { success: false; error: string; code: LiveShareFailure['code']; retryable: boolean };

type RpcOut = { data: unknown; error: { code?: string | null; message?: string | null } | null };
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcOut> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETRY_AFTER_BUSY_MS = 1_000;
const fail = (f: LiveShareFailure): { success: false; error: string; code: LiveShareFailure['code']; retryable: boolean } => ({ success: false, error: f.error, code: f.code, retryable: f.retryable });

async function callShare(fn: string, args: Record<string, unknown>): Promise<{ result: Record<string, unknown> } | { failure: LiveShareFailure }> {
  const supabase = (await createClient()) as unknown as RpcClient;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    await logServerError(`${fn} failed: ${error.message ?? error.code ?? 'unknown'}`, { action: fn, feature: 'round_tracking', extra: { errorCode: error.code } });
    return { failure: liveShareFailureFromError(error) };
  }
  const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return { result };
}

/**
 * Change a round's live sharing. `busy` (the round or its live row was locked for a moment) is retried once after a
 * second, then reported as CH-16664. A qualifier or tournament round cannot go below coaches: the database floors it
 * and says so (`clamped`).
 */
async function setLiveShareImpl(roundId: string, share: LiveShareLevel, remember = true): Promise<LiveShareResult> {
  if (!UUID.test(roundId) || !isLiveShareLevel(share)) return fail(liveShareFailureFromReason('invalid_share'));
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const out = await callShare('golf_round_live_set_share', { p_round_id: roundId, p_share: share, p_remember: remember });
      if ('failure' in out) return fail(out.failure);
      const r = out.result;
      if (r.ok === true && isLiveShareLevel(r.share)) {
        return { success: true, data: { share: r.share, seq: typeof r.seq === 'number' ? r.seq : null, clamped: r.clamped === true } };
      }
      const reason = typeof r.error === 'string' ? r.error : undefined;
      if (reason === 'busy' && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_BUSY_MS));
        continue;
      }
      return fail(liveShareFailureFromReason(reason));
    }
    return fail(liveShareFailureFromReason('busy'));
  } catch (error) {
    await logServerError(`setLiveShare failed: ${describeError(error)}`, { action: 'setLiveShare', feature: 'round_tracking', extra: { roundId } });
    return fail(liveShareFailureFromReason(undefined));
  }
}

/**
 * Round setup: the sharing level for the round about to be created (held for that one round, and cleared by the
 * database once it has been used). `remember` also makes it the default for future practice rounds.
 */
async function setNextLiveShareImpl(share: LiveShareLevel, remember = false): Promise<LiveShareResult> {
  if (!isLiveShareLevel(share)) return fail(liveShareFailureFromReason('invalid_share'));
  try {
    const out = await callShare('golf_round_live_set_next_share', { p_share: share, p_remember: remember });
    if ('failure' in out) return fail(out.failure);
    const r = out.result;
    if (r.ok === true) return { success: true, data: { share, seq: null, clamped: false } };
    return fail(liveShareFailureFromReason(typeof r.error === 'string' ? r.error : undefined));
  } catch (error) {
    await logServerError(`setNextLiveShare failed: ${describeError(error)}`, { action: 'setNextLiveShare', feature: 'round_tracking' });
    return fail(liveShareFailureFromReason(undefined));
  }
}

/** Settings: the default sharing level for the player's practice rounds (their own one-row preference). */
async function setLivePrefsImpl(prefs: { practiceShare: LiveShareLevel }): Promise<LivePrefsResult> {
  if (!isLiveShareLevel(prefs?.practiceShare)) return fail(liveShareFailureFromReason('invalid_share'));
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return fail(liveShareFailureFromReason(undefined));
    const { data: player, error: playerError } = await supabase.from('golf_players').select('id').eq('user_id', user.id).maybeSingle();
    if (playerError || !player) return fail(liveShareFailureFromReason('not_found'));
    const { error } = await fromUntyped(supabase, 'golf_round_live_prefs').upsert(
      { player_id: player.id, practice_share: prefs.practiceShare, updated_at: new Date().toISOString() },
      { onConflict: 'player_id' },
    );
    if (error) {
      await logServerError(`setLivePrefs failed: ${error.message}`, { action: 'setLivePrefs', feature: 'round_tracking', extra: { errorCode: error.code } });
      return fail(liveShareFailureFromError(error));
    }
    return { success: true, data: { practiceShare: prefs.practiceShare } };
  } catch (error) {
    await logServerError(`setLivePrefs failed: ${describeError(error)}`, { action: 'setLivePrefs', feature: 'round_tracking' });
    return fail(liveShareFailureFromReason(undefined));
  }
}

const observedSetLiveShare = withAdminObserved('setLiveShare', { sport: 'golf', feature: 'round_tracking' }, setLiveShareImpl);
const observedSetNextLiveShare = withAdminObserved('setNextLiveShare', { sport: 'golf', feature: 'round_tracking' }, setNextLiveShareImpl);
const observedSetLivePrefs = withAdminObserved('setLivePrefs', { sport: 'golf', feature: 'round_tracking' }, setLivePrefsImpl);

export async function setLiveShare(roundId: string, share: LiveShareLevel, remember = true): Promise<LiveShareResult> {
  return observedSetLiveShare(roundId, share, remember);
}

export async function setNextLiveShare(share: LiveShareLevel, remember = false): Promise<LiveShareResult> {
  return observedSetNextLiveShare(share, remember);
}

export async function setLivePrefs(prefs: { practiceShare: LiveShareLevel }): Promise<LivePrefsResult> {
  return observedSetLivePrefs(prefs);
}
