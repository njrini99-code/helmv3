import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));

import { PREVIEW_HOME } from '../../../preview/fixtures';
import { CoachHome } from '../CoachHome';
import type { ChCoachHome } from '../../../data/home';

afterEach(cleanup);

/**
 * Dashboard cuts, 2: one home per number, so no leaderboard on Home. Since lay-01 (owner, 15 Nov 2026: "I want the coach home
 * page matching the players") the desktop is Player Home's layout: the week beside the latest round, Up next leading it.
 */
describe('coach Home desktop, the cuts', () => {
  const NOW = '2026-11-07T15:00:00.000Z';
  const data = (over: Partial<ChCoachHome['phone']> = {}) => ({ ...PREVIEW_HOME, phone: { ...PREVIEW_HOME.phone, ...over } }) as ChCoachHome;

  it('draws no leaderboard: it lives on Roster and Stats', () => {
    const { container } = render(<CoachHome data={data()} now={NOW} />);
    expect(container.querySelector('.ch-dh-rows--board')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).toBeNull();
  });

  it('lays out as Player Home: the week, then Up next over the latest round, then Team scoring and the team’s game', () => {
    const next = PREVIEW_HOME.phone.next ?? PREVIEW_HOME.phone.today[0]!;
    const { container } = render(<CoachHome data={data({ next })} now={NOW} />);
    const main = container.querySelector('main')!;
    expect(main.hasAttribute('data-canopy')).toBe(true);
    expect(main.hasAttribute('data-ch-crh')).toBe(false);
    const heads = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(heads.indexOf('This week')).toBeLessThan(heads.indexOf('Latest round'));
    expect(heads.indexOf('Latest round')).toBeLessThan(heads.indexOf('Team scoring'));
    expect(heads.indexOf('Team scoring')).toBeLessThan(heads.indexOf('The team’s game'));
    // Up next is the player's desk card, leading the column the latest round's card is in (premium plan §3.1).
    const col = container.querySelector('.ch-h-dash__col:has(#ch-round-title)')!;
    expect(col.firstElementChild!.className).toBe('ch-ph-next');
    expect(col.firstElementChild!.textContent).toContain(next.title);
  });
});
