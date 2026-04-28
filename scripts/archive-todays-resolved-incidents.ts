/**
 * One-shot: archive `admin_events` rows whose underlying bug shipped a fix today.
 *
 * Two classes are auto-resolved:
 *
 *  1. Predictor `ON CONFLICT specification` — fixed by
 *     supabase/migrations/20260428182000_predictions_natural_key_non_partial.sql
 *     plus commit abbf7bee in the predictor upsert path. Existing rows still
 *     show severity=error, so the Overview "Needs Attention" tab shows the bug
 *     as live.
 *
 *  2. Demo request `[object Object]` from a CHECK violation — fixed by
 *     commit 8f2edde3 (demo-request CHECK constraint fix).
 *
 * Both classes are demoted to severity=info with a resolution note baked into
 * `metadata.auto_resolved/resolution/resolved_at` so the dashboard filters
 * them out but they remain available for forensic queries.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/archive-todays-resolved-incidents.ts
 */
import 'dotenv/config';
import { archiveIncidentsByCriteria } from '../src/lib/admin/incident-resolver';

async function main() {
  const predictor = await archiveIncidentsByCriteria({
    messageMatch: '%ON CONFLICT specification%',
    resolution:
      'Fixed by 20260428182000_predictions_natural_key_non_partial.sql + abbf7bee predictor upsert',
  });
  console.log(`predictor: archived=${predictor.archived}`);

  const demoRequest = await archiveIncidentsByCriteria({
    messageMatch: '%[object Object]%',
    resolution: 'Fixed by 8f2edde3 demo-request CHECK constraint fix',
  });
  console.log(`demo_request: archived=${demoRequest.archived}`);
}

main().catch((err) => {
  console.error('archive-todays-resolved-incidents failed:', err);
  process.exit(1);
});
