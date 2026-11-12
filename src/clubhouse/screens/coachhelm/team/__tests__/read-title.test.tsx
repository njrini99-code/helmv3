import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ChInsight } from '../../../../data/coachhelm-shape';
import type { ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { ReadRow, readTitle } from '../parts';

/**
 * The board's read rows said "Dylan: " before every title, beside Dylan's own coin, and reads stored by the old generator carry the
 * name in the title as well, so a row could read "Dylan: Dylan: 50–125 yd approach: …" (W12's prefix, staging 11 Nov). The coin
 * names the player on screen; a screen reader, which the coin is hidden from, still hears the name once.
 */

afterEach(cleanup);

const PLAYER = { ...(PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer), first: 'Dylan', name: 'Dylan Park' };
const read = (title: string) => ({ ...(PLAYER.reads.needs[0] as ChInsight), id: 'r1', title }) as ChInsight;
/** What the row shows on screen: its title line without the words kept for a screen reader. */
const shown = (b: HTMLElement) => [...b.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('ch-sr-only'))).map((n) => n.textContent).join('');

describe('readTitle', () => {
  it('drops a leading "First: " or "First Last: ", and nothing else', () => {
    expect(readTitle(PLAYER, 'Dylan: 50–125 yd approaches find 67% of greens')).toBe('50–125 yd approaches find 67% of greens');
    expect(readTitle(PLAYER, 'Dylan Park: Three-putts from 30 ft')).toBe('Three-putts from 30 ft');
    expect(readTitle(PLAYER, 'Lag putts finish 6 ft short when Dylan: leaves them')).toBe('Lag putts finish 6 ft short when Dylan: leaves them');
    expect(readTitle(PLAYER, 'Eli: Long approaches finish short-right')).toBe('Eli: Long approaches finish short-right');
    expect(readTitle(PLAYER, 'Dylan: ')).toBe('Dylan: ');
  });
});

describe('a read row beside its player’s coin', () => {
  it.each([
    ['a plain title', 'Long approaches finish short-right'],
    ['a stored title that starts with the name', 'Dylan: Long approaches finish short-right'],
  ])('%s shows the title alone, and says the name once to a screen reader', (_, title) => {
    render(<ReadRow player={PLAYER} read={read(title)} onOpen={() => {}} />);
    const b = screen.getByRole('button').querySelector('b') as HTMLElement;
    expect(shown(b)).toBe('Long approaches finish short-right');
    expect(b.textContent).toBe('Dylan: Long approaches finish short-right');
    expect(screen.getByRole('button').textContent).not.toMatch(/Dylan: Dylan/);
  });
});
