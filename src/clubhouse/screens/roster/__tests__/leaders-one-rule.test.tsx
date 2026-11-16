import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChRosterPlayer } from '../../../data/roster';
import { leaderPicks } from '../format';
import { RosterLeaders } from '../RosterLeaders';
import { sortRoster } from '../sort';

// Prod audit 2026-11-15, ROSTER-01 and ROSTER-02: all three leader cards named Cole ("Low average 77.5") while the
// Avg-sorted list put Mason first at 72.0 on two rounds. One player takes one card at most, and the list ranks by the
// cards' floor (three counting rounds), with early reads after every ranked player.

afterEach(cleanup);
const CLOCK = { tz: 'America/New_York', day: '2026-11-15' };
const p = (id: string, avg: number | null, rounds: number, over: Partial<ChRosterPlayer> = {}): ChRosterPlayer =>
  ({
    id,
    name: id,
    status: 'active',
    avg,
    rounds,
    trend: [avg ?? 75, avg ?? 75, avg ?? 75],
    sgPerRound: -1,
    gradYear: 2027,
    availability: null,
    attention: null,
    handicap: null,
    ...over,
  }) as unknown as ChRosterPlayer;

describe('ROSTER-01 a player takes one leader card at most', () => {
  it('names three different players when one player leads all three rules', () => {
    const quiet = { tone: 'warning', text: 'No rounds in 25 days' } as ChRosterPlayer['attention'];
    const cole = p('Cole', 77.5, 6, { trend: [76, 75, 74], sgPerRound: -6, attention: quiet });
    const dylan = p('Dylan', 78.1, 5, { trend: [80, 79, 78], sgPerRound: -5, attention: quiet });
    const will = p('Will', 80.2, 4, { trend: [81, 80, 79], sgPerRound: -7.1, attention: quiet });
    const picks = leaderPicks([cole, dylan, will]);
    expect(picks.map((x) => [x.kind, x.player.id])).toEqual([
      ['low', 'Cole'],
      ['heater', 'Dylan'],
      ['look', 'Will'],
    ]);
  });

  it('never spends a player who needs a look on Best last 3', () => {
    const quiet = { tone: 'warning', text: 'No rounds in 25 days' } as ChRosterPlayer['attention'];
    const picks = leaderPicks([p('Cole', 74, 6), p('Will', 80, 4, { trend: [70, 70, 70], sgPerRound: -7.1, attention: quiet })]);
    expect(picks.map((x) => [x.kind, x.player.id])).toEqual([
      ['low', 'Cole'],
      ['look', 'Will'],
    ]);
  });

  it('labels each card with its window and keeps Needs a look a number with its reason in words', () => {
    const quiet = { tone: 'warning', text: 'No rounds in 25 days' } as ChRosterPlayer['attention'];
    render(<RosterLeaders players={[p('Cole', 74, 6), p('Will', 80, 4, { sgPerRound: -7.1, attention: quiet })]} statsError={false} clock={CLOCK} onOpen={() => {}} />);
    expect(screen.getByText('Lowest average')).toBeTruthy();
    expect(screen.getByText('season')).toBeTruthy();
    expect(screen.getByText('Needs a look')).toBeTruthy();
    expect(screen.getByText('SG a round')).toBeTruthy();
    expect(screen.getByText('No rounds in 25 days')).toBeTruthy();
    expect(screen.queryByText('On a heater')).toBeNull();
  });
});

describe('ROSTER-02 the list ranks by the leader cards’ floor', () => {
  it('puts a player under three rounds after every ranked player, by average and by strokes gained', () => {
    const list = [p('Mason', 72, 2, { sgPerRound: 1.5 }), p('Cole', 77.5, 6, { sgPerRound: -2 }), p('Ann', 76, 4, { sgPerRound: -3 }), p('Nobody', null, 0, { sgPerRound: null })];
    expect(sortRoster(list, 'avg').map((x) => x.id)).toEqual(['Ann', 'Cole', 'Mason', 'Nobody']);
    expect(sortRoster(list, 'sg').map((x) => x.id)).toEqual(['Cole', 'Ann', 'Mason', 'Nobody']);
  });
});
