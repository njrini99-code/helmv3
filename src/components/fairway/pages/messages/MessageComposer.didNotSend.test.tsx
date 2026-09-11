// @vitest-environment jsdom
//
// G-20a — the artboard's sixth composer state, "Didn't send", and the
// duplication that hid the fact that half of it already shipped.
//
// The manifest says Replying and Did-not-send "have no implementation in
// MessageComposer.tsx — no failure banner, no Retry". Half of that is now
// stale, and the correction is the interesting part. THE TWO SEND PATHS
// BEHAVE DIFFERENTLY:
//
//   • `onSend` reaches `useGolfMessages.sendMessage`, which pushes an
//     optimistic row (`use-golf-messages.ts`, before the `try`) BEFORE
//     anything can throw. Every text failure therefore ends up in the thread
//     as a muted bubble with its own Retry — G-19 built exactly the artboard's
//     sixth state, in a better place than the artboard drew it (§9.2 keeps the
//     message where the user sent it). The composer's job there is to LET GO:
//     leaving the draft in the field put the same sentence on screen twice,
//     offering two different retries.
//
//   • `onSendWithAttachments` reaches `useMessageAttachments`, which creates
//     no optimistic row at all. On failure there is a toast and nothing else,
//     and the message exists nowhere but in the field. That is the case the
//     banner is for, and it is the only case.
//
// Behavioural rather than source-read: what distinguishes fixed from broken
// here is what the component DOES with a false return, and both branches are
// reachable by rendering it with a handler that resolves false.

import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';
import type { PendingAttachment } from '@/lib/storage/attachments';

async function attachAFile(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input, 'expected the attachment input').not.toBeNull();
  await user.upload(input, new File(['x'], 'pairings.pdf', { type: 'application/pdf' }));
}

const box = () => screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;

describe('G-20a — a failed ATTACHMENT send raises the banner', () => {
  it('shows the failure, because nothing reached the thread to show it there', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const onSendWithAttachments = vi.fn(async (_c: string, _a: PendingAttachment[]) => false);
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments }),
    );

    await attachAFile(user, container);
    await user.type(box(), 'Pairings for Saturday');
    await user.click(screen.getByLabelText('Send message'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn’t send/i);
  });

  it('offers Retry, and retrying re-sends what is still staged', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const onSendWithAttachments = vi.fn(async (_c: string, _a: PendingAttachment[]) => false);
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments }),
    );

    await attachAFile(user, container);
    await user.type(box(), 'Pairings for Saturday');
    await user.click(screen.getByLabelText('Send message'));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // Twice: the original attempt and the retry, both with the same content —
    // there is no persisted id to re-send the way retryMessage does, so the
    // staged draft IS the record of the attempt.
    await waitFor(() => expect(onSendWithAttachments).toHaveBeenCalledTimes(2));
    expect(onSendWithAttachments.mock.calls[1]?.[0]).toBe('Pairings for Saturday');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('keeps the draft and the staged file — "the text is never lost"', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const onSendWithAttachments = vi.fn(async (_c: string, _a: PendingAttachment[]) => false);
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments }),
    );

    await attachAFile(user, container);
    await user.type(box(), 'Pairings for Saturday');
    await user.click(screen.getByLabelText('Send message'));
    await screen.findByRole('alert');

    expect(box().value).toBe('Pairings for Saturday');
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });
});

describe('G-20a — a failed TEXT send does NOT raise the banner', () => {
  it('stays silent, because the thread is already showing the failed message', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => false);
    render(createElement(MessageComposer, { onSend }));

    await user.type(box(), 'See you at the bus.');
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('releases the draft, so the sentence is not on screen twice', async () => {
    // The defect this closes: `if (success)` guarded the clear, so a failed
    // text send left the words in the field WHILE G-19's muted bubble showed
    // the same words in the thread — two copies, two different retries.
    const user = userEvent.setup();
    const onSend = vi.fn(async () => false);
    render(createElement(MessageComposer, { onSend }));

    await user.type(box(), 'See you at the bus.');
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(box().value).toBe(''));
  });

  it('keeps anything typed while the failed send was in flight', async () => {
    // The mid-flight-edit care §9.3 requires, on the failure path too: only
    // what was actually sent leaves the field.
    const user = userEvent.setup();
    let release: (v: boolean) => void = () => {};
    const onSend = vi.fn(() => new Promise<boolean>((r) => { release = r; }));
    render(createElement(MessageComposer, { onSend }));

    await user.type(box(), 'See you at the bus.');
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(onSend).toHaveBeenCalled());

    // The textarea stays enabled during a send, deliberately.
    await user.type(box(), ' Bring the case.');
    release(false);

    await waitFor(() => expect(box().value).toBe(' Bring the case.'));
  });
});

describe('G-20a — the G-21 refusal is not retryable', () => {
  it('shows no Retry, because retrying a missing handler only refuses again', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    // No onSendWithAttachments — the latent G-21 case.
    const { container } = render(createElement(MessageComposer, { onSend }));

    await attachAFile(user, container);
    await user.type(box(), 'Here is the range photo');
    await user.click(screen.getByLabelText('Send message'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not sent/i);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
