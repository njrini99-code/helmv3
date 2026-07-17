/**
 * backfill-qualifier-round-tags.ts — one-time backfill for
 * `golf_rounds.round_type` on rounds that ARE linked to a qualifier
 * (`qualifier_id IS NOT NULL`) but were never tagged `round_type = 'qualifier'`.
 *
 * Symptom (#916): the Qualifiers tab correctly shows completed qualifiers with
 * results — `updateQualifierEntryStats()` (src/app/golf/actions/golf.ts)
 * aggregates a qualifier's results purely by `qualifier_id` + `status =
 * 'completed'`, ignoring `round_type` entirely — but the Rounds list's
 * "Qualifier" format filter (src/components/fairway/pages/rounds/
 * FairwayRoundsLibrary.tsx) filters purely by `round_type`, so a round that
 * has `qualifier_id` set but `round_type` stuck at something else (`practice`,
 * `tournament`, or the legacy `qualifying` spelling — the filter already
 * accepts `qualifying` too) never shows under "Qualifier" there, even though
 * it counts toward the qualifier's results.
 *
 * Root cause (write path, fixed alongside this script): the legacy/offline
 * draft-save action `saveRoundDraft` (src/app/golf/actions/round-drafts.ts)
 * never wrote `qualifier_id`/`qualifier_round_number` to `golf_rounds` at all
 * — any round that passed through that write path before the fix could end up
 * with the qualifier link set by an earlier/later save but a stale
 * `round_type`. This script reconciles rows that already drifted before the
 * fix landed; it does NOT need to run again for rounds created after it.
 *
 * Idempotent: only touches rows where `qualifier_id IS NOT NULL AND
 * round_type NOT IN ('qualifier', 'qualifying')`. Re-running after a first
 * successful pass finds zero matching rows and is a no-op. UPDATE only (one
 * column, `round_type`) — no inserts, no deletes, no other columns touched.
 *
 * Connection modeled on scripts/backfill-baseball-slash-lines.ts: env from
 * .env.local, `createClient(url, key, { auth: { persistSession: false,
 * autoRefreshToken: false } })`. Dry-run by default (prints the plan, writes
 * nothing) — pass --confirm to write.
 *
 * SCRIPT ONLY — per repo policy this is reviewed in the PR and is NOT run by
 * the author. A human runs it (dry-run first) after review.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backfill-qualifier-round-tags.ts            # dry run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backfill-qualifier-round-tags.ts --confirm  # write
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

const DRY = !process.argv.includes('--confirm');

interface MistaggedRoundRow {
  id: string;
  player_id: string;
  qualifier_id: string;
  round_type: string | null;
  status: string | null;
  round_date: string;
}

/** Page through a table past PostgREST's 1000-row default cap, with a stable order. */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `${DRY ? '[DRY RUN] printing plan, writing NOTHING. Re-run with --confirm.\n' : ''}` +
    `Backfilling golf_rounds.round_type for qualifier-linked rounds...\n`,
  );

  // Fetch every round with a qualifier_id set, then filter client-side for a
  // round_type that isn't already 'qualifier'/'qualifying' — keeps the query
  // a single simple .not.is filter (no OR-of-NOT-IN needed against PostgREST).
  const rows = await fetchAllRows<MistaggedRoundRow>((from, to) =>
    supabase
      .from('golf_rounds')
      .select('id, player_id, qualifier_id, round_type, status, round_date')
      .not('qualifier_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)
      .returns<MistaggedRoundRow[]>(),
  );

  const mistagged = rows.filter(
    (r) => r.round_type !== 'qualifier' && r.round_type !== 'qualifying',
  );

  if (mistagged.length === 0) {
    console.log(`Scanned ${rows.length} qualifier-linked round(s). All already tagged 'qualifier' — nothing to backfill.`);
    return;
  }

  console.log(`Found ${mistagged.length} of ${rows.length} qualifier-linked round(s) with the wrong round_type.\n`);

  let changed = 0;
  let errors = 0;

  for (const row of mistagged) {
    const label = `round ${row.id.slice(0, 8)} (player ${row.player_id.slice(0, 8)}, qualifier ${row.qualifier_id.slice(0, 8)}, ${row.round_date}, status=${row.status ?? 'unknown'})`;
    console.log(`  ${DRY ? '[DRY] would update' : '✓ updating'} ${label}: round_type '${row.round_type ?? 'null'}' → 'qualifier'`);

    if (!DRY) {
      const { error: updateError } = await supabase
        .from('golf_rounds')
        .update({ round_type: 'qualifier' })
        .eq('id', row.id)
        // Idempotency guard against a concurrent write between the SELECT
        // above and this UPDATE: only touch the row if it's still mistagged.
        .not('round_type', 'in', '(qualifier,qualifying)');

      if (updateError) {
        console.warn(`  ⚠ ${label}: update failed — ${updateError.message}`);
        errors++;
        continue;
      }
    }

    changed++;
  }

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. mistagged=${mistagged.length} ${DRY ? 'would-update' : 'updated'}=${changed} errors=${errors}`);

  if (errors > 0) process.exitCode = 1;

  if (DRY) {
    console.log('\nRe-run with --confirm to write.');
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
