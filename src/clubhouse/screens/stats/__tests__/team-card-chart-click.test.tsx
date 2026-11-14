import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));

import { PREVIEW_TEAM_STATS as TEAM } from '../../../preview/fixtures-stats';
import { StatsTeam } from '../StatsTeam';
import { asDesktop, asPhone, browserBack, detailShown, painted, resetAddress, tree } from './_shs-harness';

/**
 * F-0004 (audit, 13 Nov 2026): "clicking the middle of the Scoring average card does nothing; the chart takes the pointer". The
 * team cards' charts are drawings, not controls, and a press on them reaches the card, which opens its detail. The audit's timeouts
 * were Playwright clicking the card's keyboard key (`.ch-shs-sum__key`, `pointer-events: none` on purpose, STATS-8), which a pointer
 * never hits; its mouse retest ran on a desk, where the Scoring drill is already the open pane, and looked for an address change or
 * a dialog, which a desk never makes. These pin what a press in the middle of each card does.
 */

afterEach(cleanup);

/** Where a pointer lands in the middle of each card: inside its drawing or its rows, never on its title or key. */
const middle: Record<string, string> = {
  tscore: '.ch-shs-chart svg',
  tgame: '.ch-shs-mrows .ch-shs-rail, .ch-shs-mrails .ch-shs-mr',
  tplayers: '.ch-shs-prow .ch-shs-rail',
};

describe('a press in the middle of a team card opens its detail (F-0004)', () => {
  beforeEach(() => {
    asPhone();
    resetAddress();
  });
  afterEach(asDesktop);

  it.each([
    ['tscore', 'sd-team-score'],
    ['tgame', 'sd-team-game'],
    ['tplayers', 'sd-team-players'],
  ])('phone: %s pushes %s', async (go, hash) => {
    render(tree(<StatsTeam data={TEAM} />));
    const card = await painted(go);
    const inside = card.querySelector(middle[go]!);
    expect(inside, `${go} draws something in its middle`).not.toBeNull();
    expect(inside!.closest('[data-ch-no-open]')).toBeNull();
    fireEvent.click(inside!);
    await waitFor(() => expect(detailShown()).toBe(hash));
    await browserBack();
  });
});

describe('a press in the middle of a team card changes the desk’s pane (F-0004)', () => {
  beforeEach(() => {
    asDesktop();
    resetAddress();
  });

  it('the game and players cards open their drills, and the scoring card brings its own back', async () => {
    render(tree(<StatsTeam data={TEAM} />));
    const open = () => document.querySelector<HTMLElement>('.ch-shs--desk')?.dataset.chShsOpen;
    await waitFor(() => expect(open()).toBe('tscore'));
    for (const go of ['tgame', 'tplayers', 'tscore']) {
      const card = await painted(go);
      fireEvent.click(card.querySelector(middle[go]!)!);
      await waitFor(() => expect(open()).toBe(go));
    }
  });
});
