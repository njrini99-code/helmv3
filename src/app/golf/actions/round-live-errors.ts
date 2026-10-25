import { SHARE_COPY } from '@/clubhouse/live/copy';

/**
 * Live sharing (P-6): what the database's answer to a share change means to the person, in one place. A plain module
 * beside round-live.ts because a 'use server' file may export only async functions. The words are the Clubhouse's
 * (CH-16664 to CH-16666); the codes travel with them so the toast can name the failure.
 */

export type LiveShareLevel = 'off' | 'coaches' | 'team';

export const LIVE_SHARE_LEVELS: readonly LiveShareLevel[] = ['off', 'coaches', 'team'];
export const isLiveShareLevel = (value: unknown): value is LiveShareLevel => typeof value === 'string' && (LIVE_SHARE_LEVELS as readonly string[]).includes(value);

export interface LiveShareFailure {
  code: 'CH-16664' | 'CH-16665' | 'CH-16666';
  error: string;
  /** Whether trying again can change the answer (a busy round can; a missing function cannot). */
  retryable: boolean;
}

/** A Postgres error from the RPC call itself (the function is not in the database yet, or the call failed). */
export function liveShareFailureFromError(error: { code?: string | null; message?: string | null }): LiveShareFailure {
  // PGRST202 / 42883: the function is not in the database yet (migration 1 is held). The control is normally not drawn then.
  if (error.code === 'PGRST202' || error.code === '42883') return { code: 'CH-16666', error: SHARE_COPY.unavailable, retryable: false };
  return { code: 'CH-16664', error: SHARE_COPY.error, retryable: true };
}

/** The function's own refusal (`{ ok: false, error }`): invalid_share, not_found, not_in_progress, no_team, not_live, busy, too_many_changes. */
export function liveShareFailureFromReason(reason: string | undefined): LiveShareFailure {
  if (reason === 'too_many_changes') return { code: 'CH-16665', error: SHARE_COPY.tooMany, retryable: false };
  return { code: 'CH-16664', error: SHARE_COPY.error, retryable: reason === 'busy' };
}
