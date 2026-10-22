import { describe, expect, it } from 'vitest';
import { focusLoopOf, progressLine, type ChFocusLoopRow } from '../focus-loop-shape';

/** CoachHelm chs-11: the prescription and verdict loop on a focus area (supercharge 04 example 11, layout 5), synthetic rows. */

const NOW = '2026-10-21T12:00:00Z';
const COACH = { role: 'coach' as const, first: 'Jonah' };
const PLAYER = { role: 'player' as const };
const verdict = (word: string, made: number, n: number, lower: number, upper: number, at = '2026-10-19T06:00:00Z') => ({
  word,
  post: { value: made / n, made, n, window_start: '2026-09-01', window_end: '2026-10-17' },
  lower_bound_90: lower,
  upper_bound_90: upper,
  bound_method: 'normal',
  expected_without_coaching: 0.635,
  threshold: 0.7,
  horizon: { attempts: 40 },
  computed_at: at,
});
const row = (over: Partial<ChFocusLoopRow> = {}): ChFocusLoopRow => ({
  id: 'f1',
  title: 'Mid-range putts',
  from_insight_id: null,
  target_metric: 'putts_made_5_10ft_pct',
  baseline_value: 18 / 31,
  baseline_n: 31,
  criterion: { direction: 'higher', threshold: 0.7, unit: 'pct' },
  horizon: { attempts: 40 },
  verdict: null,
  started_at: '2026-09-01',
  ...over,
});

describe('focusLoopOf', () => {
  it('short of the horizon: Too early, the target, and the live count', () => {
    expect(focusLoopOf(row(), { made: 15, n: 22 }, PLAYER, NOW)).toEqual({
      word: 'Too early',
      tone: 'plain',
      line: null,
      target: '70% or better over 40 putts',
      progress: '22 of 40 putts in · 68% so far',
    });
  });

  it('at the horizon: the verdict word and its line, both numbers and the regression line, in the viewer’s voice', () => {
    const worked = row({ verdict: verdict('worked', 31, 42, 0.651, 0.82) });
    const coach = focusLoopOf(worked, null, COACH, NOW);
    expect(coach).toMatchObject({ word: 'Worked', tone: 'good', progress: null, target: '70% or better over 40 putts' });
    expect(coach?.line).toBe(
      '5–10 ft putts · Worked — 31 of 42 (74%) against 18 of 31 (58%) before. Expected without coaching: about 64% (bounce-back). Lower bound 65% clears it. Target was 70%.',
    );
    expect(focusLoopOf(worked, null, PLAYER, NOW)?.line).toMatch(/^Worked\. 31 of 42 \(74%\), up from 58%\./);
    expect(focusLoopOf(row({ verdict: verdict('did_not_move', 24, 40, 0.501, 0.699) }), null, PLAYER, NOW)).toMatchObject({ word: 'Did not move', tone: 'plain' });
  });

  it('Got worse reaches the coach a day before the player', () => {
    const worse = row({ verdict: verdict('got_worse', 15, 40, 0.27, 0.48, '2026-10-21T06:00:00Z') });
    expect(focusLoopOf(worse, null, COACH, NOW)?.word).toBe('Got worse');
    expect(focusLoopOf(worse, null, PLAYER, NOW)?.word).toBe('Too early');
    expect(focusLoopOf(worse, null, PLAYER, '2026-10-22T07:00:00Z')?.word).toBe('Got worse');
  });

  it('no prescription, no loop: the focus area is drawn as before', () => {
    expect(focusLoopOf(row({ criterion: null, horizon: null }), null, COACH, NOW)).toBeNull();
  });

  it('with no count yet, says none are in; with none read, leaves progress out', () => {
    expect(progressLine({ made: 0, n: 0 }, 40, 'putts')).toBe('0 of 40 putts in');
    expect(progressLine({ made: 30, n: 44 }, 40, 'putts')).toBe('40 of 40 putts in · 68% so far');
    expect(focusLoopOf(row(), null, COACH, NOW)?.progress).toBeNull();
  });
});
