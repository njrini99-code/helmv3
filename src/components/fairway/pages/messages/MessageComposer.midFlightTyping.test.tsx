// @vitest-environment jsdom
//
// G-19 (second half) — text typed WHILE a send is in flight was wiped.
//
// The textarea is deliberately not disabled during a send, so a slow network
// never blocks typing. But on success the composer called a blanket
// `setMessage('')`, which cleared whatever was in the box — including anything
// typed during the round trip. On a slow phone that is a whole second sentence,
// gone the moment the first one lands. §9.3 forbids exactly this.
//
// Note on the finding as written: the manifest says `setMessage('')` runs
// "unconditionally". It does not — it was already inside `if (success)`. The
// real defect is narrower and is what these tests pin: it cleared the BOX
// rather than clearing what was SENT.

import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';

/** A send we can hold open, so "in flight" is a state the test controls. */
function deferredSend() {
  let release!: (ok: boolean) => void;
  const gate = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const onSend = vi.fn(() => gate);
  return { onSend, release: (ok = true) => release(ok) };
}

function renderComposer(onSend: () => Promise<boolean>) {
  return render(createElement(MessageComposer, { onSend }));
}

describe('G-19 — a send in flight must not eat what the user keeps typing', () => {
  it('clears the box when nothing was typed during the round trip', async () => {
    const user = userEvent.setup();
    const { onSend, release } = deferredSend();
    renderComposer(onSend);

    const box = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
    await user.type(box, 'Bus leaves at six');
    await user.click(screen.getByLabelText('Send message'));

    release(true);
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('KEEPS text typed while the send was in flight, instead of wiping it', async () => {
    const user = userEvent.setup();
    const { onSend, release } = deferredSend();
    renderComposer(onSend);

    const box = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
    await user.type(box, 'Bus leaves at six');
    await user.click(screen.getByLabelText('Send message'));

    // The send is still open — the textarea stays usable on purpose.
    await user.type(box, ' — bring rain gear');
    expect(box.value).toBe('Bus leaves at six — bring rain gear');

    release(true);

    // Only the sent portion is consumed. The rest survives, which is the
    // whole point: the old blanket clear discarded it.
    await waitFor(() => expect(box.value).toBe(' — bring rain gear'));
  });

  it('sends what was in the box at submit time, not what it grew into', async () => {
    const user = userEvent.setup();
    const { onSend, release } = deferredSend();
    renderComposer(onSend);

    const box = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
    await user.type(box, 'First');
    await user.click(screen.getByLabelText('Send message'));
    await user.type(box, ' and second');

    release(true);
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('First'));
  });

  it('retains the whole draft when the send fails', async () => {
    const user = userEvent.setup();
    const { onSend, release } = deferredSend();
    renderComposer(onSend);

    const box = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
    await user.type(box, 'Bus leaves at six');
    await user.click(screen.getByLabelText('Send message'));

    release(false);

    // Nothing delivered, so nothing is consumed — the user still has their text
    // and can press send again.
    await waitFor(() => expect(box.value).toBe('Bus leaves at six'));
  });
});
