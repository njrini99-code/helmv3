import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { classUnset, type RosterClock } from '../format';
import { RosterTeamCard } from '../RosterTeamCard';

// W23 (preview walk, 11 Nov): "8 active", but the class split added to 6. Players with no class year are now counted as
// "not set" in the bar and the legend, so the split always adds up to the roster.

afterEach(cleanup);
const CLOCK: RosterClock = { tz: 'America/New_York', day: '2026-10-14' };

describe('W23 the class split adds up to the roster', () => {
  it('classUnset counts a missing and a far year', () => {
    expect(classUnset([{ gradYear: 2027 }, { gradYear: null }, { gradYear: 2040 }], CLOCK)).toBe(2);
  });

  it('the card shows "2 not set" and a segment for them; the label adds up', () => {
    const players = [{ gradYear: 2027 }, { gradYear: 2027 }, { gradYear: 2028 }, { gradYear: 2029 }, { gradYear: 2028 }, { gradYear: 2027 }, { gradYear: null }, { gradYear: null }];
    const { container } = render(<RosterTeamCard viewer="player" season="2026–27" players={players} clock={CLOCK} />);
    expect(container.querySelector('.ch-rs-mix__lg [data-year="none"]')?.textContent).toMatch(/^2\s*not set$/);
    expect(container.querySelector('.ch-rs-mix [data-year="none"]')).not.toBeNull();
    const label = container.querySelector('.ch-rs-mix')!.getAttribute('aria-label')!;
    const sum = [...label.matchAll(/(\d+) /g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(sum).toBe(players.length);
  });

  it('a roster where every year is set draws no "not set"', () => {
    const { container } = render(<RosterTeamCard viewer="player" season="2026–27" players={[{ gradYear: 2027 }, { gradYear: 2028 }]} clock={CLOCK} />);
    expect(container.querySelector('[data-year="none"]')).toBeNull();
  });
});
