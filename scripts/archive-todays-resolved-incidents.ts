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
 * The class is demoted to severity=info with a resolution note baked into
 * `metadata.auto_resolved/resolution/resolved_at` so the dashboard filters
 * them out but they remain available for forensic queries.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/archive-todays-resolved-incidents.ts
 */
import 'dotenv/config';
import { archiveIncidentsByCriteria, archiveKnownResolvedIncidents } from '../src/lib/admin/incident-resolver';

async function main() {
  const predictor = await archiveIncidentsByCriteria({
    messageMatch: '%ON CONFLICT specification%',
    resolution:
      'Fixed by 20260428182000_predictions_natural_key_non_partial.sql + abbf7bee predictor upsert',
  });
  console.log(`predictor: archived=${predictor.archived}`);

  const known = await archiveKnownResolvedIncidents();
  console.log(`known_resolved: archived=${known.archived}`);
  for (const bucket of known.buckets) {
    console.log(`  ${bucket.label}: archived=${bucket.archived}`);
  }
}

main().catch((err) => {
  console.error('archive-todays-resolved-incidents failed:', err);
  process.exit(1);
});
