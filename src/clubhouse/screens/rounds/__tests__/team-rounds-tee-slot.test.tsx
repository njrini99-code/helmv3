import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds' }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_TEAM_ROUNDS } from '../../../preview/fixtures-team-rounds';
import { CrumbProvider } from '../../../shell/crumbs';
import { PhoneChromeProvider } from '../../../shell/phone-chrome';
import { ToastProvider } from '../../../ui/Toast';
import { TeeSwatch } from '../parts';
import { TeamRounds } from '../TeamRounds';

afterEach(cleanup);

const show = () =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" />
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );

/**
 * Phone premium sweep (12 Nov 2026): on Team rounds a tee whose colour isn't known ("Championship tees") drew no dot, so
 * its name started 16px left of every other row's. The row keeps the dot's place, empty: an outlined dot would read as
 * White.
 */
describe('Team rounds: every tee name starts on one line', () => {
  it('each row’s tee leads with the dot’s place, a colour or an empty slot', () => {
    const { container } = show();
    const cells = [...container.querySelectorAll('.ch-trd-meta__tee')];
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) expect(c.firstElementChild?.classList.contains('ch-rd-tee')).toBe(true);
    const champ = cells.find((c) => c.textContent?.startsWith('Championship'));
    expect(champ, 'the fixture’s Championship tee').toBeDefined();
    expect(champ!.firstElementChild!.className).toBe('ch-rd-tee ch-rd-tee--none');
  });

  it('elsewhere a tee with no colour still draws nothing', () => {
    const { container } = render(<TeeSwatch color={null} />);
    expect(container.firstChild).toBeNull();
  });
});
