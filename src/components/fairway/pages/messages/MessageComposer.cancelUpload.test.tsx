// @vitest-environment jsdom
//
// G-24 — the X on an uploading tile is a cancel, and used to be a lie.
//
// `reference/Composer.dc.html:108-110` puts an explicit X on the uploading
// row. The control already existed — `AttachmentPreview`'s remove button
// renders in every state — but mid-upload it only took the tile off screen.
// The bytes kept going, the send carried the file anyway (the parent holds its
// own captured array), and the user got a message containing a photo they had
// just removed. The transport half is in
// `src/lib/storage/attachments.cancelUpload.test.ts`; this is what the user
// touches.
//
// Behavioural through the real component tree, with a fake send standing in
// for the transport so the signal it is handed can be observed directly.

import { createElement } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';
import type { PendingAttachment } from '@/lib/storage/attachments';

type Reporter = (attachmentId: string, progress: number) => void;

/** A send the test can hold open, capturing the signal it was given. */
function heldSend() {
  let release!: (ok: boolean) => void;
  const settled = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const seen: { ids: string[]; report?: Reporter; signal?: AbortSignal } = { ids: [] };
  const handler = vi.fn(
    async (
      _content: string,
      attachments: PendingAttachment[],
      onProgress?: Reporter,
      signal?: AbortSignal,
    ) => {
      seen.ids = attachments.map((a) => a.id);
      seen.report = onProgress;
      seen.signal = signal;
      // The real chain resolves false once the uploads abandon on the signal.
      signal?.addEventListener('abort', () => release(false), { once: true });
      return settled;
    },
  );
  return {
    handler,
    seen,
    release: async (ok: boolean) => {
      await act(async () => {
        release(ok);
        await settled;
      });
    },
    settle: async () => {
      await act(async () => {
        await settled;
      });
    },
  };
}

async function stageAndSend(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(['x'], 'range.jpg', { type: 'image/jpeg' }));
  await user.click(screen.getByLabelText('Send message'));
}

describe('G-24 — stopping an upload from the composer', () => {
  it('names the control a cancel while a transfer is running', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    // Staged: it removes a file.
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'range.jpg', { type: 'image/jpeg' }));
    expect(screen.getByLabelText('Remove range.jpg')).toBeTruthy();

    // Uploading: it stops one. A screen-reader user has no progress bar to
    // infer the difference from.
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(seen.signal).toBeDefined());
    expect(screen.getByLabelText('Cancel upload of range.jpg')).toBeTruthy();

    await release(true);
  });

  it('aborts the signal the send is running under', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, settle } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAndSend(user, container);
    await waitFor(() => expect(seen.signal).toBeDefined());
    expect(seen.signal!.aborted).toBe(false);

    await user.click(screen.getByLabelText('Cancel upload of range.jpg'));
    expect(seen.signal!.aborted).toBe(true);
    await settle();
  });

  it('says nothing back to the user about their own decision', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, settle } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAndSend(user, container);
    await user.type(screen.getByPlaceholderText('Type a message…'), 'Pairings for Saturday');
    await waitFor(() => expect(seen.signal).toBeDefined());
    await user.click(screen.getByLabelText('Cancel upload of range.jpg'));
    await settle();

    // The send resolves false, which is the "Didn't send" banner's trigger
    // (G-20a) — but a cancel is not a failure to report.
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('keeps the draft, so nothing the user wrote is spent on a cancel', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, settle } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAndSend(user, container);
    const box = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
    await user.type(box, 'Pairings for Saturday');
    await waitFor(() => expect(seen.signal).toBeDefined());
    await user.click(screen.getByLabelText('Cancel upload of range.jpg'));
    await settle();

    expect(box.value).toBe('Pairings for Saturday');
  });

  it('returns the files it did not cancel to staged, ready to send again', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, settle } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(['x'], 'range.jpg', { type: 'image/jpeg' }),
      new File(['y'], 'green.jpg', { type: 'image/jpeg' }),
    ]);
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(seen.signal).toBeDefined());

    await user.click(screen.getByLabelText('Cancel upload of range.jpg'));
    await settle();

    // The other file is staged again — not stuck mid-bar, not gone.
    await waitFor(() => expect(screen.getByLabelText('Remove green.jpg')).toBeTruthy());
    expect(screen.queryByLabelText('Remove range.jpg')).toBeNull();
  });

  it('does not abort anything when a file is removed before the send starts', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'range.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByLabelText('Remove range.jpg'));

    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('still reports a real failure — the suppression is scoped to a cancel', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAndSend(user, container);
    await waitFor(() => expect(seen.signal).toBeDefined());
    await release(false);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn’t send/);
  });

  it('does not carry a cancel over into the next send', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const first = heldSend();
    const { container, rerender } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: first.handler }),
    );

    await stageAndSend(user, container);
    await waitFor(() => expect(first.seen.signal).toBeDefined());
    await user.click(screen.getByLabelText('Cancel upload of range.jpg'));
    await first.settle();

    // A second attempt that genuinely fails must still say so; the cancel flag
    // is per-send, not sticky.
    const second = heldSend();
    rerender(createElement(MessageComposer, { onSend, onSendWithAttachments: second.handler }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['z'], 'tee-times.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(second.seen.signal).toBeDefined());
    await second.release(false);

    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn’t send/);
  });
});
