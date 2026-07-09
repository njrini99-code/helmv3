/**
 * backfill-baseball-slash-lines.ts — one-time backfill for
 * `baseball_player_aggregates.career_obp` / `career_slg` / `career_ops`.
 *
 * Migration 20260701020000 added the three columns (BaseballHelm #436) but
 * shipped with NO backfill — "the columns fill in on the next aggregate
 * recalculation for each player." Any player whose aggregates haven't been
 * recalculated since then (no new stat session logged) is stuck with
 * `career_avg` populated and `career_obp`/`career_slg`/`career_ops` null,
 * which is exactly the "AVG shows, SLG/OPS show '—'" honesty bug Ruling 4
 * calls out on the roster wall.
 *
 * Reuses the SAME pure compute helper `recalculatePlayerAggregates`
 * (src/app/baseball/actions/stats.ts) calls — `computeCareerSlashLine`
 * (src/lib/baseball/aggregates/career-slash-line.ts, unit-tested) — so this
 * script never re-derives the OBP/SLG/OPS formulas itself. For every
 * (player_id, team_id) already in `baseball_player_aggregates`, it re-reads
 * that pair's `baseball_player_stats` rows (the same source table the app's
 * own recalc reads) and UPDATEs only the three slash-line columns.
 *
 * Idempotent: the computed value is a pure function of the current
 * `baseball_player_stats` rows, so re-running always converges to the same
 * result — safe to run again after new stats are logged.
 *
 * Safe: UPDATE only (`career_obp`, `career_slg`, `career_ops`) on rows that
 * already exist. No inserts, no deletes, no other columns touched.
 *
 * Connection modeled EXACTLY on scripts/seed-rini-baseball-demo.ts: env from
 * .env.local, `createClient(url, key, { auth: { persistSession: false,
 * autoRefreshToken: false } })`. Dry-run by default (prints the plan, writes
 * nothing) — pass --confirm to write, matching the sibling seed scripts'
 * safety convention.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backfill-baseball-slash-lines.ts            # dry run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backfill-baseball-slash-lines.ts --confirm  # write
 *
 * (`npx tsx scripts/backfill-baseball-slash-lines.ts` also works standalone —
 * the script loads .env.local itself via `dotenv` below.)
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeCareerSlashLine, type SlashLineStatRow } from '../src/lib/baseball/aggregates/career-slash-line';

loadEnv({ path: '.env.local' });

const DRY = !process.argv.includes('--confirm');

interface AggregateRow {
  player_id: string;
  team_id: string;
  career_avg: number | null;
  career_obp: number | null;
  career_slg: number | null;
  career_ops: number | null;
}

function fmt(v: number | null): string {
  return v == null ? '—' : v.toFixed(3);
}

function valuesEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Compare at the same 3-decimal precision the column/formula use.
  return Math.abs(a - b) < 0.0005;
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

  console.log(`${DRY ? '[DRY RUN] printing plan, writing NOTHING. Re-run with --confirm.\n' : ''}Backfilling baseball_player_aggregates.career_obp/slg/ops...\n`);

  const rows = await fetchAllRows<AggregateRow>((from, to) =>
    supabase
      .from('baseball_player_aggregates')
      .select('player_id, team_id, career_avg, career_obp, career_slg, career_ops')
      .order('player_id', { ascending: true })
      .order('team_id', { ascending: true })
      .range(from, to)
      .returns<AggregateRow[]>(),
  );

  if (!rows || rows.length === 0) {
    console.log('No baseball_player_aggregates rows found — nothing to backfill.');
    return;
  }

  console.log(`Found ${rows.length} aggregate row(s).\n`);

  let scanned = 0;
  let changed = 0;
  let unchanged = 0;
  let errors = 0;
  const samples: Array<{ playerId: string; teamId: string; before: AggregateRow; after: { career_obp: number | null; career_slg: number | null; career_ops: number | null } }> = [];

  for (const row of rows) {
    scanned++;

    // `select('*')` (not an explicit column list) — matches
    // recalculatePlayerAggregatesAction exactly. Live `baseball_player_stats`
    // is missing `hit_by_pitch`/`sacrifice_flies` (schema drift: the columns
    // exist on the BaseballPlayerStats TS type but not in the deployed
    // table), so an explicit select naming them 400s. `computeCareerSlashLine`
    // treats a missing field as 0 via `pick(s) || 0`, which is exactly how
    // the app's own recalculation already behaves in production today.
    let statsRows: SlashLineStatRow[];
    try {
      statsRows = await fetchAllRows<SlashLineStatRow>((from, to) =>
        supabase
          .from('baseball_player_stats')
          .select('*')
          .eq('player_id', row.player_id)
          .eq('team_id', row.team_id)
          .order('id', { ascending: true })
          .range(from, to)
          .returns<SlashLineStatRow[]>(),
      );
    } catch (statsError) {
      const message = statsError instanceof Error ? statsError.message : String(statsError);
      console.warn(`  ⚠ ${row.player_id.slice(0, 8)}/${row.team_id.slice(0, 8)}: failed to load stats — ${message}`);
      errors++;
      continue;
    }

    const { obp, slg, ops } = computeCareerSlashLine(statsRows ?? []);

    const isChanged =
      !valuesEqual(row.career_obp, obp) ||
      !valuesEqual(row.career_slg, slg) ||
      !valuesEqual(row.career_ops, ops);

    if (!isChanged) {
      unchanged++;
      continue;
    }

    changed++;
    if (samples.length < 5) {
      samples.push({ playerId: row.player_id, teamId: row.team_id, before: row, after: { career_obp: obp, career_slg: slg, career_ops: ops } });
    }

    const label = `${row.player_id.slice(0, 8)}/${row.team_id.slice(0, 8)}`;
    console.log(
      `  ${DRY ? '[DRY] would update' : '✓ updating'} ${label}: ` +
      `avg=${fmt(row.career_avg)} obp ${fmt(row.career_obp)}→${fmt(obp)} slg ${fmt(row.career_slg)}→${fmt(slg)} ops ${fmt(row.career_ops)}→${fmt(ops)}`
    );

    if (!DRY) {
      const { error: updateError } = await supabase
        .from('baseball_player_aggregates')
        .update({ career_obp: obp, career_slg: slg, career_ops: ops })
        .eq('player_id', row.player_id)
        .eq('team_id', row.team_id);

      if (updateError) {
        console.warn(`  ⚠ ${label}: update failed — ${updateError.message}`);
        errors++;
        changed--;
      }
    }
  }

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. scanned=${scanned} changed=${changed} unchanged=${unchanged} errors=${errors}`);

  if (errors > 0) process.exitCode = 1;

  if (samples.length > 0) {
    console.log('\nSample before/after:');
    for (const s of samples) {
      console.log(
        `  ${s.playerId.slice(0, 8)}/${s.teamId.slice(0, 8)}: ` +
        `before(obp=${fmt(s.before.career_obp)}, slg=${fmt(s.before.career_slg)}, ops=${fmt(s.before.career_ops)}) ` +
        `after(obp=${fmt(s.after.career_obp)}, slg=${fmt(s.after.career_slg)}, ops=${fmt(s.after.career_ops)})`
      );
    }
  }

  if (DRY) {
    console.log('\nRe-run with --confirm to write.');
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
