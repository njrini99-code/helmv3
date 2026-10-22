import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { loadActiveGoalsForPlayers } from '@/lib/coachhelm/v3/goals/loader';
import { computeMondayBrief } from '@/lib/coachhelm/v3/monday-brief/brief';
import { loadBriefInputs } from '@/lib/coachhelm/v3/monday-brief/loader';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { isTrackRecordEnabled } from '@/lib/coachhelm/v3/track-record/flag';
import { chLogServer } from '../lib/track-server';
import { toChCoachBrief, type BriefFocusRow, type ChCoachBrief, type CoachBriefInputs } from './coachhelm-coach-brief-shape';
import { briefGate } from './coachhelm-monday-brief';
import { loadCoachTrackRecord } from './coachhelm-track-record';
import type { ChViewLoad } from './coachhelm-views-shape';

export type * from './coachhelm-coach-brief-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const log = (what: string, err: unknown) => chLogServer('coachhelm', `coach_brief_${what}`, err);

/** The roster's focus areas a coach is working on with them (`active`, `in_progress`), through the session's client. null: the read failed. */
async function readFocus(supabase: Supabase, ids: string[]): Promise<BriefFocusRow[] | null> {
  const out: BriefFocusRow[] = [];
  for (const chunk of chunkIds(ids)) {
    const res = await supabase
      .from('golf_player_focus_areas')
      .select('id, player_id, title, status, target_metric, baseline_value, current_value, target_value, target_rounds, started_at, created_at')
      .in('player_id', chunk)
      .in('status', ['active', 'in_progress'])
      .order('created_at', { ascending: false });
    if (res.error) {
      log('focus', res.error);
      return null;
    }
    out.push(...((res.data ?? []) as BriefFocusRow[]));
  }
  return out;
}

/** A read beside the brief that failed is null (named on the screen), never thrown and never an empty section. */
async function orNull<T>(what: string, read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (err) {
    log(what, err);
    return null;
  }
}

/**
 * The coach's Brief for one team (P013 `?view=brief`, behind `coachhelm_monday_brief_v1`; the route checks the flag). Read only
 * once CoachHelm is on for this coach and this team, as the Monday brief is, and never throws: the roster, reads and rounds the
 * brief is made from failing is `failed`; a section's own read failing leaves that section out and names it. Nothing is recorded as
 * shown (no delivery action is called), so opening the Brief never counts a read as seen.
 *
 * Reads, beside each other once the roster is known: the Monday brief's inputs (roster, visible reads, countable rounds, team
 * patterns with their flag on), the roster's live focus areas, active goals and standing (both through the service client, scoped to
 * the roster this session read, as the Fairway page and the Deep dive do), and with `coachhelm_track_record_v1` on the Track
 * record. No new table.
 */
export async function loadCoachBrief(input: { coachId: string; teamId: string; now?: Date }): Promise<ChViewLoad<ChCoachBrief>> {
  try {
    const supabase = await createClient();
    const closed = await briefGate(supabase, input.coachId, input.teamId);
    if (closed) return closed;
    const now = input.now ?? new Date();

    // The Track record re-checks the gate itself and reads its own rows; it starts now, beside the brief's reads.
    const recordRead: Promise<CoachBriefInputs['record']> = isTrackRecordEnabled()
      ? loadCoachTrackRecord({ coachId: input.coachId, teamId: input.teamId, now }).then(
          (r) => (r.status === 'ready' ? r.data : r.status === 'failed' ? 'failed' : null),
          (err: unknown) => {
            log('record', err);
            return 'failed' as const;
          },
        )
      : Promise.resolve(null);

    const inputs = await loadBriefInputs(supabase, input.teamId, now);
    if (!inputs) {
      await recordRead;
      return { status: 'failed' };
    }
    const ids = inputs.roster.map((p) => p.id);
    const [focus, goals, standing, record] = await Promise.all([
      ids.length ? readFocus(supabase, ids) : Promise.resolve([]),
      orNull('goals', loadActiveGoalsForPlayers(ids)),
      orNull('standing', loadPlayersStandingMap(ids)),
      recordRead,
    ]);

    const brief = computeMondayBrief({
      teamId: input.teamId,
      roster: inputs.roster,
      reads: inputs.reads,
      rounds: inputs.rounds,
      teamPattern: inputs.patterns?.patterns[0] ?? null,
      withEnoughRounds: inputs.eligible.size,
      now,
      maxItems: Number.POSITIVE_INFINITY,
    });
    return {
      status: 'ready',
      data: toChCoachBrief({ brief, patterns: inputs.patterns, roster: inputs.roster, rounds: inputs.rounds, focus, goals, standing, record }),
    };
  } catch (err) {
    log('load', err);
    return { status: 'failed' };
  }
}
