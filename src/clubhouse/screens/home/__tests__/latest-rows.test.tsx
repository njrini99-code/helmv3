import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChLatestRound } from '../../../data/home';
import { teesLabel } from '../../../data/home';
import { DeskRounds } from '../HomeDeskCrh';
import { latestRows } from '../model';

afterEach(cleanup);

const round = (id: string, playerId: string, score: number, toPar: number | null, date: string, course: string | null = 'Springfield CC'): ChLatestRound => ({
  id,
  playerId,
  playerName: playerId === 'cole' ? 'Cole Bennett' : 'Mason Diaz',
  meta: [course, date].filter(Boolean).join(' · '),
  date,
  course,
  day: date === '2026-10-21' ? 'Wed 21 Oct' : date === '2026-10-20' ? 'Tue 20 Oct' : 'Sat 3 Oct',
  score,
  toPar,
  holes: null,
  gir: null,
  putts: null,
  sg: null,
});

describe('desk Latest rounds (W4: one event, one row)', () => {
  it('folds one player’s rounds of one event into a row over the total, oldest first', () => {
    // The owner's preview: three rows of Cole Bennett, Springfield CC, Wed 21 Oct, that read the same.
    const rows = latestRows([round('r3', 'cole', 73, 1, '2026-10-21'), round('r2', 'cole', 77, 5, '2026-10-21'), round('r1', 'cole', 74, 2, '2026-10-20')], 4);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ meta: 'Springfield CC · Tue 20 Oct–Wed 21 Oct · Rounds 74, 77, 73', score: 224, toPar: 8, scores: [74, 77, 73] });
  });

  it('keeps other players, other courses and a round weeks apart as their own rows', () => {
    const rows = latestRows(
      [
        round('a', 'cole', 73, 1, '2026-10-21'),
        round('b', 'mason', 72, 0, '2026-10-21'),
        round('c', 'cole', 75, 3, '2026-10-21', 'Pine Hollow'),
        round('d', 'cole', 76, 4, '2026-10-03'),
        round('e', 'mason', 74, 2, '2026-10-20'),
      ],
      4,
    );
    expect(rows.map((r) => r.key)).toEqual(['a', 'b+e', 'c', 'd']);
    expect(rows[1]).toMatchObject({ score: 146, toPar: 2 });
  });

  it('a folded row with an unknown to-par has no total to-par', () => {
    const [row] = latestRows([round('x', 'cole', 73, null, '2026-10-21'), round('y', 'cole', 74, 2, '2026-10-21')], 4);
    expect(row).toMatchObject({ score: 147, toPar: null });
  });

  it('draws the folded row with its rounds and no unlabelled form line', () => {
    const { container } = render(<DeskRounds rounds={[round('r2', 'cole', 77, 5, '2026-10-21'), round('r1', 'cole', 74, 2, '2026-10-21')]} />);
    expect(container.querySelectorAll('.ch-dh-rows--rounds > li')).toHaveLength(1);
    expect(container.textContent).toContain('Rounds 74, 77');
    expect(container.querySelector('.ch-dh-score b')?.textContent).toBe('151');
    expect(container.querySelector('.ch-dh-spark')).toBeNull();
  });
});

describe('tee names (W4)', () => {
  it('does not say tees twice', () => {
    expect(teesLabel('Jeff Roope Invite Tees')).toBe('Jeff Roope Invite Tees');
    expect(teesLabel('Blue')).toBe('Blue tees');
    expect(teesLabel('  ')).toBeNull();
    expect(teesLabel(null)).toBeNull();
  });
});
