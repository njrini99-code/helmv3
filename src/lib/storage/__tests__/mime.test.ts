/**
 * The shared mime resolver, used by BOTH upload paths.
 *
 * Reproduced against production 2026-08-31: iOS reports an EMPTY `file.type`
 * for camera captures and some HEIC picks. That breaks two things, and fixing
 * only one moves the failure rather than removing it:
 *
 *   1. Validation keyed on the reported type rejects the file before any
 *      request — silently, since nothing reaches the network.
 *   2. `.upload(path, file)` with no explicit `contentType` lets the SDK infer
 *      `application/octet-stream` from that same blank type. BOTH buckets
 *      declare `allowed_mime_types` that exclude it, so Storage refuses the
 *      object.
 *
 * (2) is why `golf_documents` held 5 rows, every one a PDF and not one image:
 * any image would have had to come from a desktop browser, which populates
 * `file.type`.
 */
import { describe, it, expect } from 'vitest';
import { resolveMimeType } from '../mime';

const f = (name: string, type = '') => ({ name, type });

describe('resolveMimeType', () => {
  it('falls back to the extension when the browser reports nothing', () => {
    expect(resolveMimeType(f('IMG_0001.HEIC'))).toBe('image/heic');
    expect(resolveMimeType(f('image.jpg'))).toBe('image/jpeg');
    expect(resolveMimeType(f('clip.MOV'))).toBe('video/quicktime');
    expect(resolveMimeType(f('packet.pdf'))).toBe('application/pdf');
  });

  it('prefers a reported type over the extension', () => {
    // The extension is the weaker signal and must never override a real type.
    expect(resolveMimeType(f('photo.jpg', 'image/png'))).toBe('image/png');
  });

  it('honours a caller-supplied notion of "usable"', () => {
    // The messages path only accepts types its own allow-list knows; a type it
    // could not upload anyway is no better than none.
    const onlyJpeg = (t: string) => t === 'image/jpeg';
    expect(resolveMimeType(f('IMG.HEIC', 'image/tiff'), onlyJpeg)).toBe('image/heic');
    expect(resolveMimeType(f('IMG.jpg', 'image/jpeg'), onlyJpeg)).toBe('image/jpeg');
  });

  it('returns the original (empty) type for an unknown extension', () => {
    // Never invents a type it cannot justify — the caller still rejects it.
    expect(resolveMimeType(f('payload.exe'))).toBe('');
  });
});
