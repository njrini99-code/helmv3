/**
 * A rejected attachment must SAY it was rejected.
 *
 * Reported 2026-08-31: "Message and Announcement, we can't do pictures."
 * Investigating it from production was impossible, and this is why: the old
 * `handleChange` did
 *
 *     const validFiles = fileArray.filter((file) => validateFile(file).valid);
 *
 * discarding a reason `validateFile` had already computed. A rejected file
 * produced no toast, no log, no console line and no network call — rejection
 * happens before any request is made. So the failure left NO Sentry event, no
 * storage object and no database row: byte-for-byte the same evidence profile
 * as nobody having tried to attach anything.
 *
 * The most likely trigger is a device reporting a `file.type` that
 * ALLOWED_MIME_TYPES does not carry — an empty string, or an HEIC variant —
 * which is what a phone produces and a desktop does not.
 *
 * This file also closes a real gap the investigation surfaced: before it,
 * there was no unit test anywhere on the attachment path (attachments.ts,
 * message-attachments.ts, use-message-attachments.ts, AttachmentButton.tsx),
 * and no e2e attachment coverage. A regression here shipped with no CI signal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// `vi.mock` factories are hoisted above module-level consts, so the spies have
// to be created inside `vi.hoisted` or they are not initialised when the
// factory runs.
const { toastDanger, logErrorMock } = vi.hoisted(() => ({
  toastDanger: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock('@/components/fairway', () => ({
  fairwayToast: { danger: toastDanger, success: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/error-logging', () => ({ logError: logErrorMock }));
vi.mock('@/lib/utils/capacitor', () => ({ triggerHaptic: vi.fn() }));

import { AttachmentButton } from '../AttachmentButton';

function pick(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AttachmentButton — a rejected file is never silent', () => {
  it('tells the user why, and does not pass the file on', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(<AttachmentButton onFilesSelected={onFilesSelected} />);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    // A mime type ALLOWED_MIME_TYPES does not carry — exactly what a phone can
    // hand back for a photo.
    pick(input!, new File(['x'], 'IMG_0394.heic', { type: 'application/x-unknown' }));

    expect(onFilesSelected).not.toHaveBeenCalled();
    // The assertion that carries this file: the user was TOLD.
    expect(toastDanger).toHaveBeenCalledTimes(1);
    expect(String(toastDanger.mock.calls[0]![0])).toMatch(/not supported|can't be attached/i);
    // And the next occurrence is diagnosable rather than invisible.
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![1]).toMatchObject({
      component: 'AttachmentButton',
      mimeType: 'application/x-unknown',
    });
  });

  it('still passes a valid image through, with no complaint', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(<AttachmentButton onFilesSelected={onFilesSelected} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    pick(input!, new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected.mock.calls[0]![0]).toHaveLength(1);
    expect(toastDanger).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});
