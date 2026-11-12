import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stationFigures, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { barScale, SpotCard, spotScales } from '../SpotCard';

vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false }));

/**
 * The Approach card on staging (owner's preview, 11 Nov 2026): Ethan −4.4, Owen −4.2, Cole −3.6 and Dylan −2.0 all drew the
 * same full bar, because the scale stopped at −1.30 (the fixture's size). The full length is now the card's largest loss.
 */
const proto = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
const leg = (strokes: number | null) => ({ strokes, rounds: 10, missing: null });
const player = (id: string, first: string, approach: number) =>
  ({ ...proto, id, name: `${first} Test`, first, early: false, legs: { tee: leg(0.4), approach: leg(approach), short_game: leg(-0.1), putting: leg(-3.0) } }) as ChTeamPlayer;

describe('the spot card scales its bars to its own figures', () => {
  it('keeps the design floor for small figures, so the fixture board draws as it did', () => {
    expect(spotScales([-1.2, -0.4])).toEqual({ loss: 1.3, gain: 0.25 });
    expect(barScale(-1.3)).toBe(1);
    expect(barScale(-0.65)).toBe(0.5);
  });

  it('grows the full length to the largest loss on the card, team average included', () => {
    expect(spotScales([-4.4, -4.2, -3.6, -2.0, -3.1]).loss).toBe(4.4);
    expect(spotScales([-1.0, 0.6]).gain).toBe(0.6);
  });

  it('draws staging’s Approach players at four different lengths, the worst full', () => {
    const list = [player('e', 'Ethan', -4.4), player('o', 'Owen', -4.2), player('c', 'Cole', -3.6), player('d', 'Dylan', -2.0)];
    const data = { ...PREVIEW_TEAM_BOARD, players: { list, error: false }, stations: stationFigures(list) };
    const { container } = render(<SpotCard data={data} station="approach" onRead={() => {}} onPlayer={() => {}} />);
    const scales = [...container.querySelectorAll<HTMLElement>('.bars .bf')].map((b) => Number(/scaleX\(([\d.]+)\)/.exec(b.style.transform)?.[1]));
    expect(scales).toHaveLength(4);
    expect(new Set(scales.map((s) => s.toFixed(3))).size).toBe(4);
    expect(scales[0]).toBe(1);
    expect(scales[3]).toBeCloseTo(2.0 / 4.4, 3);
  });
});
