import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { chKeepFocusThroughDisable } from '../lib/focus-keeper';

/** Audit A-21: a control disabled while its own write runs gets keyboard focus back when it returns. */
function Rsvp() {
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => setPending(true)}>Going</button>
      <button type="button" onClick={() => setPending(false)}>settle</button>
    </div>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('chKeepFocusThroughDisable', () => {
  it('returns focus to the control when it is enabled again and focus was lost', async () => {
    const { getByText, container } = render(<Rsvp />);
    const stop = chKeepFocusThroughDisable(container);
    const going = getByText('Going');
    going.focus();
    act(() => going.click());
    await flush();
    // What WebKit does when a focused control is disabled: focus falls to <body>, with no blur event (jsdom keeps it on
    // the disabled button, so the page's view of it is stood in for).
    const real = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')!;
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => document.body });
    const focused = vi.spyOn(going, 'focus');
    act(() => (getByText('settle') as HTMLButtonElement).click());
    await flush();
    Object.defineProperty(document, 'activeElement', real);
    delete (document as unknown as Record<string, unknown>).activeElement;
    expect(focused).toHaveBeenCalledWith({ preventScroll: true });
    stop();
  });
  it('leaves focus alone if the person moved on while it was disabled', async () => {
    const { getByText, container } = render(<><Rsvp /><input aria-label="note" /></>);
    const stop = chKeepFocusThroughDisable(container);
    const going = getByText('Going');
    going.focus();
    act(() => going.click());
    await flush();
    const note = container.querySelector('input')!;
    note.focus();
    act(() => (getByText('settle') as HTMLButtonElement).click());
    await flush();
    expect(document.activeElement).toBe(note);
    stop();
  });
});
