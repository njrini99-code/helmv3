/**
 * coachhelm-prewarm-round-reviews.ts — CoachHelm repair plan §5.5/§14.8/§16
 * (Package 6): create MISSING round reviews for completed rounds in a fixed
 * recent window (default 30 days, per plan §16.4's owner-selected first
 * pass), without touching any round that already has one.
 *
 * Why this exists: `getRoundReview` generates a review on-open (kept as-is,
 * per plan §17.2 "keep on-open review generation"), but a round whose review
 * was never opened stays missing — 127 rounds in the last 30 days at the
 * plan's 2026-09-12 snapshot (§3.2). This tool closes that gap in bulk,
 * ahead of a coach opening each one individually.
 *
 * Depends on the repair plan §5.4/N4 as-played fix in
 * src/app/golf/actions/round-review-system.ts and the worker-safe core it
 * shares with this script, src/lib/golf/round-review/deterministic-review.ts
 * — read that file's header before changing either.
 *
 * Safety properties (plan §5.5 acceptance):
 *   - INSERT-ONLY. Every write is `.upsert(payload, { onConflict: 'round_id',
 *     ignoreDuplicates: true })`. A round that already has a review — coach
 *     notes, published state, shared state, focus-area links, whatever — is
 *     NEVER updated by this script. Zero rows returned from the upsert means
 *     something else won the race (the on-open path, or a concurrent run of
 *     this script); that round is classified `skipped_existing`, not
 *     retried, and nothing about the surviving row is touched.
 *   - Deterministic-only (no CoachHelm v2 enhancement call) — see
 *     deterministic-review.ts's module doc for why.
 *   - No notification/publish side effects: `golf_round_reviews` has no
 *     INSERT trigger (verified via a read-only
 *     `information_schema.triggers` query against Helm-Production on
 *     2026-09-22; only two UPDATE triggers exist, `update_updated_at_column`
 *     and `log_review_status_change` — neither fires on our INSERT path),
 *     and this script never calls `revalidatePath` or any notifier.
 *   - Fixed manifest: the candidate round list, cutoff, and window are
 *     computed once at the FIRST run and written into the cursor file. A
 *     resumed run reuses that exact list — it never re-queries
 *     `round_date >= cutoff` against a freshly computed cutoff, which would
 *     both shift the window forward with the clock and let a round created
 *     after the first run silently join a "resumed" run.
 *   - Resumable: writes `.cache/coachhelm-prewarm-cursor.json` after every
 *     batch. A restart reuses the saved manifest and skips rounds already
 *     recorded as created/skipped_existing/inapplicable in that file rather
 *     than reprocessing them. A restart is refused if `--days` differs from
 *     the saved cursor's `windowDays` — commit/inspect or delete the cursor
 *     file to start a fresh manifest.
 *   - DRY-RUN BY DEFAULT. Prints the manifest breakdown and writes nothing
 *     unless `--confirm` is passed. There is no environment-based default
 *     switch — the owner always opts in explicitly.
 *
 * Usage (owner-run only — see AGENTS.md: production writes require an
 * explicit target/change and the repo's authorized workflow; this script is
 * reviewed in the PR and not run by the author):
 *
 *   # Point at the intended environment first — e.g. for production:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local npx tsx -r dotenv/config \
 *     scripts/coachhelm-prewarm-round-reviews.ts                      # dry run
 *
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local npx tsx -r dotenv/config \
 *     scripts/coachhelm-prewarm-round-reviews.ts --confirm            # write
 *
 *   # Equivalently, --env=<path> instead of -r dotenv/config:
 *   npx tsx scripts/coachhelm-prewarm-round-reviews.ts --env=.vercel/.env.production.local
 *
 *   # There is no default target — omitting both prints
 *   # "target Supabase project: (unset)" and fails at the credential guard
 *   # rather than silently resolving `.env.local` (this repo's local dev
 *   # config, which is the SAME production project — no staging copy
 *   # exists). Every run prints the resolved target host before doing
 *   # anything else; confirm it matches intent before passing --confirm.
 *
 *   # Optional flags:
 *   #   --days=N          window size in days (default 30, per plan §16.4)
 *   #   --batch-size=N    rounds per batch (default 10)
 *   #   --concurrency=N   concurrent buildDeterministicRoundReview calls per batch (default 3)
 *   #   --cursor=PATH     override the resume-cursor file location
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or
 * SUPABASE_SECRET_KEY — see src/lib/supabase/keys.mjs).
 */
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';

// Load env BEFORE importing anything that reads process.env at call time
// (createAdminClient reads it lazily on call, but load first regardless —
// matches scripts/run-pattern-miner-for-team.ts's ordering comment).
//
// Deliberately NO implicit default here. An earlier version of this line
// fell back to `.env.local` whenever `--env=` was omitted — which silently
// loaded this repo's local dev config, and `.env.local` points at the same
// single shared production Supabase project as everything else (no staging
// copy exists; see memory/context/golfhelm-database.md and
// memory/projects/golfhelm.md's `qmnssrrolpinvwjjnufo` project ref). That
// meant a bare `npx tsx scripts/coachhelm-prewarm-round-reviews.ts` with
// stray/unset target env vars would still resolve a real service-role
// credential against production instead of failing loudly. The owner must
// now point this at an explicit target: `--env=<path>`, or preload with
// `-r dotenv/config` (`DOTENV_CONFIG_PATH=<path>`) as the header documents.
// Neither path is a default, and `main()` prints the resolved target host
// (never the key) before doing anything else.
const envPathArg = process.argv.find(a => a.startsWith('--env='));
if (envPathArg) {
  loadEnv({ path: envPathArg.slice('--env='.length) });
}

import { createClient } from '@supabase/supabase-js';
import { getSecretKey } from '@/lib/supabase/keys.mjs';
import type { Database } from '@/lib/types/database';
import type { AdminSupabaseClient } from '@/lib/golf/round-review/deterministic-review';
import {
  buildDeterministicRoundReview,
  toReviewInsertPayload,
  writeReviewIfAbsent,
} from '@/lib/golf/round-review/deterministic-review';

/**
 * A script-local admin client — deliberately NOT
 * `createAdminClient()` from `src/lib/supabase/admin.ts`. Same URL/key
 * resolution and auth options; the only thing left out is
 * `Sentry.instrumentSupabaseClient()`.
 *
 * That call throws `Sentry.instrumentSupabaseClient is not a function` when
 * `@sentry/nextjs` is imported under plain `tsx` — confirmed directly: an
 * isolated `import * as Sentry from '@sentry/nextjs'` run through `npx tsx`
 * in this repo logs `typeof Sentry.instrumentSupabaseClient === 'undefined'`
 * (not verified under `next build`/`next start`, where it presumably IS a
 * function since nothing else in the app hits this). That crash happens
 * synchronously inside `createAdminClient()`, before any query runs, so it
 * does not put data at risk — but it does mean the tool this package exists
 * to ship could not run at all via its own documented command.
 * `scripts/run-triage.ts` and `scripts/run-pattern-miner-for-team.ts` call
 * the same `createAdminClient()` under the same `tsx` invocation and are
 * LIKELY exposed to the same crash, but that was not run/confirmed here —
 * reported to team-lead as a separate finding, not patched here.
 * `admin.ts` backs every server action in the repo; changing its Sentry
 * wiring is a different, wider-blast-radius task than a 30-day pre-warm
 * script, so it's left untouched and this script builds its own client
 * instead.
 */
function createScriptAdminClient(): AdminSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder for admin client.');
  }
  return createClient<Database>(url, getSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Outcome = 'created' | 'skipped_existing' | 'inapplicable' | 'failed';

interface CursorFile {
  runId: string;
  windowDays: number;
  cutoffRoundDate: string; // inclusive lower bound, fixed at manifest creation — never recomputed on resume
  createdAt: string;
  // The FIXED manifest (plan §16.1) — captured once, at first-run time, and
  // never re-queried on resume. Re-running `.gte('round_date', cutoff)`
  // against a freshly computed cutoff on a later day would both shift the
  // window forward and let a round created after the run started silently
  // join a "resumed" run, defeating the fixed-manifest guarantee.
  candidates: CandidateRoundRow[];
  results: Record<string, { outcome: Outcome; detail?: string; at: string }>;
}

function parseIntArg(name: string, fallback: number): number {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const n = Number(arg.slice(name.length + 3));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const CONFIRM = process.argv.includes('--confirm');
const WINDOW_DAYS = parseIntArg('days', 30);
const BATCH_SIZE = parseIntArg('batch-size', 10);
const CONCURRENCY = parseIntArg('concurrency', 3);
const CURSOR_PATH = resolve(
  process.argv.find(a => a.startsWith('--cursor='))?.slice('--cursor='.length)
    ?? '.cache/coachhelm-prewarm-cursor.json',
);

interface CandidateRoundRow {
  id: string;
  player_id: string;
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
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** `.in('round_id', ids)` chunked at 200 — a bare unchunked `.in()` on a
 * large id list can exceed PostgREST's URL length and fail with a bare 400
 * (memory/context/golfhelm-database.md's ".in() URL-length" trap). */
async function existingReviewRoundIds(
  supabase: AdminSupabaseClient,
  roundIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < roundIds.length; i += 200) {
    const chunk = roundIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('golf_round_reviews')
      .select('round_id')
      .in('round_id', chunk);
    if (error) throw new Error(`existingReviewRoundIds: ${error.message}`);
    for (const row of data ?? []) found.add(row.round_id);
  }
  return found;
}

function loadCursor(): CursorFile | null {
  if (!existsSync(CURSOR_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CURSOR_PATH, 'utf8')) as CursorFile;
  } catch {
    return null;
  }
}

function saveCursor(cursor: CursorFile): void {
  mkdirSync(dirname(CURSOR_PATH), { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify(cursor, null, 2));
}

/** Bounded-concurrency map — no external dependency, small enough to own here. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function printTarget(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // Host only, never the key — but enough for the owner to confirm the
  // target BEFORE any query runs, since there is no staging environment to
  // fall back to (a wrong target here is a wrong target against production).
  const host = url ? (() => { try { return new URL(url).host; } catch { return `(unparseable: ${url})`; } })() : '(unset)';
  console.log(`[prewarm] target Supabase project: ${host}`);
}

async function main() {
  printTarget();
  const supabase = createScriptAdminClient();

  let cursor = loadCursor();
  if (cursor && cursor.windowDays !== WINDOW_DAYS) {
    throw new Error(
      `Existing cursor at ${CURSOR_PATH} was built with windowDays=${cursor.windowDays}, ` +
      `which differs from this run's windowDays=${WINDOW_DAYS}. The manifest must stay ` +
      `fixed for a resumed run (plan §16.1) — commit/inspect or delete the cursor file to ` +
      `start a fresh manifest.`,
    );
  }

  let candidateRounds: CandidateRoundRow[];
  let cutoffRoundDate: string;

  if (cursor) {
    // RESUME: reuse the FIXED manifest and cutoff captured by the original
    // run. Do not re-query `.gte('round_date', cutoff)` here — a cutoff
    // recomputed from `now` shifts forward on every later day, and
    // re-querying would let a round created after the first run silently
    // join a run this file's own header promises stays fixed.
    cutoffRoundDate = cursor.cutoffRoundDate;
    candidateRounds = cursor.candidates;
  } else {
    const now = new Date();
    const cutoff = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    cutoffRoundDate = cutoff.toISOString().split('T')[0]!;

    // Fixed candidate manifest: every completed round in the window, as of
    // right now. Captured into the cursor object below so a later resume
    // reuses this exact list instead of re-querying it.
    candidateRounds = await fetchAllRows<CandidateRoundRow>((from, to) =>
      supabase
        .from('golf_rounds')
        .select('id, player_id, round_date')
        .eq('status', 'completed')
        .gte('round_date', cutoffRoundDate)
        .order('id', { ascending: true })
        .range(from, to),
    );

    cursor = {
      runId: randomUUID(),
      windowDays: WINDOW_DAYS,
      cutoffRoundDate,
      createdAt: now.toISOString(),
      candidates: candidateRounds,
      results: {},
    };
  }

  console.log(
    `${CONFIRM ? 'WRITE MODE (--confirm passed).' : '[DRY RUN] printing the manifest, writing NOTHING. Pass --confirm to write.'}\n` +
    `Run id: ${cursor.runId}\n` +
    `Window: completed rounds with round_date >= ${cutoffRoundDate} (${WINDOW_DAYS} days)\n` +
    `Cursor: ${CURSOR_PATH}\n`,
  );

  // Preliminary skip: rounds that already have a review. (The write path
  // below still uses ignoreDuplicates:true as the atomic authority — this
  // is reporting/efficiency, not the safety guarantee.)
  const alreadyReviewed = await existingReviewRoundIds(supabase, candidateRounds.map(r => r.id));

  const toProcess = candidateRounds.filter(r => !alreadyReviewed.has(r.id) && !cursor!.results[r.id]);
  const resumedSkips = candidateRounds.filter(r => cursor!.results[r.id]).length;

  console.log(
    `Manifest: ${candidateRounds.length} completed round(s) in window.\n` +
    `  already has a review:      ${alreadyReviewed.size}\n` +
    `  resumed from prior run:    ${resumedSkips}\n` +
    `  candidates to process now: ${toProcess.length}\n`,
  );

  if (!CONFIRM) {
    // Dry run stops here — no generation, no writes, cursor untouched.
    const preview = toProcess.slice(0, 10).map(r => `${r.id} (player ${r.player_id}, ${r.round_date})`);
    if (preview.length > 0) {
      console.log(`First ${preview.length} candidate round(s):\n  ${preview.join('\n  ')}`);
    }
    return;
  }

  // Process in small batches with bounded concurrency, saving the cursor
  // after every batch so a crash mid-run loses at most one batch.
  let created = 0, skippedExisting = 0, inapplicable = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    await mapWithConcurrency(batch, CONCURRENCY, async (round) => {
      const built = await buildDeterministicRoundReview(supabase, round.id);
      if (!built.ok) {
        const outcome: Outcome = built.reason === 'not_completed' ? 'inapplicable' : 'failed';
        if (outcome === 'inapplicable') inapplicable++; else failed++;
        cursor!.results[round.id] = { outcome, detail: built.detail ?? built.reason, at: new Date().toISOString() };
        return;
      }

      const payload = toReviewInsertPayload(built);
      const written = await writeReviewIfAbsent(supabase, payload);

      if (written.outcome === 'failed') {
        failed++;
        cursor!.results[round.id] = { outcome: 'failed', detail: written.detail, at: new Date().toISOString() };
        return;
      }
      if (written.outcome === 'skipped_existing') {
        skippedExisting++;
        cursor!.results[round.id] = { outcome: 'skipped_existing', at: new Date().toISOString() };
        return;
      }
      created++;
      cursor!.results[round.id] = { outcome: 'created', at: new Date().toISOString() };
    });

    saveCursor(cursor);
    console.log(
      `  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)}: ` +
      `created=${created} skipped_existing=${skippedExisting} inapplicable=${inapplicable} failed=${failed}`,
    );
  }

  console.log(
    `\nDone. created=${created} skipped_existing=${skippedExisting} inapplicable=${inapplicable} failed=${failed}\n` +
    `Re-run with the same flags to resume/verify — already-recorded rounds are skipped via the cursor, ` +
    `and any round somehow still missing a review is re-attempted with the same insert-only write.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
