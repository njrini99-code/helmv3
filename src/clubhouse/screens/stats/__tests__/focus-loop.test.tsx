import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * CoachHelm chs-11 on Stats › Development: each focus area with a prescription draws its target, its progress and its verdict on
 * itself, on the desktop track and on the phone line alike; without a loop (`coachhelm_verdicts_v1` off) the area is as before.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import type { ChPlayerProfile } from '../../../data/stats-player';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_LOOPS, PREVIEW_PLAYER_LOOPS_SELF } from '../../../preview/fixtures-stats';
import { StatsPlayer } from '../StatsPlayer';
import { ToastProvider } from '../../../ui/Toast';
import { CrumbProvider } from '../../../shell/crumbs';
import { PhoneChromeProvider } from '../../../shell/phone-chrome';
import '../../../__tests__/dialog-polyfill';

const show = (data: ChPlayerProfile, coachId: string | null = 'c1') =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <StatsPlayer data={data} coachId={coachId} initialTab="dev" />
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );

const real = window.matchMedia;
const asPhone = () => {
  window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
};
afterEach(() => {
  window.matchMedia = real;
  cleanup();
});

/** The loop's rows as label and text, for the focus area whose title is `title`. */
const loopOf = (title: string) => {
  const item = screen.getAllByText(title).map((t) => t.closest('li')).find(Boolean) as HTMLElement;
  const dl = item.querySelector('.ch-dv-loop');
  return dl ? [...dl.querySelectorAll(':scope > div')].map((d) => `${d.querySelector('dt')?.textContent}: ${d.querySelector('dd')?.textContent}`) : null;
};

describe('CoachHelm verdict loop on the focus areas (chs-11)', () => {
  for (const [where, setup] of [
    ['desktop', () => {}],
    ['phone', asPhone],
  ] as const) {
    it(`${where}: target, progress and Too early before the horizon; the verdict and its line at it; nothing on an area with no prescription`, () => {
      setup();
      show(PREVIEW_PLAYER_LOOPS);
      expect(loopOf('Short putts')).toEqual(['Target: 85% or better over 40 putts', 'Progress: 22 of 40 putts in · 82% so far', 'Verdict: Too early']);
      expect(loopOf('5–10 ft putts')).toEqual([
        'Target: 70% or better over 40 putts',
        'Verdict: Worked5–10 ft putts · Worked — 31 of 42 (74%) against 18 of 31 (58%) before. Expected without coaching: about 64% (bounce-back). Lower bound 65% clears it. Target was 70%.',
      ]);
      expect(loopOf('Greens in regulation')?.[1]).toMatch(/^Verdict: Did not move/);
      expect(loopOf('Approach 125–150 yds')).toBeNull();
    });
  }

  it('the player reads their own verdict in their own voice', () => {
    show(PREVIEW_PLAYER_LOOPS_SELF, null);
    expect(loopOf('5–10 ft putts')?.[1]).toMatch(/^Verdict: WorkedWorked\. 31 of 42 \(74%\), up from 58%\./);
  });

  it('without loops (the flag off) every focus area is drawn as before', () => {
    show(PREVIEW_PLAYER);
    expect(document.querySelector('.ch-dv-loop')).toBeNull();
    const list = screen.getByRole('list', { name: 'Focus areas' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(PREVIEW_PLAYER.focusAreas.length);
  });
});
