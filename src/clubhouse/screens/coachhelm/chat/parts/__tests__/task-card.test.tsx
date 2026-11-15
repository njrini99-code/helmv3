import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskProposalView } from '../../../../../data/coachhelm-chat-thread';
import { TaskCard } from '../TaskCard';
import { phaseOfReceipt } from '../ConfirmCard';
import { capTask } from '../../../../../preview/fixtures-chat-capabilities';

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../../../lib/haptics', () => ({ haptic: hapticSpy, hapticScrub: vi.fn() }));

const proposal = (): AskProposalView['proposal'] => ({ action: 'Create focus area', summary: 'Give Jonah Okafor a focus area on downhill putts.', facts: [{ label: 'Player', value: 'Jonah Okafor' }, { label: 'Focus', value: 'Downhill putts, 4 to 6 feet' }], affects: [{ kind: 'player', id: 'p-jonah', label: 'Jonah Okafor' }], notifications: ['Jonah gets a notification.'], missing: [], idempotency_key: 'k' });
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
  it('arrives whole: the body, the one quiet line and both buttons are there with the card, and Confirm answers once', () => {
    const onApprove = vi.fn();
    show(view(), { fresh: true, onApprove });
    expect(card().classList.contains('is-arriving')).toBe(true);
    expect(card().dataset.phase).toBe('proposed');
    expect(card().querySelector('.ch-ak-task__body')).not.toBeNull();
    // The card is the thing itself: who it is for, then the focus as its title. Who is told and where it appears is ONE quiet line
    // under the body's rule, and there is no chip, no bold reach sentence, no table of fields and no "On confirm" row (owner, 11 Nov).
    expect(card().querySelector('.ch-akc-who')?.textContent).toBe('JOJonah Okafor');
    expect(card().querySelector('.ch-akc-thing__t')?.textContent).toBe('Downhill putts, 4 to 6 feet');
    expect(card().querySelectorAll('.ch-akc-told').length).toBe(1);
    // The planner's own sentence ends once (it brings its own full stop), then where it appears, then that the wording is not shown.
    expect(card().querySelector('.ch-akc-told')?.textContent).toBe('Jonah gets a notification. It appears in Home, under Focus. The exact wording is not shown here.');
    expect(card().querySelector('.oncf, .ch-akc-reach, .ch-akc-nowords, .ch-akc-rows')).toBeNull();
    expect(card().querySelector('[data-ch-ask-cancel]')?.textContent).toBe('Not now');
    expect(screen.queryByText(/On confirm/)).toBeNull();
    expect(card().querySelector('.hd .ico')).toBeNull();
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

  it('says "Cancel" nowhere: the quiet key is "Not now", or the task\'s own word where setting it aside needs saying', () => {
    show(planned('cancel_event'));
    expect(card().querySelector('[data-ch-ask-cancel]')?.textContent).toBe('Keep the event');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});

/** A card the server built (the capability gallery's own plan), waiting. Its approval id is its key. */
const planned = (tool: string, over: Partial<AskProposalView> = {}): AskProposalView => {
  const cap = capTask(tool)!;
  return { key: cap.proposal.idempotency_key, tool, proposal: cap.proposal, approvalId: cap.proposal.idempotency_key, status: 'live', receipt: null, ...over };
};

describe('the task card shell · the behaviours that reach the server', () => {
  it('edit mode: offered only when the shell can send it, holds Confirm while the form is open, sends the approval id with only what changed', () => {
    show(planned('create_task'));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    cleanup();

    const v = planned('create_task');
    const onEdit = vi.fn();
    const onEditOpen = vi.fn();
    const again = (more: Partial<Parameters<typeof TaskCard>[0]> = {}, next = v) => rerender(<TaskCard view={next} onApprove={vi.fn()} onDeny={vi.fn()} onEdit={onEdit} onEditOpen={onEditOpen} {...more} />);
    const { rerender } = show(v, { onEdit, onEditOpen });
    const confirm = () => card().querySelector<HTMLButtonElement>('[data-ch-ask-confirm]')!;
    expect(confirm().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditOpen).toHaveBeenLastCalledWith(v.key, true);
    // What is on screen is not what would be confirmed, so Confirm waits and says why.
    expect(confirm().disabled).toBe(true);
    expect(screen.getByText('Update or discard your changes first.')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Post your Ridgeline practice round hole by hole'), { target: { value: 'Post your Ridgeline round tonight' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update the card' }));
    expect(onEdit).toHaveBeenCalledWith(v.approvalId, { title: 'Post your Ridgeline round tonight' });

    // With the server: the form is still and the line under it says so.
    again({ busy: true });
    expect(screen.getByText('Updating the card…', { selector: '.ch-ak-needs' })).toBeTruthy();
    // Refused: the server's sentence, the card unchanged, what was typed kept, Confirm still waiting.
    again({ busy: false, revision: { accepted: false, reason: 'Task: Too long.' } });
    expect(screen.getByRole('alert').textContent).toContain('Task: Too long.');
    expect(screen.getByDisplayValue('Post your Ridgeline round tonight')).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    // Accepted: the re-planned card replaces this one, the form closes, and Confirm answers again.
    const replanned = { ...v, proposal: Object.assign({ ...v.proposal }, { revision: 1 }) };
    again({ busy: false, revision: { accepted: true } }, replanned);
    expect(screen.queryByRole('button', { name: 'Update the card' })).toBeNull();
    expect(onEditOpen).toHaveBeenLastCalledWith(v.key, false);
    expect(confirm().disabled).toBe(false);
  });

  it('a refusal from an earlier edit is not shown on a form opened afresh', () => {
    const v = planned('create_task');
    show(v, { onEdit: vi.fn(), revision: { accepted: false, reason: 'Task: Too long.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a card that went out of date says so and offers Ask again, never Try again', () => {
    const cap = capTask('update_event')!;
    const onSend = vi.fn();
    show(planned('update_event', { status: 'confirmed', receipt: cap.failed }), { onSend });
    expect(card().dataset.phase).toBe('failed');
    expect(card().querySelector('.dchip')?.textContent).toBe('Out of date');
    expect(screen.getByText('This card is out of date')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]![0]).toContain(cap.proposal.summary);
  });

  it('a failure that can be repeated keeps Try again', () => {
    const onSend = vi.fn();
    show(view({ status: 'confirmed', receipt: receipt({ status: 'failed', summary: 'The focus area was not created.', error: 'network' }) }), { onSend });
    expect(card().querySelector('.dchip')?.textContent).toBe('Failed');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull();
  });

  it('"Save now and open" hands the shell the saved receipt and the address, and loads no page', async () => {
    const saved = receipt({ created: [{ kind: 'focus area', count: 1, href: '/golf/dashboard/calendar?event=ev-1', id: 'row-1' }] });
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ receipt: saved }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetchSpy);
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const onOpenReceipt = vi.fn();
    const v = view({ status: 'confirmed', receipt: held() });
    show(v, { onOpenReceipt });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save now and open/ }));
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/coachhelm/v3/chat/actions/k?now=1', { method: 'POST' });
    expect(onOpenReceipt).toHaveBeenCalledTimes(1);
    expect(onOpenReceipt).toHaveBeenCalledWith(v, expect.objectContaining({ status: 'completed' }), expect.stringContaining('/golf/dashboard/calendar'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('undone with its batch: the signal presses the card\'s own Undo once', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    const v = view({ status: 'confirmed', receipt: held() });
    const { rerender } = show(v, { undoSignal: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      rerender(<TaskCard view={v} onApprove={vi.fn()} onDeny={vi.fn()} undoSignal={1} />);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/coachhelm/v3/chat/actions/k', { method: 'DELETE' });
    expect(card().dataset.phase).toBe('undone');
  });
});
