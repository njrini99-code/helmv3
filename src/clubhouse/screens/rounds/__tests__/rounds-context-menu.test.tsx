import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-refresh', () => ({ useRefresh: () => ({ refresh: vi.fn(), refreshing: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/rounds', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/round-partial', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));

import { PREVIEW_ROUNDS_MANY } from '../../../preview/fixtures-rounds';
import { ToastProvider } from '../../../ui/Toast';
import { RoundsLibrary } from '../RoundsLibrary';

const discard = vi.fn(() => Promise.resolve({ success: true }));
beforeEach(() => {
  discard.mockClear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

const tree = (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <RoundsLibrary data={PREVIEW_ROUNDS_MANY} playerId="p1" writes={{ discard }} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const menuLabels = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);

describe('Rounds right-click menu', () => {
  it('an unfinished round offers what its row does: Continue or Post, and Discard', () => {
    render(tree);
    const more = document.querySelectorAll('.ch-rd-more li');
    expect(more.length).toBe(2);
    fireEvent.contextMenu(more[0]!, { clientX: 300, clientY: 300 });
    expect(menuLabels()).toEqual(['Continue', 'Discard round']);
    expect(screen.getByRole('menuitem', { name: 'Continue' })).toHaveAttribute('href', expect.stringMatching(/\/rounds\/continue\//));
  });

  it('the round that is ready to post says Post round', async () => {
    render(tree);
    const more = document.querySelectorAll('.ch-rd-more li');
    fireEvent.contextMenu(more[1]!, { clientX: 300, clientY: 300 });
    expect(menuLabels()).toEqual(['Post round', 'Discard round']);
  });

  it('Discard round asks the same question the row\'s bin does, before anything is deleted', async () => {
    const user = userEvent.setup();
    render(tree);
    fireEvent.contextMenu(document.querySelectorAll('.ch-rd-more li')[0]!, { clientX: 300, clientY: 300 });
    await user.click(screen.getByRole('menuitem', { name: 'Discard round' }));
    expect(await screen.findByRole('dialog', { name: 'Discard this round?' })).toBeInTheDocument();
    expect(discard).not.toHaveBeenCalled();
  });

  it('the round in progress on the card has the same menu', () => {
    render(tree);
    fireEvent.contextMenu(document.querySelector('.ch-rd-unf')!, { clientX: 300, clientY: 300 });
    expect(menuLabels()).toEqual([expect.stringMatching(/^(Continue|Post round)$/), 'Discard round']);
  });

  it('a posted round keeps the browser\'s menu: it has one action, a link', () => {
    render(tree);
    const posted = screen.getAllByRole('link').find((l) => /\/rounds\/a0000000-/.test(l.getAttribute('href') ?? ''))!;
    expect(fireEvent.contextMenu(posted, { clientX: 10, clientY: 10 })).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes with Escape and gives focus back to where it was', async () => {
    render(tree);
    const row = document.querySelectorAll('.ch-rd-more li')[0]!;
    fireEvent.contextMenu(row, { clientX: 300, clientY: 300 });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
