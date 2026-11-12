import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stationFigures, type ChTeamPlayer, type ChTeamStory } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { HOLE, stationRadius } from '../hole-geometry';
import { SpotCard } from '../SpotCard';
import { StoryDeskPanel } from '../Stories';
import { TeamBoardSkeleton } from '../TeamBoardSkeleton';
import { TeamHole } from '../TeamHole';
import { Segmented } from '../../../../ui/Segmented';

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

describe("the hole on staging’s real figures", () => {
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

describe('the Team lane, what the fixtures hid', () => {
  const noFigure = { ...cole, id: 'mia', name: 'Mia Thornton', first: 'Mia', legs: legs(null, null, null, null) } as ChTeamPlayer;
  const data = { ...PREVIEW_TEAM_BOARD, players: { list: [cole, noFigure], error: false }, stations: stationFigures([cole, noFigure]) };

  it('draws a bar only for a player with a figure there (FID-TEAM-16)', () => {
    const { container } = render(<SpotCard data={data} station="putting" onRead={() => {}} onPlayer={() => {}} />);
    expect(container.querySelectorAll('.bars > *')).toHaveLength(1);
    expect(screen.queryByText('Mia Thornton')).toBeNull();
  });

  it('says what no bars means and drops the legend with them', () => {
    const { container } = render(<SpotCard data={{ ...data, players: { list: [noFigure], error: false }, stations: stationFigures([noFigure]) }} station="putting" onRead={() => {}} onPlayer={() => {}} />);
    expect(screen.getByText('No player has enough rounds here yet.')).toBeTruthy();
    expect(container.querySelector('.axis')).toBeNull();
  });

  it('a failed pattern offers Try again, and the legend draws the mark it names (FID-TEAM-16, QA-9)', () => {
    const retry = vi.fn();
    const { container } = render(<SpotCard data={{ ...data, patternsStatus: 'failed' }} station="putting" onRead={() => {}} onPlayer={() => {}} onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(container.querySelector('.axis__team i')).not.toBeNull();
  });

  it('the desk story leads with the coin (FID-TEAM-12)', () => {
    const story = { kind: 'theme', id: 't', playerId: 'cole', who: 'Cole Bennett', line: 'Putting is slipping', body: null } as unknown as ChTeamStory;
    const { container } = render(<StoryDeskPanel story={story} week="This week" player={cole} onClose={() => {}} onAction={() => {}} />);
    expect(container.querySelector('.insh')!.firstElementChild!.textContent).toBe(cole.name.split(' ').map((w) => w[0]).join(''));
  });

  it('the switch comes in the 41 tall size without forking the control (FID-TEAM-9)', () => {
    const { container } = render(<Segmented label="View" size="lg" value="a" onChange={() => {}} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    expect(container.querySelector('.ch-seg--lg')).not.toBeNull();
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/controls.css'), 'utf8');
    expect(css).toMatch(/\.ch-seg--lg \.ch-seg__b \{[^}]*height: calc\(35 \* var\(--ch-type-k\)\)/);
  });

  it('the loading frame keeps the page head in place and the loaded heights (TEAM-28)', () => {
    const { container } = render(<TeamBoardSkeleton />);
    expect(container.querySelector('.sheet > .ch-chd.is-phone .ch-chd__sw')).not.toBeNull();
    expect(container.querySelector<HTMLElement>('.sheet > .ch-htb-feat')!.style.minHeight).toBe('406px');
  });
});

describe('sheet and notice styles reach only their own text (owner, 2026-11-06)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');

  it.each(['.ch-htb .insh span', '.ch-htb .notice span', '.ch-htb .drill span {'])('no loose %s, which would restyle an avatar or a button inside it', (rule) => {
    expect(css).not.toContain(rule);
  });

  it('the sheet holds one page edge, its body adding none (TEAM-17)', () => {
    expect(css).toMatch(/\.ch-htb-sheet \.ch-modal__body \{\s*padding: 0;/);
    expect(css).toMatch(/\.ch-htb \.ins \{[^}]*padding:8px var\(--ch-page-x-phone, 16px\)/);
  });

  it('every bar row is one set of columns on a phone, so the Tour line runs straight (MOB-TEAM-4)', () => {
    expect(css).toMatch(/\.ch-htb \.br \{\s*min-height:44px;\s*grid-template-columns:calc\(108 \* var\(--ch-type-k, 1\)\) minmax\(0,1fr\) calc\(52 \* var\(--ch-type-k, 1\)\);/);
  });

  it('the spots go two by two rather than collide, and the sheet buttons stack (320 wide, or largest Text Size)', () => {
    // Five across in one row (the design); the basis jumps to half when five can't clear each other, and Course, alone on its line, takes the row.
    expect(css).toMatch(/--ch-htb-chip:clamp\(calc\(20% - 2px\), calc\(\(300 \* var\(--ch-type-k\) - 100%\) \* 999\), calc\(50% - 1px\)\);/);
    expect(css).toMatch(/\.ch-htb \.stchips button \{\s*flex:1 1 var\(--ch-htb-chip\);\s*min-width:0;\s*min-height:44px;/);
    expect(css).not.toMatch(/\.stchips button\.cm \{[^}]*grid-column/);
    expect(css).toMatch(/\.acts > \* \{\s*flex: 1 1 calc\(160 \* var\(--ch-type-k\)\);/);
  });
});
