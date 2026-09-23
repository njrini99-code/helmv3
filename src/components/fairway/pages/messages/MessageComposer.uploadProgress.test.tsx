// @vitest-environment jsdom
//
// G-09a — the upload bar was wired to nothing.
//
// `AttachmentPreview.tsx:170,189` has always rendered `{uploadProgress}%` and a
// bar at `width: ${uploadProgress}%`, and `useMessageAttachments` has always
// accepted an `onProgress(attachmentId, progress)` and threaded it into
// `uploadAttachment` per file. The two halves were never joined:
// `FairwayMessages.handleSendMessageWithAttachments` called
// `sendMessageWithAttachments({conversationId, content, attachments})` with no
// `onProgress`, and `MessageComposer` wrote `uploadProgress: 0` at staging and
// never wrote it again. So the bar sat at 0% for the whole upload.
//
// That reorders the finding, and the ledger records it: M00's G-09 reads
// `attachments.ts`'s hardcoded 10/90/100 as a §1.1 "no false progress"
// violation, but those constants reached no pixel — nothing was on screen to
// be false. The honest first half of G-09 is the wiring, and it is worth
// landing on its own: it makes the bar real-time even against today's
// simulated constants, and it is what a real transport (G-09b) plugs into.
//
// Behavioural, through the real component tree — the composer, the real
// `AttachmentPreview`, and a fake send that plays the role of the transport.
// The one thing that cannot be reached in jsdom is the parent's forwarding,
// which is asserted on the source at the bottom.

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';
import type { PendingAttachment } from '@/lib/storage/attachments';

type Reporter = (attachmentId: string, progress: number) => void;

/** A send the test can hold open, so mid-flight state can be observed. */
function heldSend() {
  let release!: (ok: boolean) => void;
  const settled = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const seen: { ids: string[]; report?: Reporter } = { ids: [] };
  const handler = vi.fn(
    async (_content: string, attachments: PendingAttachment[], onProgress?: Reporter) => {
      seen.ids = attachments.map((a) => a.id);
      seen.report = onProgress;
      return settled;
    },
  );
  return { handler, seen, release: async (ok: boolean) => { await act(async () => { release(ok); await settled; }); } };
}

async function stageAFileAndSend(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input, 'expected the attachment input').not.toBeNull();
  await user.upload(input, new File(['x'], 'range.jpg', { type: 'image/jpeg' }));
  await user.click(screen.getByLabelText('Send message'));
}

/** The bar element, identified by the inline width the component sets. */
function barWidth(container: HTMLElement): string | undefined {
  const bar = container.querySelector<HTMLElement>('div.bg-accent-500[style*="width"]');
  return bar?.style.width;
}

describe('G-09a — transfer progress reaches the staged tile', () => {
  it('hands the attachment send a progress callback', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAFileAndSend(user, container);
    await waitFor(() => expect(handler).toHaveBeenCalled());

    // The defect, exactly: the third argument was never passed, so the
    // transport had nowhere to report to.
    expect(typeof seen.report).toBe('function');
    await release(true);
  });

  it('shows a percentage the transport reported, not the staged zero', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAFileAndSend(user, container);
    await waitFor(() => expect(seen.report).toBeDefined());

    await act(async () => { seen.report!(seen.ids[0]!, 42); });
    expect(screen.getByText('42%')).toBeTruthy();
    expect(barWidth(container)).toBe('42%');
    await release(true);
  });

  it('starts the bar at zero when the transfer starts, not at staging', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'range.jpg', { type: 'image/jpeg' }));
    // Staged but not sent: no upload is happening, so no bar claims one is.
    expect(screen.queryByText('0%')).toBeNull();

    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(screen.getByText('0%')).toBeTruthy());
    await waitFor(() => expect(seen.report).toBeDefined());
    await release(true);
  });

  it('never lets the bar slide backwards when a chunk is re-announced', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAFileAndSend(user, container);
    await waitFor(() => expect(seen.report).toBeDefined());

    await act(async () => { seen.report!(seen.ids[0]!, 60); });
    await act(async () => { seen.report!(seen.ids[0]!, 25); });
    expect(screen.getByText('60%')).toBeTruthy();
    expect(barWidth(container)).toBe('60%');
    await release(true);
  });

  it('clamps a transport that overshoots its own total', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAFileAndSend(user, container);
    await waitFor(() => expect(seen.report).toBeDefined());

    await act(async () => { seen.report!(seen.ids[0]!, 250); });
    expect(screen.getByText('100%')).toBeTruthy();
    expect(barWidth(container)).toBe('100%');
    await release(true);
  });

  it('moves only the file the transport named', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(['x'], 'range.jpg', { type: 'image/jpeg' }),
      new File(['y'], 'green.jpg', { type: 'image/jpeg' }),
    ]);
    await user.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(seen.report).toBeDefined());
    expect(seen.ids.length).toBe(2);

    await act(async () => { seen.report!(seen.ids[1]!, 33); });
    expect(screen.getByText('33%')).toBeTruthy();
    // The untouched file is still at zero — one shared counter would show two.
    expect(screen.getByText('0%')).toBeTruthy();
    await release(true);
  });

  it('returns the tiles to staged when the send fails, rather than freezing mid-bar', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const { handler, seen, release } = heldSend();
    const { container } = render(
      createElement(MessageComposer, { onSend, onSendWithAttachments: handler }),
    );

    await stageAFileAndSend(user, container);
    await waitFor(() => expect(seen.report).toBeDefined());
    await act(async () => { seen.report!(seen.ids[0]!, 70); });
    expect(screen.getByText('70%')).toBeTruthy();

    await release(false);

    // A bar stuck at 70% claims a transfer that is not happening; Retry starts
    // the upload from the first byte.
    await waitFor(() => expect(screen.queryByText('70%')).toBeNull());
    expect(barWidth(container)).toBeUndefined();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

/**
 * The parent's half. `handleSendMessageWithAttachments` runs against a real
 * conversation id, the attachments hook and a toast provider, so it is read
 * rather than driven — and what distinguishes fixed from broken here is
 * whether the callback is forwarded at all.
 */
describe('G-09a — FairwayMessages forwards the callback it was dropping', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/fairway/pages/messages/FairwayMessages.tsx'),
    'utf-8',
  );
  /** Comment-stripped, so the fix's own docstring cannot satisfy a check. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('accepts a progress callback from the composer', () => {
    expect(code).toMatch(/handleSendMessageWithAttachments = async \([\s\S]{0,400}onProgress\?:/);
  });

  it('passes it into the attachment send, which has always accepted one', () => {
    const idx = code.indexOf('await sendMessageWithAttachments({');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 300)).toContain('onProgress,');
  });

  it('is the callback the composer supplies, not one invented in the parent', () => {
    // The composer owns the staged tiles, so the parent must not hold its own
    // progress state — a second source would drift from what is on screen.
    expect(code).not.toContain('setUploadProgress');
  });
});
