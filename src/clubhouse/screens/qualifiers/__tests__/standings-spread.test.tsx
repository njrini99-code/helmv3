// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { previewDetail } from '../../../preview/fixtures-qualifiers';
import { StandingsSpread } from '../StandingsSpread';

afterEach(cleanup);

describe('StandingsSpread: the field on one number line', () => {
  const player = previewDetail(0, 'player');
  const board = player.board!;

  it('rings the viewer’s own coin, and only theirs', () => {
    render(<StandingsSpread rows={board.rows} topScore={board.topScore} viewerId={player.viewerPlayerId} />);
    const mine = document.querySelectorAll('.ch-qf-sp__plot li.is-me');
    expect(mine).toHaveLength(1);
    const me = board.rows.find((r) => r.playerId === player.viewerPlayerId)!;
    expect(mine[0]!.textContent).toBe(
      me.name
        .split(' ')
        .map((w) => w[0])
        .join(''),
    );
    // The coin keeps its state: the ring is added to it, never in place of it.
    expect(mine[0]!.className).toMatch(/\bis-(score|pick|bubble|out)\b/);
  });

  it('rings no coin for a coach, who has no row of their own', () => {
    const coach = previewDetail(0, 'coach');
    render(<StandingsSpread rows={coach.board!.rows} topScore={coach.board!.topScore} viewerId={coach.viewerPlayerId} />);
    expect(document.querySelectorAll('.ch-qf-sp__plot li').length).toBeGreaterThan(2);
    expect(document.querySelector('.ch-qf-sp__plot li.is-me')).toBeNull();
    cleanup();
    render(<StandingsSpread rows={coach.board!.rows} topScore={coach.board!.topScore} />);
    expect(document.querySelector('.ch-qf-sp__plot li.is-me')).toBeNull();
  });

  it('runs the even-par rule past the coins’ row, so a coin on it is crossed and not pointed at', () => {
    render(<StandingsSpread rows={board.rows} topScore={board.topScore} viewerId={player.viewerPlayerId} />);
    const even = document.querySelector('.ch-qf-sp__even') as HTMLElement;
    const cut = document.querySelector('.ch-qf-sp__cut') as HTMLElement;
    expect(parseFloat(even.style.top)).toBeLessThan(0);
    // It still ends where the cut does, on the axis.
    expect(parseFloat(even.style.top) + parseFloat(even.style.height)).toBe(parseFloat(cut.style.height));
  });
});
