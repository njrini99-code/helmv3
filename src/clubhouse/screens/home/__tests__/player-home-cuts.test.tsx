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
  it('leads with Your game under the greeting, over the newest ten, linking to My stats', () => {
    const data = PREVIEW_PLAYER_HOME as ChPlayerHome;
    const { container } = render(<PlayerHomePhone data={data} now={NOW} shs />);
    const heads = [...container.querySelectorAll('h1, h2')].map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual([data.greeting, 'Your game']);
    const sum = container.querySelector('.ch-shs-yg__sum') as HTMLAnchorElement;
    expect(sum.getAttribute('href')).toMatch(/\/golf\/dashboard\/stats$/);
    expect(sum.textContent).toContain(data.scoringLast10!.avg!.toFixed(1));
  });

  it('draws no week strip and no separate Scoring card, and Up next as one row', () => {
    const { container } = render(<PlayerHomePhone data={PREVIEW_PLAYER_HOME as ChPlayerHome} now={NOW} shs />);
    expect(container.querySelector('.ch-hm-week')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Scoring' })).toBeNull();
    expect(container.querySelector('.ch-ph-viz--sg')).toBeNull();
    expect(container.querySelector('.ch-hm-next')).toBeNull();
    if (PREVIEW_PLAYER_HOME.next) expect(container.querySelector('.ch-hm-nextrow')).toBeTruthy();
  });

  it('with the flag off keeps the page it had', () => {
    const { container } = render(<PlayerHomePhone data={PREVIEW_PLAYER_HOME as ChPlayerHome} now={NOW} />);
    expect(container.querySelector('.ch-shs-yg__sum')).toBeNull();
    expect(container.querySelector('.ch-hm-nextrow')).toBeNull();
  });
});
