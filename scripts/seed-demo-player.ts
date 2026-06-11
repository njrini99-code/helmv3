/**
 * Seed ONE demo player by cloning a source player's shot-level data, re-dated
 * to the current window so CoachHelm's 90-day windows include the rounds and
 * the team looks current.
 *
 * Used to fill the renamed Dylan Brooks (was the real-person "Tyler Passmore",
 * deliberately left dataless in the original Guilford seed). Mirrors the clone
 * logic of seed-demo-team-from-guilford.ts and adds round_date re-dating like
 * refresh-demo-nick-rini.ts.
 *
 * After this runs, refresh stats + insights:
 *   - rpc refresh_player_stats_cache (per player)
 *   - scripts/recompute-sg-cache.ts          (correct SG, post-cache)
 *   - rpc refresh_player_standing            (team)
 *   - scripts/regen-coachhelm-from-corrected-stats.ts <TARGET_PLAYER_ID>
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-demo-player.ts [--dry-run]
 *
 * Idempotent: deletes the target's existing rounds (holes/shots cascade via
 * explicit deletes) before cloning. Strictly scoped to the TARGET player.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';

// Andrew Perry (Guilford men's, 12 rounds / ~903 shots) → Dylan Brooks.
const SOURCE_PLAYER_ID = '654d35a1-510c-49ad-9d1c-33757ba4bbda'; // Andrew Perry
const TARGET_PLAYER_ID = 'ed1ff03e-b33a-4a80-891e-09685b7db3d0'; // Dylan Brooks (was Tyler Passmore)
const SOURCE_NAME = 'andrew-perry';
// Land the newest cloned round on this date (matches the team's current newest).
const TARGET_NEWEST_ISO = '2026-06-09';

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');
  const dryRun = process.argv.includes('--dry-run');
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Cloning ${SOURCE_NAME} → target ${TARGET_PLAYER_ID.slice(0, 8)} (Dylan Brooks)`);

  // 1. Delete target's existing rounds (idempotent; Dylan currently has 0).
  const { data: existing } = await supabase.from('golf_rounds').select('id').eq('player_id', TARGET_PLAYER_ID);
  const existingIds = (existing ?? []).map((r: { id: string }) => r.id);
  if (existingIds.length > 0 && !dryRun) {
    await supabase.from('golf_shots').delete().in('round_id', existingIds);
    await supabase.from('golf_holes').delete().in('round_id', existingIds);
    await supabase.from('golf_rounds').delete().in('id', existingIds);
  }
  console.log(`  ${dryRun ? 'would delete' : 'deleted'} ${existingIds.length} existing target rounds`);

  // 2. Load source rounds, compute the re-date offset (newest → TARGET_NEWEST).
  const { data: srcRounds, error: srcErr } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', SOURCE_PLAYER_ID)
    .eq('status', 'completed')
    .order('round_date', { ascending: true });
  if (srcErr) throw srcErr;
  if (!srcRounds || srcRounds.length === 0) throw new Error('source has no completed rounds');

  const srcNewest = srcRounds[srcRounds.length - 1].round_date as string;
  const deltaDays = Math.round(
    (new Date(TARGET_NEWEST_ISO + 'T00:00:00Z').getTime() - new Date(srcNewest + 'T00:00:00Z').getTime()) / 86400000,
  );
  console.log(`  ${srcRounds.length} source rounds; re-dating by ${deltaDays} days (newest ${srcNewest} → ${TARGET_NEWEST_ISO})`);

  let rounds = 0, holes = 0, shots = 0;
  for (const srcRound of srcRounds) {
    const newRoundId = randomUUID();
    const { id: _id, draft_data: _dd, ...roundCols } = srcRound as Record<string, unknown> & { id: string; draft_data: unknown };
    const newRound = {
      ...roundCols,
      id: newRoundId,
      player_id: TARGET_PLAYER_ID,
      team_id: DEMO_TEAM_ID,
      round_date: shiftDate(srcRound.round_date as string, deltaDays),
      notes: `[seed-from-${SOURCE_NAME}]`,
    };
    if (!dryRun) {
      const { error } = await supabase.from('golf_rounds').insert(newRound);
      if (error) { console.error(`  [error] round: ${error.message}`); continue; }
    }
    rounds++;

    const { data: srcHoles } = await supabase.from('golf_holes').select('*').eq('round_id', srcRound.id).order('hole_number');
    const holeIdMap = new Map<string, string>();
    for (const h of srcHoles ?? []) {
      const newHoleId = randomUUID();
      holeIdMap.set(h.id, newHoleId);
      const { id: _hid, ...holeCols } = h as Record<string, unknown> & { id: string };
      if (!dryRun) {
        const { error } = await supabase.from('golf_holes').insert({ ...holeCols, id: newHoleId, round_id: newRoundId });
        if (error) console.error(`  [error] hole #${h.hole_number}: ${error.message}`);
      }
      holes++;
    }

    const { data: srcShots } = await supabase.from('golf_shots').select('*').eq('round_id', srcRound.id);
    if ((srcShots ?? []).length > 0 && !dryRun) {
      const newShots = (srcShots ?? []).map((s) => {
        const { id: _sid, ...shotCols } = s as Record<string, unknown> & { id: string };
        return {
          ...shotCols,
          id: randomUUID(),
          round_id: newRoundId,
          hole_id: shotCols.hole_id && typeof shotCols.hole_id === 'string' ? holeIdMap.get(shotCols.hole_id) ?? null : null,
        };
      });
      for (let i = 0; i < newShots.length; i += 100) {
        const { error } = await supabase.from('golf_shots').insert(newShots.slice(i, i + 100));
        if (error) { console.error(`  [error] shot chunk: ${error.message}`); break; }
      }
    }
    shots += (srcShots ?? []).length;
  }

  console.log(`\nDone. ${dryRun ? '(dry run) ' : ''}rounds=${rounds} holes=${holes} shots=${shots}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
