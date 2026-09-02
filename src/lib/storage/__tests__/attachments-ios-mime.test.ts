/**
 * A photo from an iPhone must attach.
 *
 * Reproduced against PRODUCTION on 2026-08-31 by dispatching the three shapes
 * an iPhone actually hands back into the live composer:
 *
 *   HEIC, type "image/heic"    -> accepted
 *   HEIC, type ""              -> SILENTLY DROPPED
 *   camera capture, type ""    -> SILENTLY DROPPED
 *
 * `ALLOWED_MIME_TYPES[""]` is undefined, so `validateFile` rejected the file
 * before any request was made — no preview, no error, no log, no network call.
 * That is "we can't do pictures" on a phone, while the identical photo
 * attaches fine from a desktop because desktop browsers populate `type`.
 *
 * Two halves, and BOTH are needed:
 *   1. validation must accept the file (this was the visible symptom), and
 *   2. the upload must send a real `contentType`, because the SDK otherwise
 *      infers `application/octet-stream` from the same blank `file.type` and
 *      the bucket's `allowed_mime_types` rejects the object. Fixing only (1)
 *      moves the failure from the picker to the Storage API.
 */
import { describe, it, expect } from 'vitest';
import { validateFile, resolveFileMimeType } from '../attachments';

const bytes = () => new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);

describe('attachments — a browser that reports no mime type', () => {
  it('accepts an iOS HEIC with an EMPTY type, via its extension', () => {
    const file = new File([bytes()], 'IMG_0002.HEIC', { type: '' });
    expect(resolveFileMimeType(file)).toBe('image/heic');
    expect(validateFile(file).valid).toBe(true);
  });

  it('accepts a camera capture with an empty type and a generic name', () => {
    const file = new File([bytes()], 'image.jpg', { type: '' });
    expect(resolveFileMimeType(file)).toBe('image/jpeg');
    expect(validateFile(file).valid).toBe(true);
  });

  it('is case-insensitive about the extension', () => {
    expect(resolveFileMimeType(new File([bytes()], 'PHOTO.JPEG', { type: '' }))).toBe('image/jpeg');
    expect(resolveFileMimeType(new File([bytes()], 'clip.MOV', { type: '' }))).toBe('video/quicktime');
  });

  it('prefers a reported type over the extension', () => {
    // A real type always wins; the extension is only a fallback.
    const file = new File([bytes()], 'photo.jpg', { type: 'image/png' });
    expect(resolveFileMimeType(file)).toBe('image/png');
  });

  it('still rejects something genuinely unsupported', () => {
    const file = new File([bytes()], 'malware.exe', { type: '' });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not supported/i);
  });

  it('still enforces the size limit on a fallback-typed file', () => {
    const big = new File([new Uint8Array(30 * 1024 * 1024)], 'IMG_0003.HEIC', { type: '' });
    const result = validateFile(big);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });
});
