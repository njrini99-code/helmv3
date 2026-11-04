import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChRosterPlayer } from '../../../data/roster';
import { classMix, lastFive, leaderPicks, teamCardFigures, yearKeyOf } from '../format';
import { RosterLeaders } from '../RosterLeaders';
import { RosterTeamCard } from '../RosterTeamCard';

/** The Roster lane behind clubhouse_classes_roster_home_v1 (classes-roster-home 08 PR 8, CP and W-CRH-17). */

afterEach(cleanup);

const CLOCK = { tz: 'America/New_York', day: '2026-11-03' };
const player = (id: string, over: Partial<ChRosterPlayer> = {}): ChRosterPlayer =>
  ({ id, name: `Player ${id}`, firstName: id, status: 'active', availability: 'available', rounds: 5, avg: 75, trend: [76, 75, 74], sgPerRound: 0, gradYear: 2028, attention: null, ...over }) as ChRosterPlayer;

const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id, i) => player(id, { avg: 72 + i }));

describe('teamCardFigures', () => {
  it('counts an injured player as active', () => {
    const f = teamCardFigures([player('a'), player('b', { availability: 'injured' }), player('c', { status: 'inactive' })]);
    expect(f).toMatchObject({ total: 3, active: 2, injured: 1 });
  });
  it('holds the top five until five have three counting rounds', () => {
    expect(teamCardFigures(FIVE).topFive?.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(teamCardFigures(FIVE).topFiveMean).toBe(74);
    expect(teamCardFigures([...FIVE.slice(0, 4), player('e', { rounds: 2 })]).topFive).toBeNull();
    expect(teamCardFigures(FIVE, true).topFive).toBeNull();
  });
});

describe('leaderPicks', () => {
  it('needs three counting rounds, and hides Needs a look with nobody noted', () => {
    expect(leaderPicks([player('a', { rounds: 2 })])).toEqual([]);
    expect(leaderPicks(FIVE).map((l) => l.kind)).toEqual(['low', 'heater']);
    const noted = player('z', { attention: { tone: 'warning' } as ChRosterPlayer['attention'], sgPerRound: -1.2 });
    expect(leaderPicks([...FIVE, noted]).map((l) => l.kind)).toEqual(['low', 'heater', 'look']);
    expect(leaderPicks(FIVE, true)).toEqual([]);
  });
});

describe('years on the team card', () => {
  it('mix counts each known year, in order, and skips an unknown one', () => {
    const mix = classMix([{ gradYear: 2027 }, { gradYear: 2028 }, { gradYear: 2028 }, { gradYear: null }, { gradYear: 2040 }], CLOCK);
    expect(mix.map((m) => [m.key, m.count])).toEqual([['sr', 1], ['jr', 2], ['so', 0], ['fr', 0]]);
    expect(mix[1]?.label).toBe('Juniors');
  });
  it('a past year keeps the neutral coin', () => {
    expect(yearKeyOf(2026, CLOCK)).toBeNull();
  });
  it('the bars draw five rounds', () => {
    expect(lastFive([1, 2, 3, 4, 5, 6])).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('RosterTeamCard', () => {
  it('a coach sees injured, waiting and the top five', () => {
    render(<RosterTeamCard viewer="coach" season="2026–27" players={[...FIVE, player('f', { availability: 'injured' })]} waiting={2} statsError={false} clock={CLOCK} />);
    expect(screen.getByText('6 active · 1 injured · 2 waiting')).toBeTruthy();
    expect(screen.getByText('Top five')).toBeTruthy();
  });
  it('a player’s card has no injured, waiting or top five, in the DOM', () => {
    const { container } = render(<RosterTeamCard viewer="player" season="2026–27" players={[{ gradYear: 2027 }, { gradYear: 2028 }]} clock={CLOCK} />);
    expect(container.textContent).toContain('2 active');
    for (const held of ['injured', 'waiting', 'Top five']) expect(container.textContent).not.toContain(held);
  });
  it('is one flat title with no card-specific season guess', () => {
    render(<RosterTeamCard viewer="player" season={null} players={[]} clock={CLOCK} />);
    expect(screen.getByRole('group').textContent).toContain('—');
  });
});

describe('RosterLeaders', () => {
  it('opens the tapped player, cards carry the flat press, and nothing draws with nobody to show', () => {
    const onOpen = vi.fn();
    const { container, rerender } = render(<RosterLeaders players={FIVE} statsError={false} clock={CLOCK} onOpen={onOpen} />);
    const cards = within(container).getAllByRole('button');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute('data-ch-press-scale')).toBe('.97');
    cards[0]?.click();
    expect(onOpen).toHaveBeenCalledWith('a');
    rerender(<RosterLeaders players={[]} statsError={false} clock={CLOCK} onOpen={onOpen} />);
    expect(container.firstChild).toBeNull();
  });
});
