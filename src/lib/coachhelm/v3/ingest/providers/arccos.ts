/**
 * Arccos ingest adapter (W39 stub).
 *
 * Arccos uses OAuth 2.0 — the live integration requires:
 *   - ARCCOS_CLIENT_ID + ARCCOS_CLIENT_SECRET env vars
 *   - Approved developer partnership (Arccos vets each org)
 *   - Token refresh on 401 → refresh_token flow → re-encrypt + persist
 *
 * Until those credentials exist, this adapter reports
 * `isConfigured()=false` and the cron skips it gracefully — no errors
 * piled into the sync log.
 *
 * When you're ready to wire it:
 *   1. Drop the env vars into Vercel
 *   2. Implement fetchRounds() against /api/v1/sync/rounds
 *   3. Map Arccos round shape → golf_rounds + golf_shots inserts
 *      (skip rows where (player_id, external_id) already exists)
 */

import type { IngestAdapter, IngestConnection, SyncResult } from '../types';

const arccos: IngestAdapter = {
  provider: 'arccos',

  isConfigured() {
    return Boolean(process.env.ARCCOS_CLIENT_ID && process.env.ARCCOS_CLIENT_SECRET);
  },

  async sync(_connection: IngestConnection): Promise<SyncResult> {
    // Stub: when configured, this fans out to /api/v1/sync/rounds,
    // dedupes against golf_rounds.external_id, writes new rounds +
    // shots, and bumps last_synced_at. Skipping cleanly until wired.
    return {
      shots_inserted: 0,
      rounds_inserted: 0,
      errors_count: 0,
      error_detail: 'Arccos adapter not yet wired — see provider stub for wiring steps',
    };
  },
};

export default arccos;
