/**
 * Seed Demo University Golf dummy players with realistic shot data copied
 * from Ben Potter's Guilford College Men's Golf team.
 *
 * Why: the 5 demo dummies (mason / jackson / tyler-hayes / owen / ethan @
 * demo.helmsportslabs.com) have stub rounds with 0 shots — CoachHelm has
 * nothing to analyze. Copying real shot-level data from Guilford gives the
 * Demo team the data fodder needed to test CoachHelm end-to-end.
 *
 * Mapping:
 *   Mason Rivers   ← Andrew Perry      (12 rounds)
 *   Jackson Hale   ← Braeden Gillen    (15 rounds)
 *   Tyler Hayes    ← James Peach       (11 rounds)
 *   Owen Carter    ← Larsen Gallimore  (12 rounds)
 *   Ethan Park     ← Luke Wise         (13 rounds)
 *
 * Nick Rini (real player) is untouched. Tyler Passmore (real, no rounds)
 * is also untouched.
 *
 * The script:
 *   1. For each (src, dst) pair: deletes any existing stub rounds for the
 *      dst player (those have 0 shots — useless and would mix with real data).
 *   2. Iterates source rounds; for each, generates new UUIDs and inserts
 *      golf_rounds → golf_holes → golf_shots, rewriting player_id, team_id,
 *      and FK references. Source course_id is preserved (courses are shared).
 *   3. Counts what landed.
 *
 * Idempotent: re-running deletes the just-copied stub rounds (now empty
 * after reseed has run) and re-copies. Safe to run multiple times.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/seed-demo-team-from-guilford.ts
 *   --dry-run flag previews without writing.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';

interface CopyPair {
  srcPlayerId: string;
  srcName: string;
  dstPlayerId: string;
  dstName: string;
}

const PAIRS: CopyPair[] = [
  { srcPlayerId: '654d35a1-510c-49ad-9d1c-33757ba4bbda', srcName: 'Andrew Perry',     dstPlayerId: '9458ca63-9dbe-4020-ab13-9e2b70f70c80', dstName: 'Mason Rivers' },
  { srcPlayerId: 'a37e4fc9-e54e-4955-ac1a-0bb4c86f7d47', srcName: 'Braeden Gillen',  dstPlayerId: 'b40a650a-bce0-4e46-87cd-365b0256ee21', dstName: 'Jackson Hale' },
  { srcPlayerId: '3059fe37-2f16-4c5f-a4a4-e8c9601dcf44', srcName: 'James Peach',      dstPlayerId: 'faced578-b271-416f-b757-ac3aee5bd9e5', dstName: 'Tyler Hayes' },
  { srcPlayerId: 'cd822fe9-cce3-45fc-b5d3-96bd1f3c933b', srcName: 'Larsen Gallimore', dstPlayerId: '8091da4b-dbc9-47f3-80f1-be37c96b2c91', dstName: 'Owen Carter' },
  { srcPlayerId: '32bd954c-4ed0-4471-a691-ef885b65ce6e', srcName: 'Luke Wise',        dstPlayerId: '8e382583-2ce6-4d15-8568-5088cf02dbd1', dstName: 'Ethan Park' },
];

interface CopyResult {
  pair: CopyPair;
  rounds: number;
  holes: number;
  shots: number;
  deletedStubs: number;
}

async function copyForPair(
  supabase: SupabaseClient,
  pair: CopyPair,
  dryRun: boolean,
): Promise<CopyResult> {
  let result: CopyResult = { pair, rounds: 0, holes: 0, shots: 0, deletedStubs: 0 };

  // Step 1: count + (optionally) delete existing stub rounds for the dst player.
  // Stub = round with no shots. Real seed data we just copied has shots, so we
  // only want to wipe the original stubs not our previous reseed.
  const { data: dstRounds } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', pair.dstPlayerId);
  const dstRoundIds = (dstRounds ?? []).map((r: { id: string }) => r.id);

  if (dstRoundIds.length > 0) {
    const { count: shotCount } = await supabase
      .from('golf_shots')
      .select('id', { count: 'exact', head: true })
      .in('round_id', dstRoundIds);
    if ((shotCount ?? 0) === 0) {
      // No shots → all stubs. Wipe rounds + holes (cascades / explicit deletes).
      result.deletedStubs = dstRoundIds.length;
      if (!dryRun) {
        // Delete holes first (FK to round)
        await supabase.from('golf_holes').delete().in('round_id', dstRoundIds);
        await supabase.from('golf_rounds').delete().in('id', dstRoundIds);
      }
    }
    // If shotCount > 0, the dst already has previously-seeded data. Skip
    // re-deletion to avoid wiping prior seed runs that are still useful.
  }

  // Step 2: load source rounds with full payload.
  const { data: srcRounds, error: srcErr } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', pair.srcPlayerId)
    .order('round_date', { ascending: true });
  if (srcErr) throw srcErr;
  if (!srcRounds || srcRounds.length === 0) {
    console.log(`[skip] ${pair.srcName} has no rounds`);
    return result;
  }

  // Step 3: for each source round, copy round → holes → shots with new IDs.
  for (const srcRound of srcRounds) {
    const newRoundId = randomUUID();

    // Build new round row (override player_id + team_id, drop id, draft_data).
    const { id: _oldId, draft_data: _oldDraft, ...roundCols } = srcRound as Record<string, unknown> & {
      id: string;
      draft_data: unknown;
    };
    const newRound = {
      ...roundCols,
      id: newRoundId,
      player_id: pair.dstPlayerId,
      team_id: DEMO_TEAM_ID,
      // Stamp the seed in notes so we can identify these later if needed.
      notes:
        (typeof roundCols.notes === 'string' && roundCols.notes ? `${roundCols.notes}\n` : '') +
        `[seed-from-${pair.srcName.replace(/\s+/g, '-').toLowerCase()}]`,
    };

    if (!dryRun) {
      const { error: roundErr } = await supabase.from('golf_rounds').insert(newRound);
      if (roundErr) {
        console.error(`[error] insert round for ${pair.dstName}: ${roundErr.message}`);
        continue;
      }
    }
    result.rounds++;

    // Holes for this round.
    const { data: srcHoles } = await supabase
      .from('golf_holes')
      .select('*')
      .eq('round_id', srcRound.id)
      .order('hole_number');

    const holeIdMap = new Map<string, string>(); // old_hole_id → new_hole_id
    for (const srcHole of srcHoles ?? []) {
      const newHoleId = randomUUID();
      holeIdMap.set(srcHole.id, newHoleId);
      const { id: _hOldId, ...holeCols } = srcHole as Record<string, unknown> & { id: string };
      const newHole = { ...holeCols, id: newHoleId, round_id: newRoundId };
      if (!dryRun) {
        const { error: holeErr } = await supabase.from('golf_holes').insert(newHole);
        if (holeErr) {
          console.error(`[error] insert hole #${srcHole.hole_number} for ${pair.dstName}: ${holeErr.message}`);
        }
      }
      result.holes++;
    }

    // Shots for this round.
    const { data: srcShots } = await supabase
      .from('golf_shots')
      .select('*')
      .eq('round_id', srcRound.id);

    if ((srcShots ?? []).length > 0 && !dryRun) {
      const newShots = (srcShots ?? []).map((srcShot) => {
        const { id: _sOldId, ...shotCols } = srcShot as Record<string, unknown> & { id: string };
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
      // Bulk insert shots in chunks of 100 to keep payload reasonable.
      const CHUNK = 100;
      for (let i = 0; i < newShots.length; i += CHUNK) {
        const chunk = newShots.slice(i, i + CHUNK);
        const { error: shotErr } = await supabase.from('golf_shots').insert(chunk);
        if (shotErr) {
          console.error(`[error] insert shot chunk for ${pair.dstName} round ${srcRound.round_date}: ${shotErr.message}`);
          break;
        }
      }
    }
    result.shots += (srcShots ?? []).length;
  }

  return result;
}

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');

  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Seeding Demo dummies from Guilford...`,
  );

  const results: CopyResult[] = [];
  for (const pair of PAIRS) {
    console.log(`\n→ ${pair.srcName} (${pair.srcPlayerId.slice(0, 8)}) → ${pair.dstName} (${pair.dstPlayerId.slice(0, 8)})`);
    const res = await copyForPair(supabase, pair, dryRun);
    results.push(res);
    console.log(
      `   deleted_stubs=${res.deletedStubs} rounds=${res.rounds} holes=${res.holes} shots=${res.shots}`,
    );
  }

  const totalRounds = results.reduce((a, r) => a + r.rounds, 0);
  const totalHoles = results.reduce((a, r) => a + r.holes, 0);
  const totalShots = results.reduce((a, r) => a + r.shots, 0);
  console.log(
    `\nDone. ${dryRun ? '(dry run) ' : ''}Total rounds=${totalRounds}, holes=${totalHoles}, shots=${totalShots}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
