/**
 * TrackMan ingest adapter (W41 stub).
 *
 * TrackMan's Range Manager API (the only programmatic surface) needs:
 *   - TRACKMAN_API_KEY env var
 *   - Approved API partnership (TrackMan vets each customer)
 *   - Mapping from TrackMan session shape → golf_practice_sessions row
 *     (NOT golf_rounds — TrackMan data is practice-only)
 *
 * Until those credentials exist, this adapter reports
 * `isConfigured()=false` and the cron skips it gracefully.
 *
 * When you're ready to wire it:
 *   1. Drop the env var into Vercel
 *   2. Implement fetchSessions() against the Range Manager API
 *   3. Insert one row per session into golf_practice_sessions with
 *      source='trackman' and the raw shots in shots_data jsonb
 */

import type { IngestAdapter, IngestConnection, SyncResult } from '../types';

const trackman: IngestAdapter = {
  provider: 'trackman',

  isConfigured() {
    return Boolean(process.env.TRACKMAN_API_KEY);
  },

  async sync(_connection: IngestConnection): Promise<SyncResult> {
    return {
      shots_inserted: 0,
      rounds_inserted: 0,
      errors_count: 0,
      error_detail: 'TrackMan adapter not yet wired — see provider stub for wiring steps',
    };
  },
};

export default trackman;
