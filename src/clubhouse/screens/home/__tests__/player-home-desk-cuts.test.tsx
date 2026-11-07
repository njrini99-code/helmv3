import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));

import { PREVIEW_PLAYER_HOME } from '../../../preview/fixtures-player-home';
import { PlayerHome } from '../PlayerHome';

afterEach(cleanup);
const NOW = '2026-10-14T15:00:00.000Z';

/** Dashboard cuts, 6, on a desk: the same page as the phone, wider. */
describe('player Home desktop, the cuts', () => {
  it('leads with Your game; no Scoring card, no week, Up next as one row', () => {
    const { container } = render(<PlayerHome data={PREVIEW_PLAYER_HOME} now={NOW} />);
    const heads = [...container.querySelectorAll('h1, h2')].map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual([PREVIEW_PLAYER_HOME.greeting, 'Your game']);
    expect(heads).not.toContain('Scoring');
    expect(heads).not.toContain('This week');
    expect(container.querySelector('.ch-shs-yg__sum')).toBeTruthy();
    if (PREVIEW_PLAYER_HOME.next) expect(container.querySelector('.ch-hm-nextrow')).toBeTruthy();
  });
  it('a failed schedule read says so, not "Nothing scheduled"', () => {
    const data = { ...PREVIEW_PLAYER_HOME, week: { ...PREVIEW_PLAYER_HOME.week, error: true }, today: [], next: null };
    const { container } = render(<PlayerHome data={data} now={NOW} />);
    expect(container.textContent).toContain('This week’s schedule didn’t load');
    expect(container.textContent).not.toContain('Nothing scheduled');
  });
});
