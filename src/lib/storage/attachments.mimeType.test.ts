/**
 * G-61 — the `contentType` upload option was inert, and the comment above it
 * claimed a fix that was not happening.
 *
 * `attachments.ts` passed `contentType: resolvedMimeType` to
 * `supabase.storage.from(...).upload(...)` with a comment saying it stops the
 * SDK inferring `application/octet-stream` for an iOS camera capture (which
 * reports `file.type === ''`), which the bucket's `allowed_mime_types` would
 * reject. The SDK does not read that option for this call: `uploadOrUpdate`
 * takes the FormData branch for any Blob body — and a `File` is a Blob —
 * appending the file and never touching `options.contentType`. Only its
 * raw-body branch turns that option into a `content-type` header. So the type
 * the Storage API saw was the file's own, and `convertHeicToJpeg` returns the
 * original file untouched for everything that is not HEIC.
 *
 * The fix puts the resolved type on the BYTES, where every branch reads it.
 *
 * Both sides are measured. The behavioural half drives `uploadAttachment` with
 * a stubbed client and reads the mime off the body it actually hands the SDK;
 * the source half reads the vendored SDK and asserts the premise — that the
 * Blob branch ignores `contentType`. If a future SDK version starts honouring
 * it, that second half fails, which is the correct alarm: the reasoning under
 * this fix would have moved.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploaded: { path?: string; body?: unknown; options?: Record<string, unknown> } = {};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (path: string, body: unknown, options: Record<string, unknown>) => {
          uploaded.path = path;
          uploaded.body = body;
          uploaded.options = options;
          return Promise.resolve({ data: { path }, error: null });
        },
        createSignedUrl: (path: string) =>
          Promise.resolve({ data: { signedUrl: `https://example.test/${path}` }, error: null }),
      }),
    },
  }),
}));

const { uploadAttachment } = await import('./attachments');

/** The mime the Storage API will see: the body's own type, whatever it is. */
function sentMimeType(): string {
  expect(uploaded.body, 'expected a body to have reached the SDK').toBeInstanceOf(Blob);
  return (uploaded.body as Blob).type;
}

describe('G-61 — the uploaded bytes carry the resolved mime type', () => {
  beforeEach(() => {
    uploaded.path = undefined;
    uploaded.body = undefined;
    uploaded.options = undefined;
  });

  it('labels an iOS camera capture that reports no type at all', async () => {
    // Exactly the case the old comment described: the browser reports "", the
    // extension is the only signal, and validation already passes on it.
    const file = new File(['jpeg-bytes'], 'IMG_0001.jpg', { type: '' });

    const result = await uploadAttachment(file, 'conv-1', 'msg-1');

    expect(result.success).toBe(true);
    expect(sentMimeType()).toBe('image/jpeg');
  });

  it('records the same type in the metadata the message row will carry', async () => {
    const file = new File(['jpeg-bytes'], 'IMG_0001.jpg', { type: '' });

    const result = await uploadAttachment(file, 'conv-1', 'msg-1');

    // The stored object and the row must not disagree about what the file is.
    expect(result.metadata?.mimeType).toBe(sentMimeType());
    expect(result.metadata?.fileType).toBe('image');
  });

  it('passes the original object through untouched when the type already agrees', async () => {
    const file = new File(['jpeg-bytes'], 'range.jpg', { type: 'image/jpeg' });

    await uploadAttachment(file, 'conv-1', 'msg-1');

    // No needless copy of a 10MB photo in the common case.
    expect(uploaded.body).toBe(file);
  });

  it('keeps the name, so the extension still matches the bytes', async () => {
    const file = new File(['jpeg-bytes'], 'IMG_0001.jpg', { type: '' });

    await uploadAttachment(file, 'conv-1', 'msg-1');

    expect((uploaded.body as File).name).toBe('IMG_0001.jpg');
    expect(uploaded.path).toContain('IMG_0001.jpg');
  });

  it('does not change the bytes it is labelling', async () => {
    const file = new File(['jpeg-bytes'], 'IMG_0001.jpg', { type: '' });

    const result = await uploadAttachment(file, 'conv-1', 'msg-1');

    expect((uploaded.body as File).size).toBe(file.size);
    expect(result.metadata?.fileSize).toBe(file.size);
  });

  it('still asks for the cache control the bucket was set up with', async () => {
    const file = new File(['jpeg-bytes'], 'range.jpg', { type: 'image/jpeg' });

    await uploadAttachment(file, 'conv-1', 'msg-1');

    // Easy to drop while rewriting this call; the objects would silently
    // change caching behaviour.
    expect(uploaded.options?.cacheControl).toBe('3600');
    expect(uploaded.options?.upsert).toBe(false);
  });
});

describe('the premise: the SDK ignores contentType for a Blob body', () => {
  const sdk = readFileSync(
    join(process.cwd(), 'node_modules/@supabase/storage-js/dist/index.mjs'),
    'utf-8',
  );

  /** `uploadOrUpdate`'s body, from its signature to the request it issues. */
  function uploadOrUpdateBody(): string {
    const start = sdk.indexOf('async uploadOrUpdate(');
    expect(start, 'uploadOrUpdate should exist in the vendored SDK').toBeGreaterThan(-1);
    const end = sdk.indexOf('async upload(', start);
    expect(end).toBeGreaterThan(start);
    return sdk.slice(start, end);
  }

  it('routes a Blob through FormData rather than a raw body', () => {
    expect(uploadOrUpdateBody()).toContain('fileBody instanceof Blob');
    expect(uploadOrUpdateBody()).toContain('new FormData()');
  });

  it('sets a content-type header only on the branch a Blob never reaches', () => {
    const body = uploadOrUpdateBody();
    const blobBranch = body.slice(
      body.indexOf('fileBody instanceof Blob'),
      body.indexOf('fileBody instanceof FormData'),
    );
    // If this ever contains contentType, the SDK started honouring the option
    // and the reasoning behind `typedFile` needs revisiting — it stays correct
    // either way, but the comment explaining it would no longer be true.
    expect(blobBranch).not.toContain('contentType');
    expect(body).toContain('headers["content-type"] = options.contentType');
  });
});
