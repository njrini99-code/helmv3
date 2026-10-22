/**
 * Synthetic fixtures for the coach's Track record (P013 `?view=track-record`) in the dev preview and the tests. Every fixture is
 * made by the page's own code: synthetic shown reads and corrections go through `buildTrackRecord` and `toChTrackRecord`, so the
 * preview words and counts exactly what the page would. No real player, read or coach.
 */
import type { CorrectionForPrecision } from '@/lib/coachhelm/v3/corrections/precision-counters';
import type { CorrectionKind } from '@/lib/coachhelm/v3/corrections/types';
import type { ReadLifecycleMeta } from '@/lib/coachhelm/v3/lifecycle/types';
import { buildTrackRecord, type ShownRead } from '@/lib/coachhelm/v3/track-record/track-record';
import { toChTrackRecord, type ChTrackRecord } from '../data/coachhelm-track-record-shape';
import type { ChViewLoad } from '../data/coachhelm-views-shape';

type Outcome = 'held' | 'cleared' | 'contradicted' | null;

const SINCE = '2026-08-01';
let seq = 0;

function lifecycleFor(outcome: Outcome): ReadLifecycleMeta | null {
  if (outcome === 'held') return { checkpoints_seen: 2, checkpoints_held: 2, last_checkpoint_at: '2026-10-12T05:00:00Z' };
  if (outcome === 'cleared') return { checkpoints_seen: 2, checkpoints_held: 1, cleared_at: '2026-10-12T05:00:00Z' };
  if (outcome === 'contradicted') {
    return {
      checkpoints_seen: 1,
      conflict: {
        with_insight_id: 'preview-other',
        kind: 'opposing_direction',
        role: 'retired',
        net_strokes: null,
        resolution: 'newest_wins',
        subject: 'preview_metric',
        computed_at: '2026-10-12T05:00:00Z',
      },
    };
  }
  return { checkpoints_seen: 0 };
}

/** `n` reads of one family at one level, with the given outcomes in order (the rest never rechecked). */
function reads(family: string, ladder: string | null, n: number, outcomes: Outcome[]): ShownRead[] {
  return Array.from({ length: n }, (_, i) => {
    seq += 1;
    return {
      insight_id: `preview-read-${seq}`,
      family,
      last_shown_at: '2026-10-10T12:00:00Z',
      shown_ladder: ladder,
      current_ladder: ladder,
      lifecycle: lifecycleFor(outcomes[i] ?? null),
    };
  });
}

const repeat = (o: Outcome, n: number): Outcome[] => Array.from({ length: n }, () => o);

function corrections(list: { read: ShownRead; kind: CorrectionKind; at?: string }[]): CorrectionForPrecision[] {
  return list.map(({ read, kind, at }) => ({
    insight_id: read.insight_id,
    author_user_id: 'preview-coach',
    author_role: 'coach',
    kind,
    created_at: at ?? '2026-10-01T12:00:00Z',
  }));
}

function make(shown: ShownRead[], corr: CorrectionForPrecision[], correctionsAvailable = true): ChTrackRecord {
  return toChTrackRecord(buildTrackRecord({ reads: shown, corrections: corr }), { since: SINCE, correctionsAvailable });
}

/** A season in: three levels with enough rechecked reads (one below target), two still short, a few reads from before the ladder. */
function fullSeason(): ChTrackRecord {
  const putting = [
    ...reads('putt_distance', 'seen_repeatedly', 14, [...repeat('held', 12), 'cleared', 'contradicted']),
    ...reads('putt_distance', 'observed', 8, [...repeat('held', 6), 'cleared', 'cleared']),
  ];
  const approach = [
    ...reads('approach_miss', 'observed', 7, [...repeat('held', 5), 'cleared', 'contradicted']),
    ...reads('approach_miss', 'likely', 11, [...repeat('held', 5), 'cleared', 'cleared', 'cleared', 'contradicted', 'contradicted']),
  ];
  const tee = reads('tee_strategy', 'working_hypothesis', 6, ['held', 'cleared']);
  const scrambling = reads('scrambling', 'not_enough_yet', 3, []);
  const old = reads('par_scoring', null, 4, ['held']);
  const corr = corrections([
    { read: approach[13]!, kind: 'not_this' },
    { read: approach[14]!, kind: 'not_this' },
    { read: approach[7]!, kind: 'not_this', at: '2026-09-20T12:00:00Z' },
    { read: tee[2]!, kind: 'wrong_cause' },
    { read: putting[0]!, kind: 'confirm' },
    { read: putting[1]!, kind: 'confirm' },
    { read: tee[0]!, kind: 'already_on_it' },
  ]);
  return make([...putting, ...approach, ...tee, ...scrambling, ...old], corr);
}

/** Today in production: reads shown, none carrying a level and none rechecked yet (the engine flags are off). */
function earlySeason(): ChTrackRecord {
  return make([...reads('putt_distance', null, 9, []), ...reads('approach_miss', null, 6, []), ...reads('tee_strategy', null, 3, [])], [], false);
}

export const PREVIEW_TRACK_RECORD = fullSeason();
export const PREVIEW_TRACK_RECORD_EARLY = earlySeason();
export const PREVIEW_TRACK_RECORD_EMPTY = make([], []);
export const PREVIEW_TRACK_RECORD_UNAVAILABLE: ChTrackRecord = { state: 'unavailable' };

export const trackLoad = (data: ChTrackRecord): ChViewLoad<ChTrackRecord> => ({ status: 'ready', data });
