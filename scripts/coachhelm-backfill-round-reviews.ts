/**
 * coachhelm-backfill-round-reviews.ts — CoachHelm deep audit row 39: create
 * the round reviews that were never generated because nobody opened the
 * round (reviews are built lazily on page open).
 *
 * Owner-approved scope (2026-09-28): ACTIVE-PLAYER rounds only — the audit's
 * "183 of 391 active rounds have no review" population:
 *   - player is an active member (golf_team_members.status = 'active') of a
 *     non-test team, and the player is not a test player;
 *   - round is completed, not is_test, round_date within --days (default 60,
 *     the audit window), and passes the countable-round rule
 *     (src/lib/golf/round-countable.ts);
 *   - round has no golf_round_reviews row yet.
 * The dry run also prints the wider "all countable non-test rounds missing a
 * review" count for context; that wider set is never written.
 *
 * Reuse, not duplication: every review is computed by
 * `buildDeterministicRoundReview` and written by `writeReviewIfAbsent`
 * (src/lib/golf/round-review/deterministic-review.ts), the plain,
 * non-'use server' core the on-open action shares its content builder and
 * as-played baseline query with. The `'use server'` action is not called: it
 * authenticates a cookie session, revalidates paths and upserts with
 * ignoreDuplicates:false, none of which fits a service-role script.
 * Deterministic-only, like the pre-warm (no CoachHelm v2 enhancement), so rows
 * are stamped engine_version '<rule-based version>-prewarm'.
 *
 * Safety:
 *   - DRY-RUN BY DEFAULT. Without --apply it only SELECTs and prints counts
 *     and a preview; it builds nothing, writes nothing, not even a file.
 *   - INSERT-ONLY: `writeReviewIfAbsent` upserts with ignoreDuplicates:true,
 *     so a review created meanwhile (on-open, another run) is never touched.
 *   - Idempotent: rounds that already have a review are skipped up front, so
 *     a re-run only fills what is still missing.
 *   - Rate-limited: --batch-size rounds (default 5) built sequentially, then
 *     a --delay-ms pause (default 1000) between batches.
 *   - No notification side effects: golf_round_reviews has no INSERT trigger
 *     (see scripts/coachhelm-prewarm-round-reviews.ts header).
 *
 * Usage (owner-run; the script prints the target host before any query):
 *   npx tsx scripts/coachhelm-backfill-round-reviews.ts --env=.vercel/.env.production.local           # dry run
 *   npx tsx scripts/coachhelm-backfill-round-reviews.ts --env=.vercel/.env.production.local --apply   # write
 * Flags: --days=N (default 60), --batch-size=N (default 5), --delay-ms=N
 * (default 1000), --limit=N (process at most N rounds this run).
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or
 * SUPABASE_SECRET_KEY — see src/lib/supabase/keys.mjs). No implicit default
 * env file: `.env.local` points at the same production project.
 */
import { config as loadEnv } from 'dotenv';

const envPathArg = process.argv.find(a => a.startsWith('--env='));
if (envPathArg) {
  loadEnv({ path: envPathArg.slice('--env='.length) });
}

import { createClient } from '@supabase/supabase-js';
import { getSecretKey } from '@/lib/supabase/keys.mjs';
import type { Database } from '@/lib/types/database';
import { isCountableRound } from '@/lib/golf/round-countable';
import type { AdminSupabaseClient } from '@/lib/golf/round-review/deterministic-review';
import {
  buildDeterministicRoundReview,
  toReviewInsertPayload,
  writeReviewIfAbsent,
} from '@/lib/golf/round-review/deterministic-review';

/** Script-local admin client — see the pre-warm script for why this is not
 *  `createAdminClient()` (its Sentry instrumentation throws under tsx). */
function createScriptAdminClient(): AdminSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder for admin client.');
  }
  return createClient<Database>(url, getSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseIntArg(name: string, fallback: number): number {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const n = Number(arg.slice(name.length + 3));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const APPLY = process.argv.includes('--apply');
const WINDOW_DAYS = parseIntArg('days', 60);
const BATCH_SIZE = Math.max(1, parseIntArg('batch-size', 5));
const DELAY_MS = parseIntArg('delay-ms', 1000);
const LIMIT = parseIntArg('limit', Number.POSITIVE_INFINITY);

export interface CandidateRoundRow {
  id: string;
  player_id: string;
  round_date: string;
  status: string | null;
  is_test: boolean | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
}

/** Pure selection rule (exported for tests): non-test, completed, countable
 *  rounds with no review, optionally restricted to a player set. */
export function selectBackfillCandidates(
  rounds: readonly CandidateRoundRow[],
  reviewedRoundIds: ReadonlySet<string>,
  activePlayerIds: ReadonlySet<string> | null,
): CandidateRoundRow[] {
  return rounds.filter(r =>
    r.status === 'completed' &&
    r.is_test !== true &&
    !reviewedRoundIds.has(r.id) &&
    (activePlayerIds === null || activePlayerIds.has(r.player_id)) &&
    isCountableRound({
      holes_played: r.holes_played,
      total_score: r.total_score,
      front_nine: r.front_nine,
      back_nine: r.back_nine,
      total_putts: r.total_putts,
    }),
  );
}

/** Page past PostgREST's 1000-row cap with a stable order. */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Active players: active membership on a non-test team, non-test player. */
async function loadActivePlayerIds(supabase: AdminSupabaseClient): Promise<Set<string>> {
  const members = await fetchAllRows<{ player_id: string | null; team_id: string }>((from, to) =>
    supabase.from('golf_team_members').select('player_id, team_id').eq('status', 'active').order('team_id').order('player_id').range(from, to),
  );
  const teams = await fetchAllRows<{ id: string; is_test: boolean | null }>((from, to) =>
    supabase.from('golf_teams').select('id, is_test').order('id').range(from, to),
  );
  const players = await fetchAllRows<{ id: string; is_test: boolean | null }>((from, to) =>
    supabase.from('golf_players').select('id, is_test').order('id').range(from, to),
  );
  const testTeams = new Set(teams.filter(t => t.is_test === true).map(t => t.id));
  const testPlayers = new Set(players.filter(p => p.is_test === true).map(p => p.id));
  const out = new Set<string>();
  for (const m of members) {
    if (m.player_id && !testTeams.has(m.team_id) && !testPlayers.has(m.player_id)) out.add(m.player_id);
  }
  return out;
}

/** round_ids that already have a review, `.in()` chunked at 200 (URL limit). */
async function existingReviewRoundIds(supabase: AdminSupabaseClient, roundIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < roundIds.length; i += 200) {
    const { data, error } = await supabase
      .from('golf_round_reviews')
      .select('round_id')
      .in('round_id', roundIds.slice(i, i + 200));
    if (error) throw new Error(`existingReviewRoundIds: ${error.message}`);
    for (const row of data ?? []) found.add(row.round_id);
  }
  return found;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const host = url ? (() => { try { return new URL(url).host; } catch { return '(unparseable)'; } })() : '(unset)';
  console.log(`[backfill] target Supabase project: ${host}`);
  console.log(APPLY ? '[backfill] WRITE MODE (--apply).' : '[backfill] DRY RUN: reads only, writes nothing. Pass --apply to write.');

  const supabase = createScriptAdminClient();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  const rounds = await fetchAllRows<CandidateRoundRow>((from, to) =>
    supabase
      .from('golf_rounds')
      .select('id, player_id, round_date, status, is_test, holes_played, total_score, front_nine, back_nine, total_putts')
      .eq('status', 'completed')
      .eq('is_test', false)
      .gte('round_date', cutoff)
      .order('id', { ascending: true })
      .range(from, to),
  );
  const reviewed = await existingReviewRoundIds(supabase, rounds.map(r => r.id));
  const activePlayers = await loadActivePlayerIds(supabase);

  const allCountableMissing = selectBackfillCandidates(rounds, reviewed, null);
  const activeMissing = selectBackfillCandidates(rounds, reviewed, activePlayers);
  const activeRounds = rounds.filter(r => activePlayers.has(r.player_id));
  const activeMissingAny = activeRounds.filter(r => !reviewed.has(r.id));

  console.log(
    `Window: completed non-test rounds with round_date >= ${cutoff} (${WINDOW_DAYS} days)\n` +
    `  active-player rounds:                        ${activeRounds.length}\n` +
    `  active-player rounds with no review:         ${activeMissingAny.length}\n` +
    `  ...of those, countable (IN SCOPE):           ${activeMissing.length}\n` +
    `  all countable non-test rounds with no review: ${allCountableMissing.length} (context only, not written)\n`,
  );

  const toProcess = activeMissing.slice(0, LIMIT);
  if (!APPLY) {
    const preview = toProcess.slice(0, 10).map(r => `${r.id} (player ${r.player_id}, ${r.round_date})`);
    if (preview.length > 0) console.log(`First ${preview.length} in-scope round(s):\n  ${preview.join('\n  ')}`);
    return;
  }

  let created = 0, skippedExisting = 0, failed = 0;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    for (const round of batch) {
      const built = await buildDeterministicRoundReview(supabase, round.id);
      if (!built.ok) {
        failed++;
        console.warn(`  ${round.id}: ${built.reason}${built.detail ? ` (${built.detail})` : ''}`);
        continue;
      }
      const written = await writeReviewIfAbsent(supabase, toReviewInsertPayload(built));
      if (written.outcome === 'created') created++;
      else if (written.outcome === 'skipped_existing') skippedExisting++;
      else { failed++; console.warn(`  ${round.id}: write failed (${written.detail})`); }
    }
    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)}: created=${created} skipped_existing=${skippedExisting} failed=${failed}`);
    if (i + BATCH_SIZE < toProcess.length && DELAY_MS > 0) await sleep(DELAY_MS);
  }
  console.log(`\nDone. created=${created} skipped_existing=${skippedExisting} failed=${failed}. Re-run to fill anything still missing.`);
}

// Only run when executed directly, so tests can import selectBackfillCandidates.
if (process.argv[1] && /coachhelm-backfill-round-reviews\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
