// @vitest-environment jsdom
//
// G-21 — the attachment send used to fail OPEN.
//
// The branch was `if (hasAttachments && onSendWithAttachments) { …with files }
// else { onSend(text) }`. A missing handler therefore fell through to the
// text-only path: the message was delivered, the files were silently dropped,
// and the send reported success. Nothing on screen said the photo had not gone.
// §1.1 names silent attachment omission as the risk to design against.
//
// Latent rather than live — the production call site always passes the handler
// — so these tests exercise the branch that production does not reach, which is
// exactly the branch nothing else was checking.

import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';
import type { PendingAttachment } from '@/lib/storage/attachments';

/**
 * Drive a file into the composer through its real <input type="file">, so the
 * component's own handleFilesSelected builds the PendingAttachment.
 */
async function attachAFile(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input, 'expected the attachment input').not.toBeNull();
  const file = new File(['x'], 'range.jpg', { type: 'image/jpeg' });
  await user.upload(input, file);
}

describe('G-21 — a composer with no attachment handler refuses instead of dropping files', () => {
  it('does NOT fall through to the text-only send when files are pending', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    // No onSendWithAttachments — the latent case.
    const { container } = render(createElement(MessageComposer, { onSend }));

    await attachAFile(user, container);
    await user.type(screen.getByPlaceholderText('Type a message…'), 'Here is the range photo');
    await user.click(screen.getByLabelText('Send message'));

    // The defect: this used to be called, delivering a lesser message.
    await waitFor(() => expect(onSend).not.toHaveBeenCalled());
  });

  it('tells the user nothing was sent, rather than failing silently', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { container } = render(createElement(MessageComposer, { onSend }));

    await attachAFile(user, container);
    await user.type(screen.getByPlaceholderText('Type a message…'), 'Here is the range photo');
    await user.click(screen.getByLabelText('Send message'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not sent/i);
  });

  it('keeps the draft and the attachment so nothing the user staged is lost', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { container } = render(createElement(MessageComposer, { onSend }));

    await attachAFile(user, container);
    const box = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
    await user.type(box, 'Here is the range photo');
    await user.click(screen.getByLabelText('Send message'));

    await screen.findByRole('alert');
    expect(box.value).toBe('Here is the range photo');
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('leaves a plain text send completely unaffected', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    render(createElement(MessageComposer, { onSend }));

    await user.type(screen.getByPlaceholderText('Type a message…'), 'No files here');
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('No files here'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the attachment path, not the text path, when the handler IS supplied', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const onSendWithAttachments = vi.fn(
      async (_c: string, _a: PendingAttachment[]) => true,
    );
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments }),
    );

    await attachAFile(user, container);
    await user.type(screen.getByPlaceholderText('Type a message…'), 'With the photo');
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() => expect(onSendWithAttachments).toHaveBeenCalled());
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
