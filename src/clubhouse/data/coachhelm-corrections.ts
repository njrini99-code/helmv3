import 'server-only';
import { runWithCoachHelmTeams } from '@/lib/coachhelm/canary';
import { isCorrectionsEnabled } from '@/lib/coachhelm/v3/corrections/flag';
import { selectOwnCorrections } from '@/lib/coachhelm/v3/corrections/load-weights';
import type { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { laterRoundsLeft, snoozeRoundsSince, type ChCorrectionsInput, type SnoozeRoundRow } from './coachhelm-engine-shape';

/** The newest rounds read to count a hold's checkpoints (the lifecycle job reads the same number). */
const ROUNDS_LIMIT = 120;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One read the page draws, with the player it is about (for Show later's round count). */
export interface ChCorrectableRead {
  id: string;
  playerId: string;
}

/**
 * The correction chips' gate and state for the reads a page draws (03 §7.2, `recordCoachHelmCorrection`). Null when the chips are
 * not drawn: `coachhelm_corrections_v1` off for these teams (nothing is read), no signed-in user, or the HELD table
 * (20261020121000) not there yet, which is "not available", never an error. Otherwise each read maps to the viewer's role and
 * their own last answer on it, and a read they held back with Show later carries the rounds left before it comes back.
 *
 * The caller says who the viewer is to these reads: `coach` only on a coach's board for their own team's players (the route
 * checks the staff row), `player` only on the player's own reads. The action checks both again on every write.
 */
export async function readCorrections(
  supabase: Supabase,
  input: { role: 'coach' | 'player'; teamIds: readonly string[]; reads: readonly ChCorrectableRead[] },
): Promise<Map<string, ChCorrectionsInput> | null> {
  // HELM_COACHHELM_TEAMS canary: the flag is decided in the teams' scope, as the action decides it.
  if (!runWithCoachHelmTeams(input.teamIds, isCorrectionsEnabled) || input.reads.length === 0) return null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const own = await selectOwnCorrections(
      supabase,
      user.id,
      input.reads.map((r) => r.id),
    );
    if (own.missing) return null;
    if (own.error) chLogServer('coachhelm', 'corrections.read', new Error('own corrections read failed'), 'coachhelm');
    // Newest first, so the first row per read is the answer that counts.
    const latest = new Map<string, (typeof own.rows)[number]>();
    for (const r of own.rows) if (!latest.has(r.insight_id)) latest.set(r.insight_id, r);

    const out = new Map<string, ChCorrectionsInput>();
    await Promise.all(
      input.reads.map(async (read) => {
        const last = latest.get(read.id) ?? null;
        let laterRounds: number | null = null;
        if (last?.kind === 'snooze' && input.role === 'coach') {
          // Countable rounds posted since the answer, counted from its saved anchor in the engine's round order: each is a
          // checkpoint the read is rechecked on. A count that fails keeps the read held back for the whole period rather than
          // showing it early.
          const res = (await supabase
            .from('golf_rounds')
            .select('id, round_date, created_at, holes_played, total_score, front_nine, back_nine, total_putts')
            .eq('player_id', read.playerId)
            .eq('is_test', false)
            .eq('status', 'completed')
            .order('round_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(ROUNDS_LIMIT)) as { data: SnoozeRoundRow[] | null; error: unknown };
          laterRounds = laterRoundsLeft(res.error ? 0 : snoozeRoundsSince(last.checkpoint_round_id, last.created_at, res.data ?? []));
        }
        out.set(read.id, { role: input.role, latest: last ? { kind: last.kind, reason: last.reason } : null, laterRounds });
      }),
    );
    return out;
  } catch (err) {
    chLogServer('coachhelm', 'corrections.read', err, 'coachhelm');
    return null;
  }
}
