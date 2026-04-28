/**
 * Backfill script for `golf_insight_effectiveness`.
 *
 * Walks every day from the earliest `golf_coach_insights.created_at` up to
 * (but not including) today and calls `rollupInsightEffectivenessForRange`
 * for each one-day window. Idempotent because the writer upserts on the
 * natural key `(team_id, insight_type, period_start, period_end)`.
 *
 * Run after the cron route + writer have shipped to production:
 *   npx tsx scripts/backfill-insight-effectiveness.ts
 *
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { rollupInsightEffectivenessForRange } from '../src/lib/coachhelm/v2/analytics/effectiveness-writer';

async function main() {
  // .trim() defends against `vercel env pull` writing values with trailing
  // backslash-n inside quotes — bash source can produce malformed env, but
  // dotenv-style reads still need trimming on the consumer side.
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Find earliest insight created_at to know the range.
  const { data: earliest, error } = await supabase
    .from('golf_coach_insights')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!earliest?.created_at) {
    console.log('No insights — nothing to backfill.');
    return;
  }

  const start = new Date(earliest.created_at);
  start.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let day = new Date(start);
  let processed = 0;
  let totalWritten = 0;
  let totalFailed = 0;
  while (day < today) {
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const tag = day.toISOString().slice(0, 10);
    process.stdout.write(`Backfilling effectiveness for ${tag}... `);
    try {
      // The writer accepts (supabase, windowStart, windowEnd) — see
      // src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:93.
      const result = await rollupInsightEffectivenessForRange(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase as any,
        day,
        next,
      );
      totalWritten += result.written;
      totalFailed += result.failed;
      console.log(`written=${result.written} failed=${result.failed}`);
    } catch (e) {
      totalFailed++;
      console.warn(`Failed for ${tag}:`, (e as Error).message);
    }
    day = next;
    processed++;
  }
  console.log(
    `Done. Processed ${processed} days. total_written=${totalWritten} total_failed=${totalFailed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
