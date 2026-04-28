/**
 * One-shot prediction performance rollup.
 *
 * Calls `rollupPredictionPerformanceRolling30d` against prod. Idempotent —
 * the writer upserts on (team_id, model_type, period_start, period_end).
 *
 * Run once after deploy or whenever you want a fresh rolling-30d snapshot:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local npx tsx -r dotenv/config scripts/run-prediction-rollup.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { rollupPredictionPerformanceRolling30d } from '../src/lib/coachhelm/v2/analytics/prediction-performance-writer';

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log('Running prediction performance rollup (rolling 30d)...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await rollupPredictionPerformanceRolling30d(supabase as any);
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
