/**
 * G-09b — real transfer progress, replacing three invented constants.
 *
 * `uploadAttachment` reported 10 on entry, 90 after `.upload()` resolved and
 * 100 after the signed URL came back, under a comment reading "we simulate
 * progress for UX". None of the three was connected to a byte count. (Until
 * G-09a wired the callback through they also reached no pixel, so nothing
 * false was ever on screen — the finding's severity rested on a display that
 * did not exist.)
 *
 * The transport is now a PUT to a `createSignedUploadUrl` target driven by
 * `XMLHttpRequest`, whose `upload.onprogress` is the only upload-progress
 * signal a browser offers without a streaming request body — and the same
 * object whose `abort()` G-24 needs. `.upload()` stays as the fallback, so a
 * mistake here degrades to today's behaviour rather than breaking sends.
 *
 * Driven through a fake `XMLHttpRequest` and a stubbed Supabase client, so
 * every branch that decides between the two paths is exercised for real
 * rather than read.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

class FakeXhr {
  static last: FakeXhr | null = null;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  responseText = '';
  upload: { onprogress?: (event: unknown) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }
  send(body: unknown) {
    this.body = body;
  }

  /* ── drivers ─────────────────────────────────────────────────────────── */
  emitProgress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable });
  }
  respond(status: number, responseText = '') {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
  transportFailure() {
    this.onerror?.();
  }
}

const stub = {
  signError: null as { message: string } | null,
  uploadError: null as { message: string } | null,
  uploadCalls: 0,
  uploadBody: undefined as unknown,
  signCalls: 0,
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: (path: string) => {
          stub.signCalls += 1;
          return Promise.resolve(
            stub.signError
              ? { data: null, error: stub.signError }
              : {
                  data: {
                    signedUrl: `https://storage.test/storage/v1/object/upload/sign/${path}?token=tok`,
                    token: 'tok',
                    path,
                  },
                  error: null,
                },
          );
        },
        upload: (path: string, body: unknown) => {
          stub.uploadCalls += 1;
          stub.uploadBody = body;
          return Promise.resolve(
            stub.uploadError ? { data: null, error: stub.uploadError } : { data: { path }, error: null },
          );
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

/** Start an upload and hand back the XHR it opened, mid-flight. */
async function inFlight(onProgress?: (p: number) => void) {
  const promise = uploadAttachment(aFile(), 'conv-1', 'msg-1', onProgress);
  await tick();
  const xhr = FakeXhr.last;
  expect(xhr, 'expected an XMLHttpRequest to have been opened').not.toBeNull();
  return { promise, xhr: xhr! };
}

beforeEach(() => {
  stub.signError = null;
  stub.uploadError = null;
  stub.uploadCalls = 0;
  stub.uploadBody = undefined;
  stub.signCalls = 0;
  FakeXhr.last = null;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
});

describe('G-09b — the numbers come from the transfer', () => {
  it('uploads through a signed PUT rather than the progress-blind SDK call', async () => {
    const { promise, xhr } = await inFlight();
    xhr.respond(200);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toContain('/object/upload/sign/');
    expect(xhr.url).toContain('token=');
    expect(stub.uploadCalls).toBe(0);
  });

  it('reports the fraction actually transferred', async () => {
    const seen: number[] = [];
    const { promise, xhr } = await inFlight((p) => seen.push(p));

    xhr.emitProgress(50, 200);
    xhr.emitProgress(150, 200);
    xhr.respond(200);
    await promise;

    // 25 and 75 are byte counts, not decoration. The old path could only ever
    // say 10, then 90.
    expect(seen).toContain(25);
    expect(seen).toContain(75);
    expect(seen).not.toContain(10);
    expect(seen).not.toContain(90);
  });

  it('starts at a truthful zero before anything has moved', async () => {
    const seen: number[] = [];
    const { promise, xhr } = await inFlight((p) => seen.push(p));
    xhr.respond(200);
    await promise;

    expect(seen[0]).toBe(0);
  });

  it('says nothing at all when the length is not computable', async () => {
    const seen: number[] = [];
    const { promise, xhr } = await inFlight((p) => seen.push(p));

    // total === 0 makes loaded/total NaN or Infinity. Reporting anything
    // derived from it is the fabricated progress this finding is named for.
    xhr.emitProgress(4096, 0, false);
    expect(seen).toEqual([0]);

    xhr.respond(200);
    await promise;
    expect(seen.every((n) => Number.isFinite(n))).toBe(true);
  });

  it('does not call the transfer complete while the server can still refuse it', async () => {
    const seen: number[] = [];
    const { promise, xhr } = await inFlight((p) => seen.push(p));

    xhr.emitProgress(200, 200);
    // Every byte has left the device; the response has not arrived.
    expect(seen).not.toContain(100);
    expect(Math.max(...seen)).toBe(99);

    xhr.respond(200);
    await promise;
    expect(seen[seen.length - 1]).toBe(100);
  });

  it('sends the resolved type on the request itself (G-61, now as a header)', async () => {
    const { promise, xhr } = await inFlight();
    xhr.respond(200);
    await promise;

    expect(xhr.headers['content-type']).toBe('image/jpeg');
    expect(xhr.headers['cache-control']).toBe('max-age=3600');
    expect(xhr.headers['x-upsert']).toBe('false');
  });
});

describe('G-09b — when the signed path cannot be used', () => {
  it('falls back to the SDK upload when the URL cannot be signed', async () => {
    stub.signError = { message: 'not authorised' };
    const result = await uploadAttachment(aFile(), 'conv-1', 'msg-1');

    expect(result.success).toBe(true);
    expect(stub.uploadCalls).toBe(1);
    expect(FakeXhr.last).toBeNull();
  });

  it('falls back when the transfer never reached a server', async () => {
    const { promise, xhr } = await inFlight();
    xhr.transportFailure();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(stub.uploadCalls).toBe(1);
  });

  it('falls back on a server fault, which is not a verdict about this request', async () => {
    const { promise, xhr } = await inFlight();
    xhr.respond(503);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(stub.uploadCalls).toBe(1);
  });

  it('does NOT retry a refusal — a 4xx is an answer', async () => {
    const { promise, xhr } = await inFlight();
    xhr.respond(400, 'mime type not supported');
    const result = await promise;

    // Since G-61 both paths send the same mime for the same bytes, so the
    // second attempt would collect the same refusal at twice the latency.
    expect(result.success).toBe(false);
    expect(result.error).toContain('mime type not supported');
    expect(stub.uploadCalls).toBe(0);
  });

  it('falls back where there is no XMLHttpRequest at all', async () => {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    const result = await uploadAttachment(aFile(), 'conv-1', 'msg-1');

    expect(result.success).toBe(true);
    expect(stub.uploadCalls).toBe(1);
    expect(stub.signCalls).toBe(0);
  });

  it('invents no middle on the fallback, where nothing measures the transfer', async () => {
    stub.signError = { message: 'not authorised' };
    const seen: number[] = [];
    const result = await uploadAttachment(aFile(), 'conv-1', 'msg-1', (p) => seen.push(p));

    expect(result.success).toBe(true);
    // Zero while it works, 100 when it is done. The shimmer overlay already
    // says "working"; a fraction nobody measured would be a lie.
    expect(seen).toEqual([0, 100]);
  });

  it('reports the SDK error when the fallback fails too', async () => {
    stub.signError = { message: 'not authorised' };
    stub.uploadError = { message: 'bucket full' };
    const result = await uploadAttachment(aFile(), 'conv-1', 'msg-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('bucket full');
  });
});

describe('G-09b — the invented constants are gone', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/storage/attachments.ts'), 'utf-8');
  /** Comment-stripped, so the fix's own prose cannot satisfy a check. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('no longer hardcodes 10 or 90 as progress', () => {
    expect(code).not.toContain('onProgress(10)');
    expect(code).not.toContain('onProgress(90)');
    expect(code).not.toContain('simulate progress');
  });

  it('derives every reported number from the event, or reports nothing', () => {
    expect(code).toContain('event.loaded / event.total');
    expect(code).toContain('event.lengthComputable');
  });
});
