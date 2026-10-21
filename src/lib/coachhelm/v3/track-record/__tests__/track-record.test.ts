import { describe, expect, it } from 'vitest';
import type { CorrectionForPrecision } from '@/lib/coachhelm/v3/corrections/precision-counters';
import type { ReadLifecycleMeta } from '@/lib/coachhelm/v3/lifecycle/types';
import {
  buildTrackRecord,
  RUNG_TARGETS,
  rungOfShownRead,
  targetStanding,
  TRACK_RECORD_MIN_RECHECKED,
  TRACK_RECORD_RUNGS,
  type ShownRead,
} from '../track-record';

const HELD: ReadLifecycleMeta = { checkpoints_seen: 2, checkpoints_held: 2, last_checkpoint_at: '2026-10-12T00:00:00Z' };
const CLEARED: ReadLifecycleMeta = { checkpoints_seen: 2, cleared_at: '2026-10-12T00:00:00Z' };
const NEVER: ReadLifecycleMeta = { checkpoints_seen: 0 };

let n = 0;
function read(family: string, ladder: string | null, lifecycle: ReadLifecycleMeta = NEVER, current: string | null = ladder): ShownRead {
  n += 1;
  return { insight_id: `r${n}`, family, last_shown_at: '2026-10-10T00:00:00Z', shown_ladder: ladder, current_ladder: current, lifecycle };
}
const many = (count: number, make: () => ShownRead) => Array.from({ length: count }, make);
const corr = (insight_id: string, kind: CorrectionForPrecision['kind'], created_at = '2026-10-01T00:00:00Z', author_role: 'coach' | 'player' = 'coach', author_user_id = 'coach-a'): CorrectionForPrecision => ({
  insight_id,
  kind,
  created_at,
  author_role,
  author_user_id,
});

describe('rungOfShownRead', () => {
  it('prefers the exposure’s ladder, then the read’s current ladder, else unrated', () => {
    expect(rungOfShownRead({ shown_ladder: 'observed', current_ladder: 'likely' })).toBe('observed');
    expect(rungOfShownRead({ shown_ladder: null, current_ladder: 'likely' })).toBe('likely');
    expect(rungOfShownRead({ shown_ladder: 'solid', current_ladder: null })).toBe('unrated');
  });
});

describe('targetStanding', () => {
  it('is not enough below the minimum rechecked, whatever the share', () => {
    expect(targetStanding({ held: 9, rechecked: 9 }, RUNG_TARGETS.seen_repeatedly)).toBe('not_enough');
  });
  it('judges at-least targets on whole counts, the edge on target', () => {
    expect(targetStanding({ held: 8, rechecked: 10 }, RUNG_TARGETS.seen_repeatedly)).toBe('on_target');
    expect(targetStanding({ held: 7, rechecked: 10 }, RUNG_TARGETS.seen_repeatedly)).toBe('below_target');
    expect(targetStanding({ held: 12, rechecked: 14 }, RUNG_TARGETS.seen_repeatedly)).toBe('on_target');
  });
  it('Not enough yet should hold under 5 in 10; over 6 in 10 means the floors are too strict', () => {
    expect(targetStanding({ held: 4, rechecked: 10 }, RUNG_TARGETS.not_enough_yet)).toBe('on_target');
    expect(targetStanding({ held: 5, rechecked: 10 }, RUNG_TARGETS.not_enough_yet)).toBe('below_target');
    expect(targetStanding({ held: 7, rechecked: 10 }, RUNG_TARGETS.not_enough_yet)).toBe('too_strict');
  });
  it('Working hypothesis has no target', () => {
    expect(RUNG_TARGETS.working_hypothesis).toBeNull();
    expect(targetStanding({ held: 3, rechecked: 10 }, null)).toBe('no_target');
  });
});

describe('buildTrackRecord', () => {
  it('is zeros on no reads, with all five levels drawn and Not enough yet on each', () => {
    const tr = buildTrackRecord({ reads: [] });
    expect(tr.program).toEqual({ shown: 0, held: 0, cleared: 0, contradicted: 0, rechecked: 0 });
    expect(tr.rungs.map((r) => r.rung)).toEqual(TRACK_RECORD_RUNGS);
    expect(tr.rungs.every((r) => r.standing === 'not_enough')).toBe(true);
    expect(tr.families).toEqual([]);
  });

  it('counts per level of rechecked, and judges only a level with enough', () => {
    const reads = [
      ...many(12, () => read('putt_distance', 'seen_repeatedly', HELD)),
      read('putt_distance', 'seen_repeatedly', CLEARED),
      read('putt_distance', 'seen_repeatedly', NEVER),
      ...many(3, () => read('approach_miss', 'observed', HELD)),
    ];
    const tr = buildTrackRecord({ reads });
    const seen = tr.rungs.find((r) => r.rung === 'seen_repeatedly')!;
    expect(seen).toMatchObject({ shown: 14, held: 12, cleared: 1, contradicted: 0, rechecked: 13, standing: 'on_target' });
    expect(tr.rungs.find((r) => r.rung === 'observed')).toMatchObject({ shown: 3, rechecked: 3, standing: 'not_enough' });
    expect(tr.program).toEqual({ shown: 17, held: 15, cleared: 1, contradicted: 0, rechecked: 16 });
  });

  it('a read with no ladder anywhere is in the program line and in no level', () => {
    const tr = buildTrackRecord({ reads: [read('par_scoring', null, HELD), read('par_scoring', null, NEVER, 'likely')] });
    expect(tr.unrated).toMatchObject({ shown: 1, held: 1 });
    expect(tr.rungs.find((r) => r.rung === 'likely')?.shown).toBe(1);
    expect(tr.program.shown).toBe(2);
  });

  it('families: summed across levels, most shown first, Not enough yet below the minimum', () => {
    const reads = [
      ...many(TRACK_RECORD_MIN_RECHECKED, () => read('putt_distance', 'observed', HELD)),
      ...many(2, () => read('approach_miss', 'likely', HELD)),
      read('approach_miss', 'observed', CLEARED),
    ];
    const tr = buildTrackRecord({ reads });
    expect(tr.families.map((f) => [f.family, f.shown, f.rechecked, f.standing])).toEqual([
      ['putt_distance', 10, 10, 'no_target'],
      ['approach_miss', 3, 3, 'not_enough'],
    ]);
  });

  it('corrections: coaches’ only, newest per coach per read, on shown reads; cleared-later counts only after the correction', () => {
    const a = read('approach_miss', 'likely', CLEARED); // cleared Oct 12
    const b = read('approach_miss', 'likely', CLEARED);
    const c = read('approach_miss', 'likely', HELD);
    const tr = buildTrackRecord({
      reads: [a, b, c],
      corrections: [
        corr(a.insight_id, 'not_this', '2026-10-01T00:00:00Z'),
        corr(b.insight_id, 'wrong_cause', '2026-10-13T00:00:00Z'), // after it cleared: not "cleared later"
        corr(c.insight_id, 'not_this', '2026-10-01T00:00:00Z'),
        corr(c.insight_id, 'confirm', '2026-10-05T00:00:00Z'), // the same coach changed their mind
        corr(c.insight_id, 'not_this', '2026-10-02T00:00:00Z', 'player', 'player-a'),
        corr('never-shown', 'not_this'),
      ],
    });
    expect(tr.corrections).toEqual({ not_this: 1, wrong_cause: 1, already_on_it: 0, snooze: 0, confirm: 1 });
    expect(tr.correctedThenCleared).toBe(1);
    // The family row counts every author's newest (a player's Not this included), one per read.
    expect(tr.families[0]).toMatchObject({ not_this: 2, confirm: 1 });
  });
});
