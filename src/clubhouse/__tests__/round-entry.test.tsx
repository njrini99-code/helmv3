import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/**
 * Round entry (P011): the dialogs and banners the legacy flow draws around
 * setup and tracking (a saved round found on this device, a round already in
 * progress, a closed qualifier, the reload and error banners, and the toasts
 * for the failures with no dialog to hold them). Each state is found by its
 * catalog number in docs/clubhouse/catalog/rounds.md.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { entryFailureToast, useEntryFailureToast } from '../screens/rounds/entry/failures';
import { InProgressConflictDialog } from '../screens/rounds/entry/InProgressConflictDialog';
import { ago, factsLine, reasonText, typeLabel } from '../screens/rounds/entry/labels';
import { RecoveryDialog } from '../screens/rounds/entry/RecoveryDialog';
import { ReloadBanner, RoundErrorBanner } from '../screens/rounds/entry/ReloadBanner';
import { QUALIFIER_CLOSED_REASON, SaveAsPracticeSheet } from '../screens/rounds/entry/SaveAsPracticeSheet';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const NOW = Date.UTC(2026, 9, 14, 19, 0, 0);
const MIN = 60_000;

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const card = () => document.querySelector('.ch-rt-exitc') as HTMLElement;
const tile = () => within(card().querySelector('.ch-rt-exitc__n') as HTMLElement);
const barWidth = () => (card().querySelector('.ch-rt-exitc__bar i') as HTMLElement | null)?.style.width;
const ticks = (kind: string) => hapticSpy.mock.calls.filter(([k]) => k === kind).length;
/** The first haptic of a kind came before the callback ran (D-70: warning before a destructive action). */
function hapticBefore(kind: string, cb: () => void) {
  const mock = (cb as Mock).mock;
  const at = hapticSpy.mock.calls.findIndex(([k]) => k === kind);
  expect(at, `${kind} haptic fired`).toBeGreaterThanOrEqual(0);
  expect(mock.calls).toHaveLength(1);
  expect(hapticSpy.mock.invocationCallOrder[at]!).toBeLessThan(mock.invocationCallOrder[0]!);
}

beforeEach(() => hapticSpy.mockClear());

// ── Recovery ──

const recovery = (over: Partial<Parameters<typeof RecoveryDialog>[0]> = {}) => ({
  open: true,
  course: 'Finley GC',
  tees: 'Blue',
  type: 'practice',
  holesDone: 3,
  holesTotal: 18,
  savedAt: NOW - 5 * MIN,
  now: NOW,
  restoring: false,
  error: null,
  onRestore: vi.fn(),
  onDiscard: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('Recovery: a saved round found on this device', () => {
  it('CH-11512 says what was found and when, and Restore hands it back with the light haptic', async () => {
    const user = userEvent.setup();
    const p = recovery();
    render(<RecoveryDialog {...p} />);
    expect(screen.getByRole('heading', { name: 'Recover unsaved progress' })).toBeInTheDocument();
    expect(code('CH-11512')).toHaveAttribute('open');
    expect(card()).toHaveTextContent('Finley GC');
    expect(card()).toHaveTextContent('Blue tees · Practice · saved 5 min ago');
    expect(tile().getByText('3')).toBeInTheDocument();
    expect(tile().getByText('of 18')).toBeInTheDocument();
    expect(parseFloat(barWidth()!)).toBeCloseTo(16.67, 1);
    await user.click(button(/^Restore round/));
    expect(p.onRestore).toHaveBeenCalledTimes(1);
    expect(p.onDiscard).not.toHaveBeenCalled();
    expect(ticks('press')).toBe(1);
  });

  it('CH-11512 a snapshot with only shots on a hole, and no course, says so plainly', () => {
    render(<RecoveryDialog {...recovery({ course: null, tees: null, type: null, holesDone: 0, holesTotal: null })} />);
    expect(card()).toHaveTextContent('Your saved round');
    expect(card()).toHaveTextContent('Shots on a hole in progress · saved 5 min ago');
    expect(tile().getByText('holes')).toBeInTheDocument();
    expect(barWidth()).toBeUndefined();
  });

  it('CH-11512 closed, it draws nothing', () => {
    render(<RecoveryDialog {...recovery({ open: false })} />);
    expect(code('CH-11512')).not.toHaveAttribute('open');
    expect(screen.queryByRole('button', { name: /^Restore round/ })).toBeNull();
  });

  it('CH-11512 while it restores, the button says so, both choices wait, and the dialog will not close', async () => {
    const user = userEvent.setup();
    const p = recovery({ restoring: true });
    const { rerender } = render(<RecoveryDialog {...p} />);
    expect(button(/^Restoring…/)).toBeDisabled();
    expect(button(/^Discard saved shots/)).toBeDisabled();
    await user.click(button('Close'));
    expect(p.onClose).not.toHaveBeenCalled();
    rerender(<RecoveryDialog {...p} restoring={false} />);
    await user.click(button('Close'));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('CH-11513 CH-11708 Discard asks first; the warning haptic fires on the second tap, before onDiscard', async () => {
    const user = userEvent.setup();
    const p = recovery();
    render(<RecoveryDialog {...p} />);
    await user.click(button(/^Discard saved shots/));
    expect(code('CH-11513')).toHaveTextContent('Discard the saved shots?');
    expect(code('CH-11513')).toHaveTextContent('The copy of your round at Finley GC saved on this device is deleted. This can’t be undone.');
    expect(p.onDiscard).not.toHaveBeenCalled();
    expect(ticks('warning')).toBe(0);
    expect(screen.queryByRole('button', { name: /^Restore round/ })).toBeNull();
    await user.click(within(code('CH-11513')!).getByRole('button', { name: 'Discard shots' }));
    hapticBefore('warning', p.onDiscard);
  });

  it('CH-11513 Keep it goes back to Restore and Discard, and deletes nothing', async () => {
    const user = userEvent.setup();
    const p = recovery();
    render(<RecoveryDialog {...p} />);
    await user.click(button(/^Discard saved shots/));
    await user.click(button('Keep it'));
    expect(code('CH-11513')).toBeNull();
    expect(button(/^Restore round/)).toBeEnabled();
    expect(p.onDiscard).not.toHaveBeenCalled();
    expect(ticks('warning')).toBe(0);
  });

  it('CH-11008 CH-11709 a failed restore says so beside the buttons, in words, with the error haptic once per message', () => {
    const p = recovery();
    const { rerender } = render(<RecoveryDialog {...p} error="retry" />);
    expect(code('CH-11008')).toHaveTextContent('Couldn’t restore your saved shots. That save did not go through. Your shots are still on this device. Please try again.');
    expect(code('CH-11008')?.textContent).not.toMatch(/\bretry\./);
    expect(ticks('error')).toBe(1);
    rerender(<RecoveryDialog {...p} error="retry" />);
    expect(ticks('error')).toBe(1);
    rerender(<RecoveryDialog {...p} error={null} />);
    expect(code('CH-11008')).toBeNull();
    rerender(<RecoveryDialog {...p} error="PGRST116: violates constraint" />);
    expect(code('CH-11008')).toHaveTextContent('Couldn’t restore your saved shots. They are still on this device. Keep this screen open and try again.');
    expect(ticks('error')).toBe(2);
  });
});

// ── Round already in progress ──

const conflict = (over: Partial<Parameters<typeof InProgressConflictDialog>[0]> = {}) => ({
  open: true,
  course: 'Finley GC',
  scoredHoles: 4,
  holesTotal: 18 as number | null,
  updatedAt: new Date(NOW - 120 * MIN).toISOString(),
  now: NOW,
  busy: false,
  error: null,
  onResume: vi.fn(),
  onStartSeparate: vi.fn(),
  onDiscard: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('Round already in progress', () => {
  it('CH-11514 names the round and offers Resume, Start a new round and Discard, each calling back', async () => {
    const user = userEvent.setup();
    const p = conflict();
    render(<InProgressConflictDialog {...p} />);
    expect(screen.getByRole('heading', { name: 'Round already in progress' })).toBeInTheDocument();
    expect(code('CH-11514')).toHaveAttribute('open');
    expect(code('CH-11514')).toHaveTextContent('You already have a round in progress for Finley GC on this date.');
    expect(card()).toHaveTextContent('Finley GC');
    expect(card()).toHaveTextContent('In progress · updated 2h ago');
    expect(tile().getByText('4')).toBeInTheDocument();
    expect(tile().getByText('of 18')).toBeInTheDocument();
    expect(parseFloat(barWidth()!)).toBeCloseTo(22.22, 1);
    await user.click(button(/^Resume/));
    expect(p.onResume).toHaveBeenCalledTimes(1);
    expect(ticks('press')).toBe(1);
    await user.click(button(/^Start a new round/));
    expect(p.onStartSeparate).toHaveBeenCalledTimes(1);
    await user.click(button(/^Discard/));
    expect(p.onDiscard).not.toHaveBeenCalled();
    expect(code('CH-11515')).not.toBeNull();
  });

  it('CH-11514 without a course it says this course and date; the card draws only what the conflict knows', () => {
    render(<InProgressConflictDialog {...conflict({ course: null, scoredHoles: 0, holesTotal: null, updatedAt: null })} />);
    expect(code('CH-11514')).toHaveTextContent('You already have a round in progress for this course and date.');
    expect(card()).toHaveTextContent('Round in progress');
    expect(card().textContent).not.toMatch(/updated|tees/);
    expect(tile().getByText('holes')).toBeInTheDocument();
    expect(barWidth()).toBeUndefined();
  });

  it('CH-11515 a round with no scored holes says so in its question', async () => {
    const user = userEvent.setup();
    render(<InProgressConflictDialog {...conflict({ scoredHoles: 0, updatedAt: null })} />);
    await user.click(button(/^Discard/));
    expect(code('CH-11515')).toHaveTextContent('It has no scored holes yet. This can’t be undone.');
  });

  it('CH-11514 closed, it draws nothing', () => {
    render(<InProgressConflictDialog {...conflict({ open: false })} />);
    expect(code('CH-11514')).not.toHaveAttribute('open');
    expect(screen.queryByRole('button', { name: /^Resume/ })).toBeNull();
  });

  it('CH-11515 CH-11708 Discard asks with the round’s holes and age; the warning fires on the second tap, before onDiscard', async () => {
    const user = userEvent.setup();
    const p = conflict();
    render(<InProgressConflictDialog {...p} />);
    await user.click(button(/^Discard/));
    expect(code('CH-11515')).toHaveTextContent('Discard this round?');
    expect(code('CH-11515')).toHaveTextContent('It has 4 scored holes, last updated 2h ago. This can’t be undone.');
    expect(ticks('warning')).toBe(0);
    await user.click(within(code('CH-11515')!).getByRole('button', { name: 'Discard round' }));
    hapticBefore('warning', p.onDiscard);
  });

  it('CH-11515 Keep it goes back to the three choices, and deletes nothing', async () => {
    const user = userEvent.setup();
    const p = conflict();
    render(<InProgressConflictDialog {...p} />);
    await user.click(button(/^Discard/));
    await user.click(button('Keep it'));
    expect(code('CH-11515')).toBeNull();
    expect(button(/^Resume/)).toBeEnabled();
    expect(p.onDiscard).not.toHaveBeenCalled();
    expect(ticks('warning')).toBe(0);
  });

  it('CH-11514 while an action runs every choice waits and the dialog will not close', async () => {
    const user = userEvent.setup();
    const p = conflict({ busy: true });
    const { rerender } = render(<InProgressConflictDialog {...p} />);
    for (const b of screen.getAllByRole('button', { name: /^(Resume|Start a new round|Discard)/ })) expect(b).toBeDisabled();
    await user.click(button('Close'));
    expect(p.onClose).not.toHaveBeenCalled();
    rerender(<InProgressConflictDialog {...p} busy={false} />);
    await user.click(button('Close'));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('CH-11515 while the discard runs, both buttons in the question wait and the danger one says Discarding', async () => {
    const user = userEvent.setup();
    const p = conflict();
    const { rerender } = render(<InProgressConflictDialog {...p} />);
    await user.click(button(/^Discard/));
    rerender(<InProgressConflictDialog {...p} busy />);
    expect(button('Discarding…')).toBeDisabled();
    expect(button('Keep it')).toBeDisabled();
  });

  it('CH-11009 CH-11709 a failed discard shows in the question, in words, with the error haptic; the question stays', async () => {
    const user = userEvent.setup();
    const p = conflict();
    const { rerender } = render(<InProgressConflictDialog {...p} />);
    await user.click(button(/^Discard/));
    rerender(<InProgressConflictDialog {...p} error="busy" />);
    expect(code('CH-11009')).toHaveTextContent('Couldn’t discard the round. Another save for this round is just finishing. Try again in a moment.');
    expect(code('CH-11515')).not.toBeNull();
    expect(within(code('CH-11515')!).getByRole('button', { name: 'Discard round' })).toBeEnabled();
    expect(ticks('error')).toBe(1);
  });
});

// ── The banners ──

describe('The reload banner', () => {
  it('CH-11902 CH-11709 says the round changed on another device, Reload hands back, and there is nothing to dismiss', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    render(<ReloadBanner onReload={onReload} />);
    expect(code('CH-11902')).toHaveAttribute('role', 'alert');
    expect(code('CH-11902')).toHaveTextContent('This round was updated on another device.');
    expect(code('CH-11902')).toHaveTextContent('Saving is paused here so this device can’t overwrite the newer round. Reload to continue.');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(ticks('error')).toBe(1);
    await user.click(button('Reload'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('CH-11902 once Reload is tapped the button says so and waits', () => {
    render(<ReloadBanner reloading onReload={vi.fn()} />);
    expect(button('Reloading…')).toBeDisabled();
  });
});

describe('The error banner', () => {
  it('CH-11013 CH-11709 shows what the round reported, Dismiss hides it quietly, and Reload is not offered', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<RoundErrorBanner message="Hole 4 didn’t save. Try again to move on." onDismiss={onDismiss} />);
    expect(code('CH-11013')).toHaveAttribute('role', 'alert');
    expect(code('CH-11013')).toHaveTextContent('Hole 4 didn’t save. Try again to move on.');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(ticks('error')).toBe(1);
    await user.click(button('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(hapticSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Save as practice ──

const practice = (over: Partial<Parameters<typeof SaveAsPracticeSheet>[0]> = {}) => ({
  open: true,
  reason: QUALIFIER_CLOSED_REASON as string | null,
  pending: null as 'practice' | 'save' | 'discard' | null,
  error: null,
  onSaveAsPractice: vi.fn(),
  onSaveForLater: vi.fn(),
  onGoBack: vi.fn(),
  onDiscard: vi.fn(),
  ...over,
});

describe('Save as practice, when the qualifier closed', () => {
  it('CH-11516 says the qualifier is closed and offers practice, save for later and go back, with no Try again', async () => {
    const user = userEvent.setup();
    const p = practice();
    render(<SaveAsPracticeSheet {...p} />);
    expect(screen.getByRole('heading', { name: 'This qualifier is closed' })).toBeInTheDocument();
    expect(code('CH-11516')).toHaveAttribute('open');
    expect(code('CH-11516')).toHaveTextContent('This qualifier has already been completed. Rounds can no longer be submitted. Your round and every shot are saved.');
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
    await user.click(button(/^Save as practice round/));
    expect(p.onSaveAsPractice).toHaveBeenCalledTimes(1);
    expect(ticks('press')).toBe(1);
    await user.click(button(/^Save for later/));
    expect(p.onSaveForLater).toHaveBeenCalledTimes(1);
    await user.click(button(/^Go back/));
    expect(p.onGoBack).toHaveBeenCalledTimes(1);
    expect(hapticSpy).toHaveBeenCalledTimes(1);
  });

  it('CH-11516 says the server’s sentence when it gave one, and the standard one when it did not', () => {
    const { rerender } = render(<SaveAsPracticeSheet {...practice({ reason: 'The Fall qualifier has already been completed.' })} />);
    expect(code('CH-11516')).toHaveTextContent('The Fall qualifier has already been completed. Your round and every shot are saved.');
    rerender(<SaveAsPracticeSheet {...practice({ reason: null })} />);
    expect(code('CH-11516')).toHaveTextContent(`${QUALIFIER_CLOSED_REASON} Your round and every shot are saved.`);
  });

  it('CH-11516 draws Save for later and Discard only when the parent can do them', () => {
    render(<SaveAsPracticeSheet {...practice({ onSaveForLater: undefined, onDiscard: undefined })} />);
    expect(button(/^Save as practice round/)).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Save for later/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Discard/ })).toBeNull();
  });

  it('CH-11516 closed, it draws nothing', () => {
    render(<SaveAsPracticeSheet {...practice({ open: false })} />);
    expect(code('CH-11516')).not.toHaveAttribute('open');
    expect(screen.queryByRole('button', { name: /^Save as practice round/ })).toBeNull();
  });

  it('CH-11516 the close button and Esc mean Go back', async () => {
    const user = userEvent.setup();
    const p = practice();
    render(<SaveAsPracticeSheet {...p} />);
    await user.click(button('Close'));
    expect(p.onGoBack).toHaveBeenCalledTimes(1);
  });

  it('CH-11516 while a write runs it is named, every choice waits, and the sheet will not close', async () => {
    const user = userEvent.setup();
    const p = practice({ pending: 'practice' });
    const { rerender } = render(<SaveAsPracticeSheet {...p} />);
    expect(button(/^Saving as practice…/)).toBeDisabled();
    expect(button(/^Save for later/)).toBeDisabled();
    expect(button(/^Go back/)).toBeDisabled();
    expect(button(/^Discard round/)).toBeDisabled();
    await user.click(button('Close'));
    expect(p.onGoBack).not.toHaveBeenCalled();
    rerender(<SaveAsPracticeSheet {...p} pending="save" />);
    expect(button(/^Saving…/)).toBeDisabled();
  });

  it('CH-11517 CH-11708 Discard round asks first; the warning fires on the second tap, before onDiscard', async () => {
    const user = userEvent.setup();
    const p = practice();
    render(<SaveAsPracticeSheet {...p} />);
    await user.click(button(/^Discard round/));
    expect(code('CH-11517')).toHaveTextContent('Discard this round?');
    expect(code('CH-11517')).toHaveTextContent('It deletes every shot you entered. This can’t be undone.');
    expect(p.onDiscard).not.toHaveBeenCalled();
    expect(ticks('warning')).toBe(0);
    await user.click(within(code('CH-11517')!).getByRole('button', { name: 'Discard round' }));
    hapticBefore('warning', p.onDiscard);
  });

  it('CH-11517 Keep it goes back to the choices, and deletes nothing', async () => {
    const user = userEvent.setup();
    const p = practice();
    render(<SaveAsPracticeSheet {...p} />);
    await user.click(button(/^Discard round/));
    await user.click(button('Keep it'));
    expect(code('CH-11517')).toBeNull();
    expect(button(/^Save as practice round/)).toBeEnabled();
    expect(p.onDiscard).not.toHaveBeenCalled();
  });

  it('CH-11012 CH-11709 a failed change to practice shows on the sheet, in words, with the error haptic', () => {
    const p = practice();
    const { rerender } = render(<SaveAsPracticeSheet {...p} error="retry" />);
    expect(code('CH-11012')).toHaveTextContent('Couldn’t change this round to practice. That save did not go through. Your shots are still on this device. Please try again.');
    expect(ticks('error')).toBe(1);
    expect(button(/^Save as practice round/)).toBeEnabled();
    rerender(<SaveAsPracticeSheet {...p} error="Something broke: {stack}" />);
    expect(code('CH-11012')).toHaveTextContent('Couldn’t change this round to practice. Your round is still saved. Try again in a moment.');
    expect(ticks('error')).toBe(2);
  });
});

// ── Save for later and Discard: the failures ──

function Failures({ run }: { run: () => void }) {
  const fail = useEntryFailureToast();
  return (
    <>
      <button type="button" onClick={() => fail('save-for-later', { course: 'Finley GC', reason: 'busy', run })}>
        fail save
      </button>
      <button type="button" onClick={() => fail('discard-round', { course: 'Finley GC', reason: 'This round can no longer be discarded. It was already finished.', run })}>
        fail discard
      </button>
      <button type="button" onClick={() => fail('discard-round', { run })}>
        fail discard plainly
      </button>
      <button type="button" onClick={() => fail('round-updated', { run })}>
        fail updated
      </button>
    </>
  );
}

describe('Failures with no dialog to hold them', () => {
  const show = (run = vi.fn()) => {
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <Failures run={run} />
        </ToastProvider>
      </LazyMotion>,
    );
    return { run, user: userEvent.setup() };
  };

  it('CH-11010 CH-11709 a failed Save for later toasts what failed, the reason in words, and Retry runs again', async () => {
    const { run, user } = show();
    await user.click(button('fail save'));
    await waitFor(() => expect(code('CH-11010')).not.toBeNull());
    expect(code('CH-11010')).toHaveAttribute('role', 'alert');
    expect(code('CH-11010')).toHaveTextContent('Couldn’t save your round at Finley GC');
    expect(code('CH-11010')).toHaveTextContent('Another save for this round is just finishing. Try again in a moment.');
    expect(code('CH-11010')?.textContent).not.toMatch(/\bbusy\./);
    expect(ticks('error')).toBe(1);
    await user.click(within(code('CH-11010')!).getByRole('button', { name: 'Retry' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('CH-11011 a failed Discard says the action’s own reason when it is readable, and what to do next when it is not', async () => {
    const { run, user } = show();
    await user.click(button('fail discard'));
    await waitFor(() => expect(code('CH-11011')).not.toBeNull());
    expect(code('CH-11011')).toHaveTextContent('Couldn’t discard the round at Finley GC');
    expect(code('CH-11011')).toHaveTextContent('This round can no longer be discarded. It was already finished.');
    await user.click(within(code('CH-11011')!).getByRole('button', { name: 'Retry' }));
    expect(run).toHaveBeenCalledTimes(1);
    await user.click(button('fail discard plainly'));
    await waitFor(() => expect(screen.getAllByText('Couldn’t discard the round').length).toBe(1));
    expect(screen.getByText('It is still saved. Try again, or keep playing.')).toBeInTheDocument();
  });

  it('CH-11902 a save refused because the round changed elsewhere offers Reload, not Retry', async () => {
    const { run, user } = show();
    await user.click(button('fail updated'));
    await waitFor(() => expect(code('CH-11902')).not.toBeNull());
    expect(code('CH-11902')).toHaveTextContent('This round was updated on another device');
    expect(within(code('CH-11902')!).queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.click(within(code('CH-11902')!).getByRole('button', { name: 'Reload' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('CH-11010 CH-11011 CH-11902 the toast is useAction’s shape: an error tone, a code and an action', () => {
    const run = vi.fn();
    for (const [kind, c, label] of [
      ['save-for-later', 'CH-11010', 'Retry'],
      ['discard-round', 'CH-11011', 'Retry'],
      ['round-updated', 'CH-11902', 'Reload'],
    ] as const) {
      const t = entryFailureToast(kind, { run });
      expect(t).toMatchObject({ tone: 'error', code: c, action: { label } });
      expect(t.title).not.toMatch(/ at /);
      expect(t.body).toBeTruthy();
      t.action?.run();
    }
    expect(run).toHaveBeenCalledTimes(3);
    expect(entryFailureToast('save-for-later', { course: '  ', run }).title).toBe('Couldn’t save your round');
  });
});

// ── The board's own pieces ──

describe('Round entry is drawn in the exit sheet’s pieces (rounds-track.jsx)', () => {
  const rows = () => Array.from(document.querySelectorAll('.ch-rt-exit__opts > .ch-rt-xopt'));

  it('CH-11512 CH-11514 CH-11516 each sheet is the round card and option rows with one primary, each with an icon, a label and a line', () => {
    const { unmount } = render(<RecoveryDialog {...recovery()} />);
    expect(card()).not.toBeNull();
    expect(rows().map((r) => r.className)).toEqual(['ch-rt-xopt is-primary', 'ch-rt-xopt is-danger']);
    unmount();
    const c = render(<InProgressConflictDialog {...conflict()} />);
    expect(card()).not.toBeNull();
    expect(rows().map((r) => r.className)).toEqual(['ch-rt-xopt is-primary', 'ch-rt-xopt', 'ch-rt-xopt is-danger']);
    c.unmount();
    render(<SaveAsPracticeSheet {...practice()} />);
    expect(rows().map((r) => r.className)).toEqual(['ch-rt-xopt is-primary', 'ch-rt-xopt', 'ch-rt-xopt', 'ch-rt-xopt is-danger']);
    for (const r of rows()) {
      expect(r.querySelector('svg')).not.toBeNull();
      expect(r.querySelector('b')?.textContent).toBeTruthy();
      expect(r.querySelector('em')?.textContent).toBeTruthy();
    }
  });

  it('CH-11513 CH-11515 CH-11517 the discard question is the exit sheet’s, in place of the rows', async () => {
    const user = userEvent.setup();
    render(<SaveAsPracticeSheet {...practice()} />);
    await user.click(button(/^Discard round/));
    expect(code('CH-11517')).toHaveClass('ch-rt-confirm', 'ch-rt-confirm--danger');
    expect(rows()).toHaveLength(0);
  });

  it('CH-11902 CH-11013 the banners are the shot screen’s note with an action: amber to reload, red for an error', () => {
    const { unmount } = render(<ReloadBanner onReload={vi.fn()} />);
    expect(code('CH-11902')).toHaveClass('ch-rt-note', 'is-warn');
    expect(code('CH-11902')?.querySelector('b')).toHaveTextContent('This round was updated on another device.');
    unmount();
    render(<RoundErrorBanner message="Hole 4 didn’t save." onDismiss={vi.fn()} />);
    expect(code('CH-11013')).toHaveClass('ch-rt-note', 'is-danger');
  });
});

// ── Words ──

describe('Round entry words', () => {
  it('CH-11512 CH-11514 says how long ago in the units the legacy prompts used', () => {
    expect([30, 59, 60, 5 * 60, 59 * 60, 3600, 2 * 3600, 23 * 3600, 86_400, 3 * 86_400].map((s) => ago(NOW - s * 1000, NOW))).toEqual([
      'just now',
      'just now',
      '1 min ago',
      '5 min ago',
      '59 min ago',
      '1h ago',
      '2h ago',
      '23h ago',
      '1d ago',
      '3d ago',
    ]);
    expect(ago(new Date(NOW - 2 * 3600_000).toISOString(), NOW)).toBe('2h ago');
    expect(ago(NOW + MIN, NOW)).toBe('just now');
    expect([ago(null, NOW), ago(undefined, NOW), ago('not a time', NOW)]).toEqual([null, null, null]);
  });

  it('CH-11512 CH-11514 the card’s facts line reads like the Library card and skips what it does not know', () => {
    expect(factsLine({ tees: 'Blue', type: 'practice', when: 'saved 5 min ago' })).toBe('Blue tees · Practice · saved 5 min ago');
    expect(factsLine({ lead: 'In progress', when: 'updated 2h ago' })).toBe('In progress · updated 2h ago');
    expect(factsLine({ lead: 'Shots on a hole in progress', tees: '  ', type: null, when: null })).toBe('Shots on a hole in progress');
    expect(factsLine({})).toBeNull();
    expect([typeLabel('practice'), typeLabel('Tournament'), typeLabel('QUALIFIER'), typeLabel('scramble'), typeLabel(' '), typeLabel(null)]).toEqual(['Practice', 'Tournament', 'Qualifier', 'Scramble', null, null]);
  });

  it('CH-11008 CH-11009 CH-11010 a bare signal key is never shown; a readable sentence is; a technical one is dropped', () => {
    expect(reasonText('busy')).toBe('Another save for this round is just finishing. Try again in a moment.');
    expect(reasonText('conflict')).toMatch(/updated on another device/);
    // The longest legacy sentence (over friendlyReason's 140 characters) survives whole.
    expect(reasonText('round_missing')).toBe('This round is no longer on the server and could not be re-created yet. Every hole is still saved on this device. Check your connection and try again.');
    expect(reasonText('It was already finished')).toBe('It was already finished.');
    expect(reasonText('PGRST116: The result contains 0 rows')).toBeNull();
    expect([reasonText(''), reasonText('   '), reasonText(null), reasonText(undefined)]).toEqual([null, null, null, null]);
  });
});
