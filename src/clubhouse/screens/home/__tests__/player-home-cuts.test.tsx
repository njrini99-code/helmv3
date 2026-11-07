import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));

import { PREVIEW_PLAYER_HOME } from '../../../preview/fixtures-player-home';
import { PlayerHomePhone } from '../PlayerHomePhone';
import type { ChPlayerHome } from '../../../data/player-home';

afterEach(cleanup);
const NOW = '2026-10-14T15:00:00.000Z';

/** Dashboard cuts, 6: Player Home leads with Your game on My stats' window; the strip and the separate Scoring card go; Up next is one row. */
describe('player Home, the cuts', () => {
  it('leads with Your game under the greeting: four legs into My stats, no window switch and no figures line (S-HOMEGAME)', () => {
    const data = PREVIEW_PLAYER_HOME as ChPlayerHome;
    const { container } = render(<PlayerHomePhone data={data} now={NOW} />);
    const heads = [...container.querySelectorAll('h1, h2')].map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual([data.greeting, 'Your game']);
    expect(container.querySelector('.ch-shs-yg__sum')).toBeNull();
    expect(container.textContent).not.toContain('All time');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    const legs = [...container.querySelectorAll('[data-ch="home-leg"]')] as HTMLAnchorElement[];
    expect(legs).toHaveLength(4);
    for (const leg of legs) expect(leg.getAttribute('href')).toMatch(/\/golf\/dashboard\/stats#gm-/);
  });

  it('puts what is next under the greeting, with the player’s coin, and draws no Up next card of its own', () => {
    const data = PREVIEW_PLAYER_HOME as ChPlayerHome;
    const { container } = render(<PlayerHomePhone data={data} now={NOW} />);
    expect(container.querySelector('.ch-shs-who .ch-avatar')).toBeTruthy();
    expect(container.querySelector('.ch-shs-who__line')!.textContent).toMatch(/^Qualifier Fri at /);
    expect(container.querySelector('.ch-hm-nextrow')).toBeNull();
    expect(container.querySelector('.ch-hm-hero__date')).toBeNull();
  });

  it('draws no week strip and no separate Scoring card', () => {
    const { container } = render(<PlayerHomePhone data={PREVIEW_PLAYER_HOME as ChPlayerHome} now={NOW} />);
    expect(container.querySelector('.ch-hm-week')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Scoring' })).toBeNull();
    expect(container.querySelector('.ch-ph-viz--sg')).toBeNull();
    expect(container.querySelector('.ch-hm-next')).toBeNull();
  });
});
