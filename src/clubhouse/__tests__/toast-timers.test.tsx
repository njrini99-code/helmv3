import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { useEffect, useLayoutEffect } from 'react';
import { ToastProvider, useDelayedToast, useToast, type ToastInput } from '../ui/Toast';

/**
 * A toast's dismiss timer outlived its provider: on CI (#2110) a roster test's
 * toast fired setState after the test environment was torn down
 * ("window is not defined"). The provider now clears its timers on unmount.
 */

function Fire() {
  const toast = useToast();
  useEffect(() => {
    toast({ title: 'Saved' });
  }, [toast]);
  return null;
}

function Raise({ input }: { input: ToastInput }) {
  const toast = useToast();
  useEffect(() => toast(input), [input, toast]);
  return null;
}

function Delayed({ capture }: { capture: (schedule: ReturnType<typeof useDelayedToast>) => void }) {
  const schedule = useDelayedToast();
  useEffect(() => capture(schedule), [capture, schedule]);
  return null;
}

function ToastButton() {
  const toast = useToast();
  return <button onClick={() => toast({ title: 'Saved' })}>Confirm</button>;
}

function CaptureToast({ capture }: { capture: (show: ReturnType<typeof useToast>) => void }) {
  const show = useToast();
  useEffect(() => capture(show), [capture, show]);
  return null;
}

function LayoutFeedback({ signal }: { signal: AbortSignal }) {
  const show = useToast();
  const delayed = useDelayedToast();
  useLayoutEffect(() => {
    show({ title: 'Immediate scope feedback', signal });
    delayed({ title: 'Delayed scope feedback' }, 5000);
  }, [show, delayed, signal]);
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider timers', () => {
  it('old scope cleanup cannot cancel feedback registered by a new scope layout effect', () => {
    vi.useFakeTimers();
    const old = new AbortController();
    const next = new AbortController();
    const removeNext = vi.spyOn(next.signal, 'removeEventListener');
    const view = render(<ToastProvider scope="old"><LayoutFeedback signal={old.signal} /></ToastProvider>);
    expect(vi.getTimerCount()).toBe(2);
    view.rerender(<ToastProvider scope="new"><LayoutFeedback signal={next.signal} /></ToastProvider>);
    // The new-scope toast timer, abort listener and delayed notice survive old-scope passive cleanup.
    expect(vi.getTimerCount()).toBe(2);
    expect(removeNext).not.toHaveBeenCalled();
    act(() => old.abort());
    expect(screen.getByText('Immediate scope feedback')).toBeTruthy();
    act(() => next.abort());
    expect(screen.queryByText('Immediate scope feedback')).toBeNull();
    expect(removeNext).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Delayed scope feedback')).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText('Delayed scope feedback')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('scope change cancels scheduled feedback on a still-mounted helper and new scope feedback works', () => {
    vi.useFakeTimers();
    let schedule!: ReturnType<typeof useDelayedToast>;
    const capture = (fn: typeof schedule) => { schedule = fn; };
    const view = render(<ToastProvider scope="old"><Delayed capture={capture} /></ToastProvider>);
    const staleSchedule = schedule;
    act(() => { schedule({ title: 'Old pending request' }, 5000); });
    expect(vi.getTimerCount()).toBe(1);
    // Delayed is not unmounted or keyed by the team: its context must end the prior scope's timer.
    view.rerender(<ToastProvider scope="new"><Delayed capture={capture} /></ToastProvider>);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { staleSchedule({ title: 'Late old request' }, 5000); });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5001));
    expect(screen.queryByText('Old pending request')).toBeNull();
    expect(screen.queryByText('Late old request')).toBeNull();
    let cancel!: () => void;
    act(() => { cancel = schedule({ title: 'New request' }, 5000); });
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('New request')).toBeTruthy();
    act(() => cancel());
    expect(screen.queryByText('New request')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an old ShowToast callback cannot repopulate another team or affect its current notice', () => {
    vi.useFakeTimers();
    let show!: ReturnType<typeof useToast>;
    const capture = (fn: typeof show) => { show = fn; };
    const view = render(<ToastProvider scope="old"><CaptureToast capture={capture} /></ToastProvider>);
    const oldShow = show;
    act(() => oldShow({ title: 'Old confirmation' }));
    view.rerender(<ToastProvider scope="new"><CaptureToast capture={capture} /></ToastProvider>);
    expect(screen.queryByText('Old confirmation')).toBeNull();
    act(() => show({ title: 'New confirmation' }));
    act(() => oldShow({ title: 'Late old failure', tone: 'error' }));
    expect(screen.queryByText('Late old failure')).toBeNull();
    expect(screen.getByText('New confirmation')).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
    // Returning to a team is a new scope lifetime, not permission for its earlier callbacks to revive.
    view.rerender(<ToastProvider scope="old"><CaptureToast capture={capture} /></ToastProvider>);
    act(() => oldShow({ title: 'Stale first visit' }));
    expect(screen.queryByText('Stale first visit')).toBeNull();
    act(() => show({ title: 'Current return' }));
    expect(screen.getByText('Current return')).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps confirmations for 4 seconds and errors for 8 seconds', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Raise input={{ title: 'Confirmed' }} /><Raise input={{ title: 'Failed', tone: 'error' }} /></ToastProvider>);
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Failed')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abort removes only its visible notice and releases its timer and listener', () => {
    vi.useFakeTimers();
    const old = new AbortController();
    const current = new AbortController();
    const removeOld = vi.spyOn(old.signal, 'removeEventListener');
    const removeCurrent = vi.spyOn(current.signal, 'removeEventListener');
    render(<ToastProvider><Raise input={{ title: 'Old request', signal: old.signal }} /><Raise input={{ title: 'Current request', signal: current.signal }} /></ToastProvider>);
    expect(vi.getTimerCount()).toBe(2);
    act(() => old.abort());
    expect(screen.queryByText('Old request')).toBeNull();
    expect(screen.getByText('Current request')).toBeTruthy();
    expect(removeOld).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeCurrent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    // A late repeat of the prior cancellation cannot remove the newer notice.
    act(() => old.abort());
    expect(screen.getByText('Current request')).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(removeCurrent).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an already ended lifetime never creates a notice or timer', () => {
    vi.useFakeTimers();
    const ended = new AbortController();
    ended.abort();
    const add = vi.spyOn(ended.signal, 'addEventListener');
    render(<ToastProvider><Raise input={{ title: 'Obsolete', signal: ended.signal }} /></ToastProvider>);
    expect(screen.queryByText('Obsolete')).toBeNull();
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('eviction, scope replacement and provider unmount release listeners and timers', () => {
    vi.useFakeTimers();
    const signals = Array.from({ length: 4 }, () => new AbortController());
    const removes = signals.map((c) => vi.spyOn(c.signal, 'removeEventListener'));
    const view = render(<ToastProvider scope="old">{signals.map((c, i) => <Raise key={i} input={{ title: `Notice ${i}`, signal: c.signal }} />)}</ToastProvider>);
    expect(screen.queryByText('Notice 0')).toBeNull();
    expect(removes[0]).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(3);
    view.rerender(<ToastProvider scope="new">{null}</ToastProvider>);
    for (const remove of removes) expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    const latest = new AbortController();
    const removeLatest = vi.spyOn(latest.signal, 'removeEventListener');
    view.rerender(<ToastProvider scope="new"><Raise input={{ title: 'Latest', signal: latest.signal }} /></ToastProvider>);
    expect(screen.getByText('Latest')).toBeTruthy();
    view.unmount();
    expect(removeLatest).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('delayed feedback cancels before threshold and after showing, and rejects stale unmounted scheduling', () => {
    vi.useFakeTimers();
    let schedule!: ReturnType<typeof useDelayedToast>;
    const capture = (fn: typeof schedule) => { schedule = fn; };
    const view = render(<ToastProvider><Delayed capture={capture} /></ToastProvider>);
    let cancel!: () => void;
    act(() => { cancel = schedule({ title: 'Never shown' }, 5000); });
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.queryByText('Never shown')).toBeNull();
    act(() => cancel());
    expect(vi.getTimerCount()).toBe(0);
    act(() => { cancel = schedule({ title: 'Still working' }, 5000); });
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Still working')).toBeTruthy();
    act(() => cancel());
    expect(screen.queryByText('Still working')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => { schedule({ title: 'Left behind' }, 5000); });
    view.rerender(<ToastProvider>{null}</ToastProvider>);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { schedule({ title: 'Stale queued work' }, 5000); });
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText('Stale queued work')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dismisses after its delay while mounted', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending dismiss timers when it unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new scope (a team switch) clears the old stack; the same scope keeps it', async () => {
    const { rerender } = render(
      <ToastProvider scope="t-men">
        <ToastButton />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Confirm' }).click());
    expect(screen.getByText('Saved')).toBeTruthy();
    rerender(
      <ToastProvider scope="t-men">
        <ToastButton />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeTruthy();
    rerender(
      <ToastProvider scope="t-women">
        <ToastButton />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull());
  });
});

describe('Toast onExpire, replace and dismiss (wave 5)', () => {
  it('onExpire runs once when the clock runs out, waits while hovered, and never runs for the action or a cleared stack', () => {
    vi.useFakeTimers();
    let show!: ReturnType<typeof useToast>;
    const capture = (fn: typeof show) => { show = fn; };
    const view = render(<ToastProvider scope="a"><CaptureToast capture={capture} /></ToastProvider>);
    const expired = vi.fn();
    act(() => show({ title: 'Moved', action: { label: 'Undo', run: () => {} }, onExpire: expired }));
    const card = screen.getByText('Moved').closest('.ch-toast')!;
    fireEvent.pointerOver(card, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(20_000));
    expect(expired).not.toHaveBeenCalled();
    fireEvent.pointerOut(card, { pointerType: 'mouse', relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(4000));
    expect(expired).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(20_000));
    expect(expired).toHaveBeenCalledTimes(1);

    const undone = vi.fn();
    const notExpired = vi.fn();
    act(() => show({ title: 'Moved again', action: { label: 'Undo', run: undone }, onExpire: notExpired }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(undone).toHaveBeenCalledTimes(1);
    expect(notExpired).not.toHaveBeenCalled();

    const cleared = vi.fn();
    act(() => show({ title: 'Old team move', onExpire: cleared }));
    view.rerender(<ToastProvider scope="b"><CaptureToast capture={capture} /></ToastProvider>);
    act(() => vi.advanceTimersByTime(20_000));
    view.unmount();
    expect(cleared).not.toHaveBeenCalled();
  });

  it('CH-1910 a notice pushed out of the stack or replaced by its key expires; the replacement takes its place', () => {
    vi.useFakeTimers();
    let show!: ReturnType<typeof useToast>;
    const capture = (fn: typeof show) => { show = fn; };
    render(<ToastProvider><CaptureToast capture={capture} /></ToastProvider>);
    const first = vi.fn();
    const muted = vi.fn();
    act(() => show({ title: 'First', onExpire: first }));
    act(() => show({ title: 'Conversation muted', replace: 'mute', onExpire: muted }));
    act(() => show({ title: 'Notifications back on', replace: 'mute' }));
    expect(muted).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Conversation muted')).toBeNull();
    expect(screen.getByText('Notifications back on')).toBeTruthy();
    expect(first).not.toHaveBeenCalled();
    act(() => show({ title: 'Second' }));
    act(() => show({ title: 'Third' }));
    // Four notices: the oldest leaves, and its held work commits.
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('First')).toBeNull();
    expect(vi.getTimerCount()).toBe(3);
    // Once the keyed notice has gone, the key names nothing: a later one with it stacks normally.
    act(() => vi.advanceTimersByTime(4000));
    act(() => show({ title: 'Conversation muted', replace: 'mute' }));
    expect(screen.getByText('Conversation muted')).toBeTruthy();
  });

  it('CH-1817 the Dismiss X and Esc (focus inside) close it, expire it, and only it: Esc never reaches the dialog under it', () => {
    vi.useFakeTimers();
    let show!: ReturnType<typeof useToast>;
    const capture = (fn: typeof show) => { show = fn; };
    const outerKey = vi.fn();
    render(
      <div onKeyDown={(e) => outerKey(e.key)}>
        <button type="button">Before</button>
        <ToastProvider><CaptureToast capture={capture} /></ToastProvider>
      </div>,
    );
    const viaX = vi.fn();
    act(() => show({ title: 'Saved', onExpire: viaX }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(viaX).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Saved')).toBeNull();

    const viaEsc = vi.fn();
    act(() => show({ title: 'Moved', action: { label: 'Undo', run: () => {} }, onExpire: viaEsc }));
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => undo.focus());
    fireEvent.keyDown(undo, { key: 'Escape' });
    expect(viaEsc).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Moved')).toBeNull();
    expect(outerKey).not.toHaveBeenCalled();
    // Focus goes back where it came from, not to the page's body.
    expect(document.activeElement).toBe(before);
  });
});
