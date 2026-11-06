import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stationFigures, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { HOLE, stationRadius } from '../hole-geometry';
import { TeamHole } from '../TeamHole';

vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true }));

const legs = (tee: number | null, approach: number | null, short_game: number | null, putting: number | null) => ({
  tee: { strokes: tee, rounds: 3, missing: null },
  approach: { strokes: approach, rounds: 3, missing: null },
  short_game: { strokes: short_game, rounds: 3, missing: null },
  putting: { strokes: putting, rounds: 3, missing: null },
});
const proto = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
const cole = { ...proto, id: 'cole', name: 'Cole Bennett', first: 'Cole', rounds: 3, early: true, worst: 'putting', legs: legs(2.5, 1.9, 0, -3.9) } as ChTeamPlayer;

function hole() {
  return render(<TeamHole stations={stationFigures([cole])} players={[cole]} station="putting" onStation={() => {}} orientation="v" />).container;
}

describe("the hole on staging's real figures", () => {
  it('keeps every halo inside the drawing (TEAM-1)', () => {
    expect(stationRadius(-3.9)).toBeLessThanOrEqual(28);
    for (const [s, t] of Object.entries(HOLE.v.st)) {
      const r = stationRadius(s === 'putting' ? -3.9 : 2.5);
      expect(t.x + r).toBeLessThanOrEqual(HOLE.v.w);
      expect(t.y + r).toBeLessThanOrEqual(HOLE.v.h);
      expect(t.y - r).toBeGreaterThanOrEqual(0);
    }
    for (const c of hole().querySelectorAll('.halo')) expect(Number(c.getAttribute('r'))).toBeLessThanOrEqual(28);
  });
  it('colours a gain green, zero as neither, a loss as a loss (TEAM-8)', () => {
    const c = hole();
    expect(c.querySelector('[data-ch-team-station="tee"]')!.getAttribute('class')).toContain('is-gain');
    expect(c.querySelector('[data-ch-team-station="short_game"]')!.getAttribute('class')).toContain('is-even');
    expect(c.querySelector('[data-ch-team-station="putting"]')!.getAttribute('class')).not.toMatch(/is-gain|is-even/);
  });
  it('gives every station a 44 target whatever its halo (TEAM-12)', () => {
    for (const h of hole().querySelectorAll('.stn .hit')) expect(Number(h.getAttribute('r'))).toBeGreaterThanOrEqual(22);
  });
  it('keeps every label inside the drawing, on one name for the spot (TEAM-3, TEAM-31)', () => {
    const c = hole();
    for (const t of c.querySelectorAll<SVGTextElement>('.sl')) {
      const x = Number(t.getAttribute('x'));
      const w = (t.textContent ?? '').length * 13 * 0.56;
      const anchor = t.getAttribute('text-anchor');
      expect(anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x).toBeGreaterThanOrEqual(0);
      expect(anchor === 'end' ? x : anchor === 'middle' ? x + w / 2 : x + w).toBeLessThanOrEqual(HOLE.v.w);
    }
    expect(screen.queryByText('Around the green')).toBeNull();
    expect(screen.getByText('Short game')).toBeTruthy();
  });
  it('sizes its words inline in viewBox units, not type tokens (TEAM-6)', () => {
    for (const t of hole().querySelectorAll<SVGTextElement>('.sl, .sv')) expect(t.style.fontSize).toMatch(/px$/);
  });
  it('draws no motion on first paint (TEAM-33)', () => {
    const c = hole();
    expect(c.querySelector<SVGElement>('.stn')!.style.opacity).toBe('');
  });
});
