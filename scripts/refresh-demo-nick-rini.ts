/**
 * ONE-OFF demo-data fix for the player demo account "Nick Rini" (rinin376).
 *
 * Why: rinin376's rounds were degenerate (putt-heavy, ~1061 putts / few full
 * swings) — the seed-demo-team-from-guilford.ts seeder INTENTIONALLY skips
 * Nick Rini ("real player … untouched"), so his data never got the complete
 * shot ledgers the 5 dummy teammates received. Result: round-review flyover
 * missed shots, putting/momentum/SG were wrong, and his (and the whole demo
 * team's) shot-analysis was empty because every round predates the rolling
 * 30-day window.
 *
 * What this does (idempotent, --dry-run aware):
 *   A. Capture rinin376's current team_id from his existing rounds.
 *   B. DELETE rinin376's rounds. All children CASCADE (golf_holes, golf_shots,
 *      golf_round_reviews, golf_round_stats_cache) — verified via FK delete_rule.
 *   C. Clone a complete Guilford source player (Braeden Gillen, 15 full rounds)
 *      onto rinin376 — round → holes → shots with fresh UUIDs + remapped FKs,
 *      mirroring the tested copyForPair() logic in the seeder.
 *   D. Re-date EVERY round on the demo team by one uniform offset so the most
 *      recent round lands on today — freshens the rolling-window shot analytics
 *      for rinin376 AND the 5 teammates while preserving head-to-head spacing.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/refresh-demo-nick-rini.ts --dry-run
 *   (drop --dry-run to write)
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const RININ_PLAYER_ID = '49ffe06d-9b22-4f2f-8c69-f56badbbde6b'; // Nick Rini (rinin376)
const SRC_PLAYER_ID = 'a37e4fc9-e54e-4955-ac1a-0bb4c86f7d47';   // Braeden Gillen — 15 complete rounds
const SRC_NAME = 'Braeden Gillen';
const DEMO_TEAM_ID_FALLBACK = '6ecdd1a6-63fe-4beb-b094-00118f334163';

function isoDateAddDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  const shifted = new Date(ms + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function wipeAndClone(supabase: SupabaseClient, dryRun: boolean): Promise<string> {
  // ---- A. capture current team_id ----
  const { data: existing, error: exErr } = await supabase
    .from('golf_rounds')
    .select('id, team_id, round_date')
    .eq('player_id', RININ_PLAYER_ID);
  if (exErr) throw exErr;
  const rounds = existing ?? [];
  const teamCounts = new Map<string, number>();
  for (const r of rounds) {
    const t = (r as { team_id: string | null }).team_id;
    if (t) teamCounts.set(t, (teamCounts.get(t) ?? 0) + 1);
  }
  let teamId = DEMO_TEAM_ID_FALLBACK;
  let best = -1;
  for (const [t, c] of teamCounts) if (c > best) { best = c; teamId = t; }
  console.log(`[A] rinin376 currently has ${rounds.length} rounds on team ${teamId}`);

  // ---- B. delete (cascade) ----
  if (rounds.length > 0) {
    if (!dryRun) {
      const { error: delErr } = await supabase
        .from('golf_rounds')
        .delete()
        .eq('player_id', RININ_PLAYER_ID);
      if (delErr) throw delErr;
    }
    console.log(`[B] ${dryRun ? '(dry) would delete' : 'deleted'} ${rounds.length} rounds (+ cascaded holes/shots/reviews/stats_cache)`);
  }

  // ---- C. clone Braeden Gillen → rinin376 ----
  const { data: srcRounds, error: srcErr } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', SRC_PLAYER_ID)
    .order('round_date', { ascending: true });
  if (srcErr) throw srcErr;
  if (!srcRounds || srcRounds.length === 0) throw new Error('source has no rounds');

  let nRounds = 0, nHoles = 0, nShots = 0;
  for (const srcRound of srcRounds) {
    const newRoundId = randomUUID();
    const { id: _oldId, draft_data: _oldDraft, ...roundCols } = srcRound as Record<string, unknown> & {
      id: string; draft_data: unknown;
    };
    const newRound = {
      ...roundCols,
      id: newRoundId,
      player_id: RININ_PLAYER_ID,
      team_id: teamId,
      notes:
        (typeof roundCols.notes === 'string' && roundCols.notes ? `${roundCols.notes}\n` : '') +
        `[seed-from-${SRC_NAME.replace(/\s+/g, '-').toLowerCase()}]`,
    };
    if (!dryRun) {
      const { error: rErr } = await supabase.from('golf_rounds').insert(newRound);
      if (rErr) { console.error(`[C] round insert: ${rErr.message}`); continue; }
    }
    nRounds++;

    const { data: srcHoles } = await supabase
      .from('golf_holes').select('*').eq('round_id', srcRound.id).order('hole_number');
    const holeIdMap = new Map<string, string>();
    for (const srcHole of srcHoles ?? []) {
      const newHoleId = randomUUID();
      holeIdMap.set(srcHole.id, newHoleId);
      const { id: _h, ...holeCols } = srcHole as Record<string, unknown> & { id: string };
      const newHole = { ...holeCols, id: newHoleId, round_id: newRoundId };
      if (!dryRun) {
        const { error: hErr } = await supabase.from('golf_holes').insert(newHole);
        if (hErr) console.error(`[C] hole insert: ${hErr.message}`);
      }
      nHoles++;
    }

    const { data: srcShots } = await supabase.from('golf_shots').select('*').eq('round_id', srcRound.id);
    const shotList = srcShots ?? [];
    if (shotList.length > 0 && !dryRun) {
      const newShots = shotList.map((srcShot) => {
        const { id: _s, ...shotCols } = srcShot as Record<string, unknown> & { id: string };
        return {
          ...shotCols,
          id: randomUUID(),
          round_id: newRoundId,
          hole_id:
            shotCols.hole_id && typeof shotCols.hole_id === 'string'
              ? holeIdMap.get(shotCols.hole_id) ?? null
              : null,
        };
      });
      const CHUNK = 100;
      for (let i = 0; i < newShots.length; i += CHUNK) {
        const { error: sErr } = await supabase.from('golf_shots').insert(newShots.slice(i, i + CHUNK));
        if (sErr) { console.error(`[C] shot chunk: ${sErr.message}`); break; }
      }
    }
    nShots += shotList.length;
  }
  console.log(`[C] ${dryRun ? '(dry) would clone' : 'cloned'} ${nRounds} rounds / ${nHoles} holes / ${nShots} shots from ${SRC_NAME}`);

  return teamId;
}

async function redateTeam(supabase: SupabaseClient, teamId: string, dryRun: boolean): Promise<void> {
  // In dry-run rinin376's clone hasn't landed, so re-read after the (real) clone.
  const { data: teamRounds, error } = await supabase
    .from('golf_rounds')
    .select('id, round_date')
    .eq('team_id', teamId);
  if (error) throw error;
  const list = (teamRounds ?? []).filter((r) => (r as { round_date: string | null }).round_date);
  if (list.length === 0) { console.log('[D] no rounds to re-date'); return; }

  const maxDate = list
    .map((r) => (r as { round_date: string }).round_date)
    .reduce((a, b) => (a > b ? a : b));
  const today = todayUtcIso();
  const offsetDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${maxDate}T00:00:00Z`)) / 86_400_000);
  if (offsetDays <= 0) { console.log(`[D] data already current (max ${maxDate}); no shift`); return; }

  console.log(`[D] shifting ${list.length} team rounds by +${offsetDays}d (max ${maxDate} → ${today})`);
  if (!dryRun) {
    let done = 0;
    for (const r of list) {
      const rr = r as { id: string; round_date: string };
      const nd = isoDateAddDays(rr.round_date, offsetDays);
      const { error: uErr } = await supabase.from('golf_rounds').update({ round_date: nd }).eq('id', rr.id);
      if (uErr) { console.error(`[D] update ${rr.id}: ${uErr.message}`); continue; }
      done++;
    }
    console.log(`[D] re-dated ${done}/${list.length} rounds`);
  }
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Refreshing demo player Nick Rini (rinin376)…\n`);
  const teamId = await wipeAndClone(supabase, dryRun);
  await redateTeam(supabase, teamId, dryRun);
  console.log(`\nDone.${dryRun ? ' (dry run — no writes)' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
