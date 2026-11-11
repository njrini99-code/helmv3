import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskProposalView } from '../../../../../data/coachhelm-chat-thread';
import { TaskCard } from '../TaskCard';
import { phaseOfReceipt } from '../ConfirmCard';

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../../../lib/haptics', () => ({ haptic: hapticSpy, hapticScrub: vi.fn() }));

const proposal = (): AskProposalView['proposal'] => ({ action: 'Create focus area', summary: 'Give Jonah Okafor a focus area on downhill putts.', facts: [{ label: 'Player', value: 'Jonah Okafor' }], affects: [{ kind: 'player', id: 'p-jonah', label: 'Jonah Okafor' }], notifications: ['Jonah gets a notification.'], missing: [], idempotency_key: 'k' });
const view = (over: Partial<AskProposalView> = {}): AskProposalView => ({ key: 'k', tool: 'create_focus_area', proposal: proposal(), approvalId: 'a1', status: 'live', receipt: null, ...over });
const receipt = (over: Partial<ActionReceipt>): ActionReceipt => ({ status: 'completed', action: 'Create focus area', summary: 'Created a focus area for Jonah Okafor.', created: [], notifications: [], partial_failures: [], retryable: false, at: '2026-11-10T12:00:00.000Z', ...over });
const held = () => receipt({ status: 'held', held_until: new Date(Date.now() + 8000).toISOString(), summary: 'Give Jonah Okafor a focus area on downhill putts.' });
const show = (v: AskProposalView, more: Partial<Parameters<typeof TaskCard>[0]> = {}) => render(<TaskCard view={v} onApprove={vi.fn()} onDeny={vi.fn()} {...more} />);
const card = () => document.querySelector<HTMLElement>('.ch-ak-task')!;

beforeEach(() => {
  hapticSpy.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the task card shell (chat v3, SPEC Moment 7)', () => {
  it('arrives whole: the body, the "On confirm" line and both buttons are there with the card, and Confirm answers once', () => {
    const onApprove = vi.fn();
    show(view(), { fresh: true, onApprove });
    expect(card().classList.contains('is-arriving')).toBe(true);
    expect(card().dataset.phase).toBe('proposed');
    expect(card().querySelector('.ch-ak-task__body')).not.toBeNull();
    expect(screen.getByText('Jonah gets a notification.')).toBeTruthy();
    const confirm = card().querySelector<HTMLButtonElement>('[data-ch-ask-confirm]')!;
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith('a1');
    // The pressed button is the thing that is working; Cancel leaves but keeps its box.
    expect(card().dataset.phase).toBe('confirming');
    expect(card().querySelector('.cx.is-gone')).not.toBeNull();
  });

  it('a lost Confirm gives the buttons back (the turn\'s notice offers Try again)', () => {
    const v = view();
    const { rerender } = show(v, { busy: true });
    fireEvent.click(card().querySelector<HTMLButtonElement>('[data-ch-ask-confirm]')!);
    expect(card().dataset.phase).toBe('confirming');
    rerender(<TaskCard view={v} onApprove={vi.fn()} onDeny={vi.fn()} busy={false} />);
    expect(card().dataset.phase).toBe('proposed');
    expect(card().querySelector('[data-ch-ask-confirm]')).not.toBeNull();
  });

  it('while the server holds the write nothing says saved: the ring with the seconds, "Holding", and the phase is reported', () => {
    const onPhase = vi.fn();
    show(view({ status: 'confirmed', receipt: held() }), { onPhase });
    expect(card().dataset.phase).toBe('held');
    expect(screen.getByText('Holding')).toBeTruthy();
    expect(card().querySelector('.receipt .cd .n')?.textContent).toBe('8');
    expect(card().querySelector('.receipt .ck')).toBeNull();
    expect(onPhase).toHaveBeenLastCalledWith('k', 'held', expect.objectContaining({ status: 'held' }));
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
  });

  it('the final receipt arrives on the stream when the hold ends: the ring\'s place takes the check, one success haptic, no poll needed', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const onPhase = vi.fn();
    const first = view({ status: 'confirmed', receipt: held() });
    const { rerender } = show(first, { onPhase, fresh: true });
    const done = receipt({ notifications: [{ channel: 'in-app', recipients: 1, status: 'sent' }] });
    rerender(<TaskCard view={{ ...first, receipt: done }} onApprove={vi.fn()} onDeny={vi.fn()} onPhase={onPhase} fresh />);
    expect(card().dataset.phase).toBe('saved');
    expect(card().querySelector('.receipt.in.is-live .ck')).not.toBeNull();
    expect(card().querySelector('.receipt .cd')).toBeNull();
    expect(onPhase).toHaveBeenLastCalledWith('k', 'saved', expect.objectContaining({ status: 'completed' }));
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'success')).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Undo freezes the hold and reports undone; nothing lands', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
    const onPhase = vi.fn();
    show(view({ status: 'confirmed', receipt: held() }), { onPhase });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    });
    expect(card().dataset.phase).toBe('undone');
    expect(screen.getByText('Undone')).toBeTruthy();
    expect(card().querySelector('.ch-ak-task__body.is-dim')).not.toBeNull();
    expect(onPhase).toHaveBeenLastCalledWith('k', 'undone', expect.anything());
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
  });

  it('a reloaded card the coach had undone (receipt `cancelled`, engine E17) is quiet and final: undone, not saved, no flight, no haptic', () => {
    const cancelled = receipt({ status: 'cancelled', summary: 'Undone. Nothing was written.' });
    expect(phaseOfReceipt(cancelled)).toBe('undone');
    const onPhase = vi.fn();
    show(view({ status: 'confirmed', receipt: cancelled }), { onPhase });
    expect(card().dataset.phase).toBe('undone');
    expect(screen.getByText('Undone')).toBeTruthy();
    expect(card().querySelector('.receipt.undone')).not.toBeNull();
    expect(card().querySelector('.receipt .ck')).toBeNull();
    expect(card().classList.contains('flash')).toBe(false);
    expect(screen.queryByRole('link', { name: /Open/ })).toBeNull();
    expect(onPhase).toHaveBeenLastCalledWith('k', 'undone', expect.anything());
    expect(hapticSpy).not.toHaveBeenCalled();
  });

  it('a card a new question set aside says so, and one the coach cancelled says that', () => {
    show(view({ status: 'abandoned', approvalId: null }));
    expect(card().dataset.phase).toBe('superseded');
    expect(screen.getByText('Set aside when you asked something else. Nothing was created.')).toBeTruthy();
    cleanup();
    show(view({ status: 'cancelled' }));
    expect(card().dataset.phase).toBe('cancelled');
    expect(screen.getByText('Cancelled. Nothing was created.')).toBeTruthy();
  });
});
