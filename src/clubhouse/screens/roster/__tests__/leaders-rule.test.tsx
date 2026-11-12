import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChRosterPlayer } from '../../../data/roster';
import { RosterLeaders } from '../RosterLeaders';

// W24 (preview walk, 11 Nov): "Low average 77.5, Cole Bennett" while cards below showed 72.0: the leaders count only
// active players with three counting rounds and did not say so. The row now says its rule once.

afterEach(cleanup);
const CLOCK = { tz: 'America/New_York', day: '2026-11-03' };
const p = (id: string, avg: number, rounds: number): ChRosterPlayer =>
  ({ id, name: id, status: 'active', avg, rounds, trend: [72, 73, 74], sg: -0.5, gradYear: 2027, availability: null, warning: null, loss: null, hcp: null }) as unknown as ChRosterPlayer;

describe('W24 the leaders say their rule', () => {
  it('shows "3+ counting rounds" under the cards', () => {
    render(<RosterLeaders players={[p('Cole', 77.5, 4), p('Mason', 72, 2)]} statsError={false} clock={CLOCK} onOpen={() => {}} />);
    expect(screen.getByText('Leaders count active players with 3+ counting rounds.')).toBeTruthy();
  });

  it('draws nothing, rule included, when nobody qualifies', () => {
    const { container } = render(<RosterLeaders players={[p('Mason', 72, 2)]} statsError={false} clock={CLOCK} onOpen={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
