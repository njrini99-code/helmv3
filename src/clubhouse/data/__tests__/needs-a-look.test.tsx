import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { attentionFor, type ChRosterPlayer } from '../roster';
import { RosterLeaders } from '../../screens/roster/RosterLeaders';

/**
 * Coach audit 13 Nov 2026 (§8 #4–6):
 * - "Needs a look · −7.1 SG/rd · Will Gruse" showed a number that was not why he was there ("Scoring up 4.0").
 * - "Scoring up 6.0" read as good news; his scores had gone up, which is worse.
 * - Home said Samanyu "hasn't posted in 51 days" while Roster said "Steady": Roster's quiet rule was off while the team
 *   wasn't posting. Roster now flags a quiet player as Home does.
 */
const NY = 'America/New_York';
const summary = (over: Record<string, unknown> = {}) =>
  ({ rounds: 10, avg: 74, sgPerRound: null, trend: [], status: 'steady', formChange: null, recent: [], lastRoundDate: null, ...over }) as unknown as Parameters<typeof attentionFor>[0];

afterEach(cleanup);

describe('the reason', () => {
  it('a slipping player reads "Scoring 4.0 worse", never "Scoring up"', () => {
    expect(attentionFor(summary({ status: 'slipping', formChange: 4 }), new Date('2026-10-14T16:00:00Z'), 'available', NY)).toEqual({ tone: 'loss', text: 'Scoring 4.0 worse' });
  });

  it('a player quiet for 51 days is flagged, as Home flags him, whether or not the team is posting', () => {
    const now = new Date('2026-11-13T16:00:00Z');
    expect(attentionFor(summary({ lastRoundDate: '2026-09-23' }), now, 'available', NY)).toEqual({ tone: 'warning', text: 'No rounds in 51 days' });
  });
});

describe('the Needs a look card', () => {
  const player = (over: Partial<ChRosterPlayer>): ChRosterPlayer =>
    ({ id: 'p', name: 'Will Gruse', status: 'active', rounds: 30, avg: 75.5, sgPerRound: -7.1, trend: [74, 76, 79], gradYear: 2027, attention: null, ...over }) as ChRosterPlayer;

  // Prod audit 2026-11-15, ROSTER-08: the reason set as the 24px amber figure read as a number and was cut at the card's edge.
  // The figure is strokes gained a round with its window; the reason is words under the name.
  it('shows strokes gained as the figure, with its window, and the reason in words', () => {
    const players = [player({ id: 'will', attention: { tone: 'loss', text: 'Scoring 4.0 worse' } }), player({ id: 'luke', name: 'Luke Wise', avg: 74, sgPerRound: -7.5 })];
    const { container } = render(<RosterLeaders players={players} statsError={false} clock={{ now: '2026-11-13T16:00:00Z', timeZone: NY } as never} onOpen={() => {}} />);
    const card = [...container.querySelectorAll('.ch-rs-ldr')].find((c) => c.textContent?.includes('Needs a look'))!;
    expect(card.querySelector('.ch-rs-ldr__v')?.textContent).toBe('−7.1 SG a round'); // the sr-only space keeps the figure and its unit apart for a screen reader
    expect(card.querySelector('.ch-rs-ldr__why')?.textContent).toBe('Scoring 4.0 worse');
  });
});
