import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NextEventCard } from '../shell/NextEventCard';
import type { ChNextEvent } from '../data/shell';

/** Wave 7, item 8: the sidebar's next event tells a player when their own reply is still owed (data/shell.ts `mine`). */
const base: ChNextEvent = { id: 'e1', title: 'Round review', whenLabel: 'Tomorrow', metaLabel: 'Sat, Oct 17 · 1:00 PM · Team room', ready: { accepted: 0, invited: 6 } };

describe('NextEventCard · the player’s own reply', () => {
  it('Reply needed, in the warning tone, only when the player still owes one', () => {
    const view = render(<NextEventCard event={{ ...base, mine: 'needed' }} />);
    expect(screen.getByText('Reply needed').classList.contains('ch-badge--warning')).toBe(true);
    view.unmount();
    for (const mine of ['going', null, undefined] as const) {
      const again = render(<NextEventCard event={{ ...base, mine }} />);
      expect(screen.queryByText('Reply needed')).toBeNull();
      again.unmount();
    }
  });
});
