import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChRosterPlayer } from '../../../data/roster';
import { RosterLeaders } from '../RosterLeaders';
import { accessibleName, expectLabelInName } from '../../../__tests__/label-in-name';

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

describe('MAC-09 a leader card is named by what it shows (Voice Control)', () => {
  it('no aria-label: the name opens with the card’s label, then its figure, then the player, and ends "Open profile"', () => {
    const { container } = render(<RosterLeaders players={[p('Cole Bennett', 77.5, 4)]} statsError={false} clock={CLOCK} onOpen={() => {}} />);
    const cards = [...container.querySelectorAll('button.ch-rs-ldr')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.hasAttribute('aria-label')).toBe(false);
      const label = card.querySelector('.ch-rs-ldr__k')!.textContent!;
      expectLabelInName(card, label);
      expect(accessibleName(card)).toMatch(/Cole Bennett\. Open profile$/);
    }
  });
});
