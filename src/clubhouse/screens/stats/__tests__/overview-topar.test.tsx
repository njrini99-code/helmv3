// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OverviewZones } from '../OverviewZones';
import { summarizeWindow } from '../../../data/stats-weight';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import type { ChPlayerProfile } from '../../../data/stats-player';
import type { ChRound } from '../../../data/season';

afterEach(cleanup);

const round = (id: string, total: number, toPar: number | null, holes: number) =>
  ({ id, player_id: 'p', round_date: '2026-10-01', total_score: total, score_to_par: toPar, holes_played: holes }) as ChRound;

/** A6: the Overview's to par a round is the window's weighted value, not a plain mean of per-18 values with a missing par as 0. */
describe('the Overview’s to par a round', () => {
  it('weights a nine-hole round as half a round', () => {
    // An 18-hole +4 and a 9-hole +1: 5 strokes over 1.5 rounds is +3.3 a round (a plain mean of per-18 values says +3.0).
    expect(summarizeWindow([round('a', 76, 4, 18), round('b', 37, 1, 9)]).toPar).toBeCloseTo(3.333, 3);
  });

  it('prints win.toPar, and a round with no par does not pull it toward 0', () => {
    const rounds = [
      { ...PREVIEW_PLAYER.rounds[0], id: 'a', toPar: 4, holes: 18 },
      { ...PREVIEW_PLAYER.rounds[0], id: 'b', toPar: null, holes: 18 },
    ] as ChPlayerProfile['rounds'];
    const data = { ...PREVIEW_PLAYER, rounds, win: { ...PREVIEW_PLAYER.win, toPar: 4 } } as ChPlayerProfile;
    const text = render(<OverviewZones data={data} coach={false} ribbon={null} />).container.textContent ?? '';
    expect(text).toContain('+4.0 to par a round');
    expect(text).not.toContain('+2.0 to par a round');
  });

  it('shows no to par line when the window has none', () => {
    const data = { ...PREVIEW_PLAYER, win: { ...PREVIEW_PLAYER.win, toPar: null } } as ChPlayerProfile;
    expect(render(<OverviewZones data={data} coach={false} ribbon={null} />).container.textContent).not.toContain('to par a round');
  });
});
