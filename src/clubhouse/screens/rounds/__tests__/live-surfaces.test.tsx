import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-refresh', () => ({ useRefresh: () => ({ refresh: vi.fn(), refreshing: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/rounds', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/round-partial', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));

import { PREVIEW_LIVE, PREVIEW_LIVE_EMPTY, PREVIEW_LIVE_NOW } from '../../../preview/fixtures-live';
import { PREVIEW_ROUNDS_MANY } from '../../../preview/fixtures-rounds';
import { PREVIEW_TEAM_ROUNDS } from '../../../preview/fixtures-team-rounds';
import type { LiveSharePorts } from '../../../live/share-ports';
import { CrumbProvider } from '../../../shell/crumbs';
import { PhoneChromeProvider } from '../../../shell/phone-chrome';
import { ToastProvider } from '../../../ui/Toast';
import { RoundsLibrary } from '../RoundsLibrary';
import { TeamRounds } from '../TeamRounds';

afterEach(cleanup);

const ports = (level: 'off' | 'coaches' | 'team' | null): LiveSharePorts => ({
  loadPrefs: vi.fn(async () => ({ practiceShare: 'coaches' as const })),
  setNext: vi.fn(),
  loadRoundShare: vi.fn(async () => level),
  setShare: vi.fn(async (_id, share) => ({ success: true as const, data: { share, seq: null, clamped: false } })),
  setPrefs: vi.fn(),
});

const shell = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <CrumbProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            {node}
          </div>
        </PhoneChromeProvider>
      </CrumbProvider>
    </ToastProvider>
  </LazyMotion>
);

describe('Rounds library: the share chip (CH-16631)', () => {
  it('names the level of the round in progress, and opens the sharing sheet', async () => {
    render(shell(<RoundsLibrary data={PREVIEW_ROUNDS_MANY} playerId="p1" sharePorts={ports('coaches')} />));
    const chip = await screen.findByRole('button', { name: /Sharing: Coaches/ });
    expect(chip.getAttribute('data-ch-code')).toBe('CH-16631');
    await userEvent.click(chip);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('reads Not live and Coaches and team for the other two levels', async () => {
    const off = render(shell(<RoundsLibrary data={PREVIEW_ROUNDS_MANY} playerId="p1" sharePorts={ports('off')} />));
    expect((await screen.findByRole('button', { name: /Sharing: Not live/ })).textContent).toBe('Not live');
    off.unmount();
    render(shell(<RoundsLibrary data={PREVIEW_ROUNDS_MANY} playerId="p1" sharePorts={ports('team')} />));
    expect((await screen.findByRole('button', { name: /Sharing: Coaches and team/ })).textContent).toBe('Coaches and team');
  });

  it('draws no chip while sharing is not there yet (the level is unknown)', async () => {
    const p = ports(null);
    render(shell(<RoundsLibrary data={PREVIEW_ROUNDS_MANY} playerId="p1" sharePorts={p} />));
    await waitFor(() => expect(p.loadRoundShare).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Sharing:/ })).toBeNull();
  });
});

describe('Team rounds: the Live now band (CH-16630)', () => {
  it('shows who is out above the book, three lanes at most', () => {
    const { container } = render(shell(<TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" live={PREVIEW_LIVE} liveNow={PREVIEW_LIVE_NOW} />));
    expect(screen.getByRole('heading', { name: 'Live now' }).getAttribute('data-ch-code')).toBe('CH-16630');
    expect(container.querySelectorAll('.ch-lv-lane').length).toBeLessThanOrEqual(3);
    expect(container.querySelectorAll('.ch-lv-lane').length).toBeGreaterThan(0);
  });

  it('draws no band when nobody is out, or without a live read', () => {
    const empty = render(shell(<TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" live={PREVIEW_LIVE_EMPTY} liveNow={PREVIEW_LIVE_NOW} />));
    expect(empty.container.querySelector('.ch-lv-card')).toBeNull();
    empty.unmount();
    const none = render(shell(<TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" />));
    expect(none.container.querySelector('.ch-lv-card')).toBeNull();
  });
});
