// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arcValueText, CourseArc } from '../CourseArc';
import { HowItPlays } from '../HowItPlays';
import { toCourseHistory, type ChCourseListRow } from '../../../data/course-page-shape';
import type { ChPlayHole } from '../../../data/stats-extra';

afterEach(cleanup);

const mean = Array.from({ length: 18 }, (_, i) => (i + 1) * 0.1);

describe('the average arc (P-7 4.2.6)', () => {
  it('is a slider synced with the map, says the average and, with it on, the best', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<CourseArc arc={{ mean, sd: null, rounds: 3 }} lines={{ best: { cum: mean.map(() => 0), score: 70 }, last: null }} selected={14} onSelect={onSelect} />);
    const s = getByRole('slider', { name: 'Average running score to par' });
    expect(s.getAttribute('aria-valuetext')).toBe('Hole 14, average plus 1.4 through 14');
    fireEvent.click(getByRole('button', { name: 'Best · 70' }));
    expect(getByRole('button', { name: 'Best · 70' }).getAttribute('aria-pressed')).toBe('true');
    expect(s.getAttribute('aria-valuetext')).toBe('Hole 14, average plus 1.4 through 14, best here level through 14');
    fireEvent.keyDown(s, { key: 'PageDown' });
    expect(onSelect).toHaveBeenCalledWith(11);
    expect(arcValueText(3, -0.32, null)).toBe('Hole 3, average minus 0.3 through 3');
  });

  it('draws the spread only from five rounds and says so', () => {
    const { container, rerender } = render(<CourseArc arc={{ mean, sd: null, rounds: 3 }} lines={{ best: null, last: null }} selected={1} onSelect={() => {}} />);
    expect(container.querySelector('.ch-carc__band')).toBeNull();
    expect(container.textContent).toContain('Average of 3 rounds · spread shows from 5 rounds');
    rerender(<CourseArc arc={{ mean, sd: mean.map(() => 1), rounds: 5 }} lines={{ best: null, last: null }} selected={1} onSelect={() => {}} />);
    expect(container.querySelector('.ch-carc__band')).not.toBeNull();
    expect(container.querySelector('[role="group"]')).toBeNull();
  });
});

describe('how it plays (P-7 4.2.5)', () => {
  let seq = 0;
  const row = (total: number, over: Partial<ChCourseListRow> = {}): ChCourseListRow => ({
    id: `r${seq++}`, course_id: null, course_name: 'Finley', course_city: null, course_state: null, tee_id: null, tees_played: null, round_date: `2026-09-${String(10 + seq).padStart(2, '0')}`,
    round_type: 'practice', holes_played: 18, total_score: total, score_to_par: total - 72, front_nine: 36, back_nine: total - 36, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, notes: null, ...over,
  });
  const card = (extra: number): ChPlayHole[] => Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, score: 4 + (i >= 12 && i < 12 + extra ? 1 : 0), putts: null, gir: null, fairway: null }));

  it('says the course plays harder past its noise, with the rows past their floors', () => {
    const here = [row(76), row(76), row(77), row(76)];
    const away = [row(72, { course_name: 'Marsh' }), row(71, { course_name: 'Marsh' }), row(72, { course_name: 'Marsh' }), row(72, { course_name: 'Marsh' })];
    const holes = new Map(here.map((r) => [r.id, card(r.total_score! - 72)] as const));
    const res = toCourseHistory({ rawKey: 'n-finley', list: [...here, ...away], holes, library: null, coachNote: null, window: 'all', seasonStart: '2026-08-01', who: null });
    const h = res.kind === 'ok' ? res.data.howItPlays : null!;
    expect(h.sentence).toBe('Finley plays 4.5 shots harder for you than your other courses.');
    expect(h.sample).toBe('+4.3 here · −0.3 elsewhere · 4 rounds here, 4 elsewhere');
    expect(h.rows.map((r) => r.label)).toEqual(['Front nine', 'Back nine', 'Par 4s', 'Most to gain']);
    expect(h.rows.find((r) => r.label === 'Most to gain')).toMatchObject({ value: 'Holes 13 to 15 · +3.0 a round', hole: 13 });
  });

  it('a stretch row picks its hole; the coach reads the player', () => {
    const onHole = vi.fn();
    const { getByRole } = render(<HowItPlays who="Lena" onHole={onHole} data={{ sentence: 'Needs 3 rounds here to compare.', sample: null, rows: [{ label: 'Most to gain', value: 'Holes 13 to 15 · +2.1 a round', hole: 13 }] }} />);
    expect(getByRole('heading', { name: 'How it plays for Lena' })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: /Most to gain/ }));
    expect(onHole).toHaveBeenCalledWith(13);
  });
});
