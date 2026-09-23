/**
 * G-24 — an in-flight upload could not be stopped.
 *
 * `reference/Composer.dc.html:108-110` puts an explicit X on the uploading
 * row, and the audit found no `AbortController`, `signal` or cancel path
 * anywhere in `attachments.ts` or `use-message-attachments.ts` — so if the
 * button had been built there would have been nothing to call.
 *
 * G-09b made this reachable rather than merely desirable: the transport is an
 * `XMLHttpRequest` because `upload.onprogress` is the only browser upload
 * signal without a streaming body, and the same object is the one that has an
 * `abort()`. One change supplied both halves, which is what the manifest
 * predicted.
 *
 * The transport half is here. The user-facing half — the X, the banner that
 * must NOT appear, the draft that survives — is in
 * `src/components/fairway/pages/messages/MessageComposer.cancelUpload.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

class FakeXhr {
  static last: FakeXhr | null = null;
  static opened = 0;
  abortCalls = 0;
  status = 0;
  responseText = '';
  upload: { onprogress?: (event: unknown) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;

  constructor() {
    FakeXhr.last = this;
  }
  open() {
    FakeXhr.opened += 1;
  }
  setRequestHeader() {}
  send() {}
  abort() {
    this.abortCalls += 1;
    this.onabort?.();
  }
  respond(status: number) {
    this.status = status;
    this.onload?.();
  }
}

const stub = { uploadCalls: 0 };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: (path: string) =>
          Promise.resolve({
            data: { signedUrl: `https://storage.test/sign/${path}?token=tok`, token: 'tok', path },
            error: null,
          }),
        upload: (path: string) => {
          stub.uploadCalls += 1;
          return Promise.resolve({ data: { path }, error: null });
        },
        createSignedUrl: (path: string) =>
          Promise.resolve({ data: { signedUrl: `https://storage.test/${path}` }, error: null }),
      }),
    },
  }),
}));

const { uploadAttachment } = await import('./attachments');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const aFile = () => new File(['jpeg-bytes'], 'range.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  stub.uploadCalls = 0;
  FakeXhr.last = null;
  FakeXhr.opened = 0;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
});

describe('G-24 — a transfer in flight can be stopped', () => {
  it('aborts the request the moment the signal fires', async () => {
    const controller = new AbortController();
    const promise = uploadAttachment(aFile(), 'conv-1', 'msg-1', undefined, controller.signal);
    await tick();
    const xhr = FakeXhr.last!;

    controller.abort();
    const result = await promise;

    // The bytes stop leaving the device — that is the whole finding.
    expect(xhr.abortCalls).toBe(1);
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it('does not restart what the user just stopped', async () => {
    const controller = new AbortController();
    const promise = uploadAttachment(aFile(), 'conv-1', 'msg-1', undefined, controller.signal);
    await tick();
    controller.abort();
    await promise;

    // Falling back to `.upload()` here would begin the same transfer again
    // from byte zero, on a path that cannot be cancelled at all.
    expect(stub.uploadCalls).toBe(0);
  });

  it('never opens a request for a signal that is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await uploadAttachment(aFile(), 'conv-1', 'msg-1', undefined, controller.signal);

    expect(FakeXhr.opened).toBe(0);
    expect(stub.uploadCalls).toBe(0);
    expect(result.cancelled).toBe(true);
  });

  it('reports a cancel as a cancel, not as a failed upload', async () => {
    const controller = new AbortController();
    const promise = uploadAttachment(aFile(), 'conv-1', 'msg-1', undefined, controller.signal);
    await tick();
    controller.abort();
    const result = await promise;

    // `Upload failed:` is the wording every real fault carries. A cancel must
    // not wear it — nothing downstream should log or surface this as a fault.
    expect(result.error).not.toContain('Upload failed');
    expect(result.error).toContain('cancelled');
  });

  it('stops listening once the upload has finished, so a later abort touches nothing', async () => {
    const controller = new AbortController();
    const promise = uploadAttachment(aFile(), 'conv-1', 'msg-1', undefined, controller.signal);
    await tick();
    const xhr = FakeXhr.last!;
    xhr.respond(200);
    const result = await promise;
    expect(result.success).toBe(true);

    // A composer that aborts its controller during cleanup must not reach
    // into a request that already completed.
    controller.abort();
    expect(xhr.abortCalls).toBe(0);
  });

  it('honours a cancel that lands before the uncancellable fallback begins', async () => {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    const controller = new AbortController();
    controller.abort();

    const result = await uploadAttachment(aFile(), 'conv-1', 'msg-1', undefined, controller.signal);

    // `.upload()` takes no signal in this SDK version, so this is the whole of
    // what the fallback can honour — and it is worth honouring.
    expect(stub.uploadCalls).toBe(0);
    expect(result.cancelled).toBe(true);
  });

  it('leaves an upload with no signal exactly as it was', async () => {
    const promise = uploadAttachment(aFile(), 'conv-1', 'msg-1');
    await tick();
    FakeXhr.last!.respond(200);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.cancelled).toBeUndefined();
  });
});
