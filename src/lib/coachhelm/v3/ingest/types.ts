/**
 * v3 auto-ingest adapter framework (W39-41).
 *
 * Shared types every provider adapter implements. The sync cron walks
 * all active connections and dispatches to the registered adapter
 * keyed off provider. Provider-specific HTTP clients live in their
 * own files under dimensions/.
 */

export type IngestProvider = 'arccos' | 'garmin' | 'trackman';

export const INGEST_PROVIDERS: readonly IngestProvider[] = ['arccos', 'garmin', 'trackman'];

export interface IngestConnection {
  player_id: string;
  provider: IngestProvider;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  last_synced_at: string | null;
  state: 'active' | 'expired' | 'revoked' | 'error';
}

export interface SyncResult {
  shots_inserted: number;
  rounds_inserted: number;
  errors_count: number;
  error_detail?: string;
  /** New state for the connection after the sync — adapters can flip
   *  to 'expired' (refresh failed) or 'error' (provider downtime). */
  next_state?: IngestConnection['state'];
}

/**
 * The contract every provider adapter implements. sync() is called by
 * the cron with the encrypted connection row (the adapter decrypts +
 * makes provider HTTP calls + writes rounds/shots/practice_sessions).
 */
export interface IngestAdapter {
  provider: IngestProvider;
  /** True when the adapter has its required credentials/env config. */
  isConfigured: () => boolean;
  /** Run one sync pass. Adapters must be idempotent — re-running over
   *  the same provider window must not duplicate rounds/shots. */
  sync: (connection: IngestConnection) => Promise<SyncResult>;
}

/** Compute the next state after a sync result. */
export function nextConnectionState(
  prev: IngestConnection['state'],
  result: SyncResult,
): IngestConnection['state'] {
  if (result.next_state) return result.next_state;
  if (result.errors_count > 0) return 'error';
  return prev === 'error' ? 'active' : prev; // self-heal on a clean run
}
