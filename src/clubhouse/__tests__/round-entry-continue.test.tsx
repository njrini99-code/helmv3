import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round entry wired to the engine (P011, Q-81): /rounds/continue/[id] in Clubhouse, through the real continue engine
 * (`useContinueRoundSession`) with every server action and browser store stubbed. The shot screen is a stand-in that
 * hands the round its props. The continue engine tells the player about a failed save, discard or change to practice
 * through its toast port rather than by throwing, so these pin that each becomes the state the catalog names, once.
 */

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  savePartialRound: vi.fn(),
  submitGolfRoundComprehensive: vi.fn(),
  deleteInProgressRound: vi.fn(),
  updateRoundType: vi.fn(),
  checkRoundStaleness: vi.fn(),
  connection: { isOnline: true, isConnected: true, quality: 'excellent' },
  tracking: { current: null as null | Record<string, (...args: never[]) => unknown> },
  haptic: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('../lib/haptics', () => ({ haptic: mocks.haptic }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/golf', () => ({
  savePartialRound: (...args: unknown[]) => mocks.savePartialRound(...args),
  submitGolfRoundComprehensive: (...args: unknown[]) => mocks.submitGolfRoundComprehensive(...args),
  deleteInProgressRound: (...args: unknown[]) => mocks.deleteInProgressRound(...args),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: (...args: unknown[]) => mocks.checkRoundStaleness(...args) }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: (...args: unknown[]) => mocks.updateRoundType(...args) }));
vi.mock('@/hooks/golf/use-connection-status', () => ({ useConnectionStatus: () => mocks.connection }));
vi.mock('@/hooks/golf/use-round-status-sync', () => ({ useRoundStatusSync: vi.fn() }));
vi.mock('@/stores/offline-sync-store', () => {
  const status = { isOnline: true, isSyncing: false, pendingCount: { total: 0 }, syncError: null };
  return { useOfflineSyncStatus: () => status };
});
vi.mock('@/lib/offline/indexed-db', () => ({ saveOfflineRound: vi.fn(async () => {}), deleteOfflineRound: vi.fn(async () => {}) }));
vi.mock('@/lib/offline/partial-save-beacon', () => ({ beaconPartialSave: vi.fn(() => false) }));
vi.mock('@/lib/offline/shot-storage', () => ({
  getRoundRecoverySnapshot: vi.fn(async () => null),
  getRoundRecoverySnapshots: vi.fn(async () => []),
  saveRoundRecoverySnapshot: vi.fn(async () => {}),
  deleteRoundRecoverySnapshot: vi.fn(async () => {}),
  clearRoundRecoverySnapshotThrough: vi.fn(async () => {}),
}));
vi.mock('@/lib/observability/client-breadcrumbs', () => ({ recordHelmBreadcrumb: vi.fn() }));
vi.mock('@/lib/recovery/use-active-work', () => ({ useActiveWork: vi.fn() }));
vi.mock('../screens/rounds/track/RoundTracking', () => ({
  RoundTracking: (props: Record<string, unknown>) => {
    mocks.tracking.current = props as never;
    return (
      <div data-testid="tracking" data-hole={String(props.currentHoleIndex)}>
        <button type="button" onClick={props.onExit as () => void}>
          Exit
        </button>
        {props.statusSlot as never}
      </div>
    );
  },
}));

import { emergencySave, loadEmergencySave } from '@/lib/utils/emergency-save';
import { ContinueRound, type ContinueRoundProps } from '../screens/rounds/entry/ContinueRound';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const NOW = '2026-10-14T12:00:00.000Z';
const saved = { success: true, data: { roundId: 'round-9', updatedAt: NOW } };
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const toasts = () => [...document.querySelectorAll('.ch-toast')];
const toastAction = (c: string, name: string | RegExp) => within(code(c)!).queryByRole('button', { name });
const tracking = () => mocks.tracking.current as unknown as { onHoleComplete: (index: number, stats: unknown) => Promise<boolean> };

const stats = (i: number) => ({ holeNumber: i + 1, par: 4, yardage: 380, score: 4, putts: 2, fairwayHit: true, greenInRegulation: true, penaltyStrokes: 0, shots: [] });
const setupData: ContinueRoundProps['setupData'] = {
  courseName: 'Finley GC',
  courseCity: '',
  courseState: '',
  courseRating: '',
  courseSlope: '',
  teesPlayed: 'Blue',
  roundType: 'practice',
  roundDate: '2026-10-14',
};
const holes = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: null }));

function renderContinue(over: Partial<ContinueRoundProps> = {}) {
  const user = userEvent.setup();
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <ContinueRound roundId="round-9" playerId="player-1" setupData={setupData} holes={holes} completedHoleStats={[]} startHoleIndex={0} serverDataTimestamp="2020-01-01T00:00:00.000Z" {...over} />
      </ToastProvider>
    </LazyMotion>,
  );
  return user;
}
async function openExit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Exit' }));
  await waitFor(() => expect(code('CH-11506')).toHaveAttribute('open'));
}
async function finishRound() {
  await act(async () => {
    for (let i = 0; i < 9; i++) await tracking().onHoleComplete(i, stats(i));
  });
  await waitFor(() => expect(code('CH-11508')).toHaveAttribute('open'));
  mocks.savePartialRound.mockClear();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  localStorage.clear();
  mocks.connection.isConnected = true;
  mocks.savePartialRound.mockResolvedValue(saved);
  mocks.deleteInProgressRound.mockResolvedValue({ success: true });
  mocks.updateRoundType.mockResolvedValue({ success: true });
  mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: true, data: { roundId: 'round-9' } });
  mocks.checkRoundStaleness.mockResolvedValue({ success: true, data: { status: 'in_progress', isStale: false, currentUpdatedAt: NOW } });
});
afterEach(() => vi.restoreAllMocks());

describe('112401 Continue round: a round saved on this device (CH-11512, CH-11513)', () => {
  function seed() {
    emergencySave({
      playerId: 'player-1',
      roundId: 'round-9',
      timestamp: Date.now(),
      setupData,
      holes: holes.map((h, i) => ({ ...h, score: i < 3 ? 4 : null })),
      completedHoleStats: [stats(0), stats(1), stats(2)] as never,
      inProgressShotsByHole: {},
      currentHoleIndex: 3,
    });
  }

  it('CH-11512 a device copy newer than the server’s is offered, and Restore puts the round back where it was', async () => {
    seed();
    const user = renderContinue();
    await waitFor(() => expect(code('CH-11512')).toHaveAttribute('open'));
    expect(code('CH-11512')).toHaveTextContent('Finley GC');
    expect(screen.getByTestId('tracking')).toHaveAttribute('data-hole', '0');
    await user.click(within(code('CH-11512')!).getByRole('button', { name: /^Restore round/ }));
    await waitFor(() => expect(code('CH-11512')).not.toHaveAttribute('open'));
    expect(screen.getByTestId('tracking')).toHaveAttribute('data-hole', '3');
  });

  it('CH-11513 Discard saved shots asks first, and removes the device copy', async () => {
    seed();
    const user = renderContinue();
    await waitFor(() => expect(code('CH-11512')).toHaveAttribute('open'));
    await user.click(within(code('CH-11512')!).getByRole('button', { name: /^Discard saved shots/ }));
    await user.click(within(code('CH-11513')!).getByRole('button', { name: 'Discard shots' }));
    await waitFor(() => expect(loadEmergencySave('round-9', 'player-1')).toBeNull());
    expect(code('CH-11512')).not.toHaveAttribute('open');
  });
});

describe('Continue round: Save for later and Discard (CH-11010, CH-11006, CH-11902)', () => {
  it('CH-11010 a save that fails is one toast with Retry, not the engine’s own toast as well, and Retry saves this round', async () => {
    const user = renderContinue();
    await openExit(user);
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'Something failed for real' });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(code('CH-11010')).toHaveTextContent('Couldn’t save your round at Finley GC'));
    expect(code('CH-11010')).toHaveTextContent('Something failed for real.');
    expect(toasts()).toHaveLength(1);
    await user.click(toastAction('CH-11010', 'Retry')!);
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'));
    expect(mocks.savePartialRound).toHaveBeenLastCalledWith(expect.anything(), 'round-9');
  });

  it('CH-11902 a save refused for a round changed elsewhere is the Reload toast, and the banner, with no Retry', async () => {
    const user = renderContinue();
    await openExit(user);
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'conflict' });
    mocks.checkRoundStaleness.mockResolvedValue({ success: true, data: { status: 'in_progress', isStale: true, currentUpdatedAt: '2026-10-14T13:00:00.000Z' } });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(document.querySelectorAll('[data-ch-code="CH-11902"]').length).toBeGreaterThanOrEqual(2));
    expect(code('CH-11010')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('CH-11006 a Discard that fails stays in the Exit sheet’s question with the reason, once, and can be tried again', async () => {
    const user = renderContinue();
    await openExit(user);
    mocks.deleteInProgressRound.mockResolvedValueOnce({ success: false, error: 'This round can no longer be discarded.' });
    await user.click(within(code('CH-11506')!).getByRole('button', { name: /^Discard round/ }));
    await user.click(within(code('CH-11507')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(code('CH-11006')).toHaveTextContent('Couldn’t discard the round. This round can no longer be discarded.'));
    expect(toasts()).toHaveLength(0);
    await user.click(within(code('CH-11507')!).getByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/golf/dashboard/rounds'));
    expect(mocks.deleteInProgressRound).toHaveBeenCalledTimes(2);
    expect(mocks.deleteInProgressRound).toHaveBeenLastCalledWith('round-9');
  });
});

describe('Continue round: submitting a saved qualifier round (CH-11518, CH-11519, CH-11516, CH-11012)', () => {
  const qualifierSetup = { ...setupData, roundType: 'qualifier' as const, qualifierId: 'q1' };

  it('CH-11518 a legacy qualifier round with no number asks which round it is; Submit waits for a choice and posts that round', async () => {
    const user = renderContinue({ setupData: qualifierSetup, qualifierRoundNumberOptions: [2, 3] });
    await finishRound();
    await user.click(within(code('CH-11508')!).getByRole('button', { name: /Submit round/ }));
    await waitFor(() => expect(code('CH-11518')).toHaveAttribute('open'));
    expect(mocks.submitGolfRoundComprehensive).not.toHaveBeenCalled();
    const submit = within(code('CH-11518')!).getByRole('button', { name: 'Submit round' });
    expect(submit).toBeDisabled();
    await user.click(within(code('CH-11518')!).getByRole('button', { name: /Qualifier round 3/ }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(mocks.submitGolfRoundComprehensive).toHaveBeenCalled());
    expect(mocks.submitGolfRoundComprehensive.mock.calls[0]![0]).toMatchObject({ qualifierId: 'q1', qualifierRoundNumber: 3 });
  });

  it('CH-11519 with no round left to choose, the server’s reason takes the rows’ place and Back returns to the finish sheet', async () => {
    const user = renderContinue({ setupData: qualifierSetup, qualifierRoundNumberOptions: [], qualifierRoundNumberUnavailableReason: 'Every configured qualifier round is already saved for you.' });
    await finishRound();
    await user.click(within(code('CH-11508')!).getByRole('button', { name: /Submit round/ }));
    await waitFor(() => expect(code('CH-11518')).toHaveAttribute('open'));
    expect(code('CH-11519')).toHaveTextContent('Every configured qualifier round is already saved for you.');
    expect(within(code('CH-11518')!).queryByRole('button', { name: 'Submit round' })).toBeNull();
    await user.click(within(code('CH-11518')!).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(code('CH-11508')).toHaveAttribute('open'));
  });

  it('CH-11516 a closed qualifier opens Save as practice; a change to practice that fails is a line on the sheet (CH-11012), once', async () => {
    const closed = 'This qualifier has already been completed. Rounds can no longer be submitted.';
    const user = renderContinue();
    await finishRound();
    mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: false, error: closed });
    await user.click(within(code('CH-11508')!).getByRole('button', { name: /Submit round/ }));
    await waitFor(() => expect(code('CH-11516')).toHaveAttribute('open'));
    expect(code('CH-11005')).toBeNull();
    mocks.updateRoundType.mockResolvedValueOnce({ success: false, error: 'This round is locked.' });
    await user.click(within(code('CH-11516')!).getByRole('button', { name: /Save as practice round/ }));
    await waitFor(() => expect(code('CH-11012')).toHaveTextContent('This round is locked.'));
    expect(toasts().filter((t) => t.textContent?.includes('practice'))).toHaveLength(0);
    expect(mocks.updateRoundType).toHaveBeenCalledWith({ roundId: 'round-9', roundType: 'practice' });
  });
});
