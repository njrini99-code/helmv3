import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// W32 (preview walk, 11 Nov): qualifier rounds with no tee recorded read "18 holes" under the Tees header. The desktop
// table now shows the no-data dash there, and a nine-hole round keeps its "9 holes" chip whether or not a tee is known.
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds' }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_TEAM_ROUNDS } from '../../../preview/fixtures-team-rounds';
import { CrumbProvider } from '../../../shell/crumbs';
import { PhoneChromeProvider } from '../../../shell/phone-chrome';
import { ToastProvider } from '../../../ui/Toast';
import { TeamRounds } from '../TeamRounds';

afterEach(cleanup);

const [a, b, ...rest] = PREVIEW_TEAM_ROUNDS.rounds.list;
const list = [{ ...a!, tee: null, teeColor: null }, { ...b!, tee: null, teeColor: null, holes: 9 }, ...rest];

const show = () =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <TeamRounds data={{ ...PREVIEW_TEAM_ROUNDS, rounds: { list, error: false } }} teamId="t1" />
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );

describe('W32 the Tees column says only tees', () => {
  it('a round with no tee reads the dash, never its length', () => {
    show();
    const cells = [...screen.getByRole('table', { name: 'Team rounds' }).querySelectorAll('.ch-trd-td--tee[role="cell"]')];
    const texts = cells.map((c) => c.textContent);
    expect(texts.some((t) => /^\d+ holes$/.test(t ?? ''))).toBe(false);
    expect(texts.some((t) => t?.startsWith('—'))).toBe(true);
  });

  it('a nine-hole round with no tee still says "9 holes"', () => {
    show();
    const cells = [...screen.getByRole('table', { name: 'Team rounds' }).querySelectorAll('.ch-trd-td--tee[role="cell"]')];
    expect(cells.some((c) => c.querySelector('.ch-nodata') && c.querySelector('.ch-rd-pill.is-nine')?.textContent === '9 holes')).toBe(true);
  });
});
