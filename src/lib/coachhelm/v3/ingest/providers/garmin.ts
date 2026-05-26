/**
 * Garmin ingest adapter (W40 stub).
 *
 * Garmin Health API uses OAuth 1.0a (legacy) — the live integration
 * requires:
 *   - GARMIN_CONSUMER_KEY + GARMIN_CONSUMER_SECRET env vars
 *   - Approved Garmin Health API partnership
 *   - Per-user OAuth 1.0a token + token_secret stored in
 *     access_token_encrypted (concatenated, decrypted at sync time)
 *
 * Until those credentials exist, this adapter reports
 * `isConfigured()=false` and the cron skips it gracefully.
 *
 * When you're ready to wire it:
 *   1. Drop the env vars into Vercel
 *   2. Implement fetchGolfActivities() against /wellness-api/rest/golf
 *   3. Map activity → golf_rounds + golf_shots (Garmin only exposes
 *      summary stats; shot-level data is iffy depending on subscription)
 */

import type { IngestAdapter, IngestConnection, SyncResult } from '../types';

const garmin: IngestAdapter = {
  provider: 'garmin',

  isConfigured() {
    return Boolean(process.env.GARMIN_CONSUMER_KEY && process.env.GARMIN_CONSUMER_SECRET);
  },

  async sync(_connection: IngestConnection): Promise<SyncResult> {
    return {
      shots_inserted: 0,
      rounds_inserted: 0,
      errors_count: 0,
      error_detail: 'Garmin adapter not yet wired — see provider stub for wiring steps',
    };
  },
};

export default garmin;
