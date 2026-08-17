/**
 * The Program Pulse's "N open signals" item — #1479.
 *
 * Both halves of it were wrong in production, and both were only visible
 * against real data.
 *
 * 1. THE COUNT WAS THE QUERY LIMIT. The headline used `signals.length`, where
 *    `signals` is a `.limit(50)` page. Demo University Golf's roster carries
 *    148 insights (124 `status = 'active'`) and the Brief read
 *    "50 open signals across 7 players" — the cap, presented as a measurement.
 *    It would have said 50 for a team with fifty and for a team with five
 *    hundred, and the roundness is the only thing that gives it away.
 *
 * 2. THE EVIDENCE SAID ONE FINDING TWICE. It took the two newest titles
 *    verbatim, so when both came from the same generator on adjacent bands the
 *    line read, verbatim from production on 2026-08-17:
 *
 *        Downhill putts inside 4-6 ft: a real penalty ·
 *        Downhill putts inside 0-3 ft: a real penalty
 *
 *    Both are true — the slope generator runs an independent test per band and
 *    both cleared significance — but a coach reading them learns less than from
 *    one line, and this is the "insights are generic and boring" complaint in
 *    its most literal form.
 */
import { describe, it, expect } from 'vitest';
import { buildSignalsPulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';

const putt0_3 = { player_id: 'p1', title: 'Downhill putts inside 0-3 ft: a real penalty' };
const putt4_6 = { player_id: 'p2', title: 'Downhill putts inside 4-6 ft: a real penalty' };
const approach = { player_id: 'p3', title: 'Approach from 175+ yd is leaking strokes' };

describe('buildSignalsPulseItem — the headline counts, it does not report a cap', () => {
  it('reports the TOTAL, not the length of the page it was handed', () => {
    // Production shape: a 50-row page drawn from 148 real signals.
    const page = Array.from({ length: 50 }, (_, i) => ({
      player_id: `p${i % 7}`,
      title: `Signal ${i}`,
    }));
    const item = buildSignalsPulseItem(page, 148);
    expect(item?.headline).toBe('148 open signals across 7 players');
    expect(item?.headline).not.toContain('50 open');
  });

  it('singularises one signal and one player', () => {
    expect(buildSignalsPulseItem([putt0_3], 1)?.headline).toBe('1 open signal across 1 player');
  });

  it('omits the item entirely when the count is zero, rather than printing "0"', () => {
    expect(buildSignalsPulseItem([], 0)).toBeNull();
    // A failed count degrades to 0 (safeCount) — better to say nothing than to
    // tell a coach they have no signals when the query simply did not answer.
    expect(buildSignalsPulseItem([putt0_3], 0)).toBeNull();
  });
});

describe('buildSignalsPulseItem — evidence does not say one finding twice', () => {
  it('collapses two distance bands of the same finding into one line', () => {
    const item = buildSignalsPulseItem([putt4_6, putt0_3, approach], 3);
    // The exact production string that prompted this issue must not recur.
    expect(item?.evidence).not.toBe(
      'Downhill putts inside 4-6 ft: a real penalty · Downhill putts inside 0-3 ft: a real penalty',
    );
    // The freed slot goes to a genuinely different signal.
    expect(item?.evidence).toBe(
      'Downhill putts inside 4-6 ft: a real penalty · Approach from 175+ yd is leaking strokes',
    );
  });

  it('keeps two genuinely different findings', () => {
    const other = { player_id: 'p4', title: 'Scrambling from sand is below the team' };
    expect(buildSignalsPulseItem([approach, other], 2)?.evidence).toBe(
      'Approach from 175+ yd is leaking strokes · Scrambling from sand is below the team',
    );
  });

  it('shows ONE line when every signal is the same finding restated', () => {
    // Padding it back to two would be the bug wearing a different hat: if the
    // whole roster's signal set is one restated finding, that is itself the
    // honest thing to show.
    const item = buildSignalsPulseItem([putt0_3, putt4_6], 2);
    expect(item?.evidence).toBe('Downhill putts inside 0-3 ft: a real penalty');
  });

  it('ignores blank titles instead of rendering an empty separator', () => {
    const item = buildSignalsPulseItem(
      [{ player_id: 'p1', title: '   ' }, { player_id: 'p2', title: null }, approach],
      3,
    );
    expect(item?.evidence).toBe('Approach from 175+ yd is leaking strokes');
    expect(item?.evidence).not.toContain(' · ');
  });

  it('counts players from the page, and does not count a null player_id', () => {
    const item = buildSignalsPulseItem(
      [approach, { player_id: null, title: 'Team-wide trend' }],
      2,
    );
    expect(item?.headline).toBe('2 open signals across 1 player');
  });
});
