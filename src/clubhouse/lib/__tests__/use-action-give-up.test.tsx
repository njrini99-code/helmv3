import { act, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-31: a save still out after 20 seconds turns "Still saving…" (CH-1902) into "This is taking longer than usual"
 * with Cancel (CH-1990). Cancel stops waiting: the button is free again and what was typed stays. Closing the notice
 * keeps waiting. A late answer is still told.
 */

vi.mock('../haptics', () => ({ haptic: vi.fn() }));
vi.mock('../track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { CH_SLOW_SAVE_AFTER, CH_SLOW_SAVE_GIVE_UP, useAction, type ActionResult } from '../use-action';
import { ToastProvider } from '../../ui/Toast';

/** A notice on screen; one leaving (inert, mid exit) no longer counts. */
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]:not([inert])`);

function Form({ save, onResult }: { save: (text: string) => Promise<{ success: boolean }>; onResult: (r: ActionResult) => void }) {
  const [text, setText] = useState('Bring the yardage book');
  const a = useAction('test.save', save, { done: 'Note saved', failed: 'Couldn’t save the note', code: 'CH-8001' });
  return (
    <>
      <input aria-label="Note" value={text} onChange={(e) => setText(e.target.value)} />
      <button
        type="button"
        disabled={a.pending}
        onClick={async () => {
          const r = await a.run(text);
          // As a form does: it clears only on success, so a failed or cancelled save keeps what was typed.
          if (r.success) setText('');
          onResult(r);
        }}
      >
        Save
      </button>
    </>
  );
}

function mount(save: (text: string) => Promise<{ success: boolean }>, onResult = vi.fn()) {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Form save={save} onResult={onResult} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return onResult;
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('Slow saves give up (GAP-S-31)', () => {
  it('CH-1990 after 20 seconds the save offers Cancel, and Cancel stops waiting without losing what was typed', async () => {
    let answer: (v: { success: boolean }) => void = () => {};
    const save = vi.fn(() => new Promise<{ success: boolean }>((r) => (answer = r)));
    const onResult = mount(save);
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_AFTER + 10));
    expect(code('CH-1902')?.textContent).toMatch(/Still saving/);
    expect(code('CH-1990')).toBeNull();
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_GIVE_UP - CH_SLOW_SAVE_AFTER));
    const giveUp = code('CH-1990');
    expect(giveUp?.textContent).toMatch(/This is taking longer than usual/);
    expect(giveUp?.textContent).toMatch(/You can keep waiting, or cancel\. Your changes are kept\./);
    // Never two slow notices at once.
    expect(code('CH-1902')).toBeNull();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => screen.getByRole('button', { name: 'Cancel' }).click());
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ success: false, error: 'cancelled' }));
    expect(code('CH-1990')).toBeNull();
    expect(code('CH-1590')?.textContent).toMatch(/Stopped waiting/);
    // The button is free again and the note is still there.
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('textbox', { name: 'Note' }) as HTMLInputElement).value).toBe('Bring the yardage book');
    // No failure was claimed for a save that may still land.
    expect(code('CH-8001')).toBeNull();

    // It lands after all: that is said too.
    await act(async () => answer({ success: true }));
    await screen.findByText('Note saved');
  });

  it('CH-1590 a second Save while the stopped save is still out is not sent twice: it says so, and works once that answers', async () => {
    let answer: (v: { success: boolean }) => void = () => {};
    const save = vi.fn(() => new Promise<{ success: boolean }>((r) => (answer = r)));
    const onResult = mount(save);
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_GIVE_UP + 10));
    await act(async () => screen.getByRole('button', { name: 'Cancel' }).click());
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ success: false, error: 'cancelled' }));

    await act(async () => screen.getByRole('button', { name: 'Save' }).click());
    expect(save).toHaveBeenCalledTimes(1);
    expect(code('CH-1590')?.textContent).toMatch(/Your last save hasn’t answered yet/);

    await act(async () => answer({ success: false }));
    await waitFor(() => expect(code('CH-8001')).not.toBeNull());
    await act(async () => screen.getByRole('button', { name: 'Save' }).click());
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('closing the notice keeps waiting: the save goes on and its answer is told as usual', async () => {
    let answer: (v: { success: boolean }) => void = () => {};
    const onResult = mount(() => new Promise<{ success: boolean }>((r) => (answer = r)));
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_GIVE_UP + 10));
    expect(code('CH-1990')).not.toBeNull();
    await act(async () => (code('CH-1990')!.querySelector('[aria-label="Dismiss notification"]') as HTMLButtonElement).click());
    await waitFor(() => expect(code('CH-1990')).toBeNull());
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    // Still out after as long again: it offers Cancel again.
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_GIVE_UP + 10));
    expect(code('CH-1990')).not.toBeNull();
    await act(async () => answer({ success: true }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ success: true, data: undefined }));
    await waitFor(() => expect(code('CH-1990')).toBeNull());
    expect(screen.getByText('Note saved')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Note' }) as HTMLInputElement).value).toBe('');
  });

  it('a save that answers before 20 seconds never offers Cancel', async () => {
    let answer: (v: { success: boolean }) => void = () => {};
    mount(() => new Promise<{ success: boolean }>((r) => (answer = r)));
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_GIVE_UP - 1000));
    await act(async () => answer({ success: true }));
    await screen.findByText('Note saved');
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_GIVE_UP * 2));
    expect(code('CH-1990')).toBeNull();
  });
});
