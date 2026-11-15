import { describe, expect, it } from 'vitest';
import type { FieldDayEntry } from '@/lib/coachhelm/v3/field-day/field';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { FIELD_PLAYER_FLOOR, teamFigureOf, toChFileField, toChFilePlan, toChFileSg, toChFileTrack, type ChFocusRow } from '../coachhelm-file-shape';
import { playerFileHref } from '../coachhelm-views-shape';
import type { ChLadder } from '../coachhelm-ladder-shape';

/** Lenses W-LNS-2, W-LNS-5, W-LNS-10, W-LNS-11, W-TEAM-13: what the player's file carries, by viewer, and where its links go. */

const ZONE = 'America/New_York';
const ROUND = { date: '2026-10-05', course: 'Hilltop', score: 71 };
const OTHERS = [4.5, -3.25, 9.75, 1.5];
const entry = (n: number, relative = -2): FieldDayEntry => ({ field_n: n, field_mean: 3, relative }) as unknown as FieldDayEntry;

describe('toChFileField: the field card by viewer (W-LNS-10)', () => {
  it('a player under the floor gets no card at all: the mean would give away the teammates', () => {
    expect(toChFileField(entry(FIELD_PLAYER_FLOOR - 1), [], { role: 'player' }, ROUND, ZONE)).toBeNull();
  });

  it('a coach still gets the card under the floor', () => {
    expect(toChFileField(entry(2), [1], { role: 'coach', first: 'Eli' }, ROUND, ZONE)).not.toBeNull();
  });

  it('a player at the floor gets dots null, even if a caller passes teammates', () => {
    const card = toChFileField(entry(FIELD_PLAYER_FLOOR), OTHERS, { role: 'player' }, ROUND, ZONE);
    expect(card?.dots).toBeNull();
    const text = JSON.stringify(card);
    for (const v of OTHERS) expect(text).not.toContain(String(v));
  });

  it('a teammate outlier cannot move a player scale: the scale is the player and the mean only', () => {
    const quiet = toChFileField(entry(FIELD_PLAYER_FLOOR), [], { role: 'player' }, ROUND, ZONE);
    const forged = toChFileField(entry(FIELD_PLAYER_FLOOR), [40], { role: 'player' }, ROUND, ZONE);
    expect(forged?.scale).toEqual(quiet?.scale);
  });

  it('a coach gets dots as sorted numbers with no id or name beside them', () => {
    const card = toChFileField(entry(6), OTHERS, { role: 'coach', first: 'Eli' }, ROUND, ZONE);
    expect(card?.dots).toEqual([-3.25, 1.5, 4.5, 9.75]);
    expect(card?.dots?.every((d) => typeof d === 'number')).toBe(true);
  });
});

const row = (over: Partial<ChFocusRow> = {}): ChFocusRow => ({ id: 'f1', title: 'Approach', status: 'proposed', created_at: '2026-10-01T15:00:00Z', started_at: null, updated_at: null, from_insight_id: 'ins-1', ...over });

describe('the handshake: Shown is earned, never assumed (W-LNS-5)', () => {
  it('a focus with no source read shows a dash and stays suggested', () => {
    const plan = toChFilePlan(row({ from_insight_id: null }), null, null, null, 'Coach Reed', ZONE);
    expect(plan.handshake.shown).toBe('unknown');
    expect(plan.stage).toBe('suggested');
  });

  it('a proposed focus with no exposure has not been shown', () => {
    const plan = toChFilePlan(row(), null, null, null, 'Coach Reed', ZONE);
    expect(plan.handshake.shown).toBeNull();
    expect(plan.stage).toBe('suggested');
  });

  it('a proposed focus with an exposure is shown, dated in the team zone', () => {
    const plan = toChFilePlan(row(), '2026-10-05T02:00:00Z', null, null, 'Coach Reed', ZONE);
    expect(plan.stage).toBe('shown');
    expect(plan.handshake.shown).toBe('Oct 4');
  });

  it('a goal and practice line draw only once the focus is accepted', () => {
    const goal = { title: 'GIR', snapshots: [], baseline_value: 50, target_value: 60 } as unknown as Goal;
    const practice = { drill: 'Ladder', count: 2 };
    expect(toChFilePlan(row(), null, goal, practice, 'Coach Reed', ZONE)).toMatchObject({ goal: null, practice: null });
    const on = toChFilePlan(row({ status: 'active', started_at: '2026-10-02T15:00:00Z' }), null, goal, practice, 'Coach Reed', ZONE);
    expect(on.stage).toBe('accepted');
    expect(on.goal?.title).toBe('GIR');
    expect(on.practice).toEqual(practice);
  });
});

describe('the SG card team tick needs five teammates (W-LNS-11)', () => {
  const ladder = {
    rows: [
      { id: 'tee', label: 'Off the tee', strokes: '−0.9', sense: 'loss' },
      { id: 'putting', label: 'Putting', strokes: '+0.2', sense: 'gain' },
    ],
  } as unknown as ChLadder;
  const standing = (metric_id: string, player_value: number, team_n: number, team_avg: number | null) => ({ metric_id, player_value, team_n, team_avg }) as unknown as PlayerStanding;
  const SOURCE = { window: 'All time', rounds: 21 };

  it('under five there is no team figure and the note stays against the Tour', () => {
    const sg = toChFileSg(ladder, [standing('sg_ott', -0.9, 4, -0.2), standing('sg_putting', 0.2, 4, 0)], { you: false, first: 'Eli' }, SOURCE);
    expect(sg.hasTeam).toBe(false);
    expect(sg.rows.map((r) => r.team)).toEqual([null, null]);
    expect(sg.note).toBe('Against the Tour, off the tee costs Eli 0.9 a round.');
    expect(teamFigureOf([standing('sg_ott', -0.9, 4, -0.2)], 'sg_ott')).toBeNull();
  });

  it('at five the team figure draws and the note adds the gap', () => {
    const sg = toChFileSg(ladder, [standing('sg_ott', -0.9, 5, -0.2), standing('sg_putting', 0.2, 5, 0)], { you: false, first: 'Eli' }, SOURCE);
    expect(sg.hasTeam).toBe(true);
    expect(sg.note).toBe('Against the Tour, off the tee costs Eli 0.9 a round; against the team, 0.7.');
    expect(teamFigureOf([standing('sg_ott', -0.9, 5, -0.2)], 'sg_ott')).toBe(-0.2);
  });
});

describe('toChFileTrack counts only what happened', () => {
  const focus = (id: string, outcome_status: string | null, from_insight_id: string | null = null) => ({ id, title: id, outcome_status, completed_at: null, from_insight_id });

  it('counts outcomes, leaves unmeasured ones open, and shows a delta only at three rounds after', () => {
    const track = toChFileTrack(
      [focus('a', 'improved', 'i1'), focus('b', 'no_change', 'i2'), focus('c', 'worsened'), focus('d', null)],
      [
        { insight_id: 'i1', baseline_value: -1.2, post_value: -0.4, n_rounds_after: 3 },
        { insight_id: 'i2', baseline_value: 1, post_value: 1, n_rounds_after: 2 },
      ],
      ZONE,
    );
    expect(track).toMatchObject({ assigned: 4, improved: 1, noChange: 1, open: 1 });
    expect(track.rows.map((r) => r.word)).toEqual(['Improved', 'No change', 'Got worse']);
    expect(track.rows[0]?.meta).toContain(' to ');
    expect(track.rows[1]?.meta).toBe('');
  });
});

describe('playerFileHref (W-LNS-2, W-TEAM-13)', () => {
  it('the file, with card and insight kept and encoded', () => {
    expect(playerFileHref('p/1', { card: 'sg', insight: 'i 1' })).toBe('/golf/dashboard/coachhelm?view=player&player=p%2F1&at=sg&insight=i%201');
    expect(playerFileHref('p1', undefined)).toBe('/golf/dashboard/coachhelm?view=player&player=p1');
  });
});
