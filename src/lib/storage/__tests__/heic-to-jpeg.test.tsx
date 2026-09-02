/**
 * HEIC must not reach a teammate's screen.
 *
 * An iPhone photo uploads fine as HEIC and then renders as a BROKEN IMAGE for
 * every teammate on desktop Chrome, Firefox or Android — both the composer
 * preview and the message thread use a plain `<img src=…>`, and those engines
 * cannot decode HEIC. From the recipient's side that is still "we can't do
 * pictures", and fixing mime types does not help: the bytes genuinely are
 * undecodable there.
 *
 * The load-bearing property is the FALLBACK. Conversion runs on every image,
 * with no feature flag, and that is only safe because a failure returns the
 * ORIGINAL file and the upload proceeds exactly as before. It can improve the
 * outcome; it can never block a photo that would otherwise have been sent.
 * These tests assert that in the cases that actually occur — a device with no
 * HEIC decoder, and a decoder that throws.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { convertHeicToJpeg } from '../heic-to-jpeg';

const original = globalThis.createImageBitmap;

afterEach(() => {
  globalThis.createImageBitmap = original;
  vi.restoreAllMocks();
});

const heic = () => new File([new Uint8Array([0, 0, 0, 24])], 'IMG_0001.HEIC', { type: 'image/heic' });

describe('convertHeicToJpeg', () => {
  it('returns a non-HEIC file untouched, without attempting a decode', async () => {
    const decode = vi.fn();
    globalThis.createImageBitmap = decode as unknown as typeof createImageBitmap;

    const jpeg = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    expect(await convertHeicToJpeg(jpeg)).toBe(jpeg);
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns the ORIGINAL when this device cannot decode HEIC', async () => {
    // Desktop Chrome: the API exists but rejects on HEIC bytes.
    globalThis.createImageBitmap = vi.fn(async () => {
      throw new Error('The source image cannot be decoded');
    }) as unknown as typeof createImageBitmap;

    const file = heic();
    const result = await convertHeicToJpeg(file);
    // Same reference: the upload proceeds exactly as it did before.
    expect(result).toBe(file);
  });

  it('returns the original when the platform has no createImageBitmap at all', async () => {
    // @ts-expect-error — deliberately removing the API this guard checks for.
    globalThis.createImageBitmap = undefined;
    const file = heic();
    expect(await convertHeicToJpeg(file)).toBe(file);
  });

  it('detects HEIC by extension even when the browser reported no type', async () => {
    const decode = vi.fn(async () => { throw new Error('nope'); });
    globalThis.createImageBitmap = decode as unknown as typeof createImageBitmap;

    // The iOS case: empty type, .HEIC name. It must still be TREATED as HEIC,
    // otherwise the conversion is skipped for exactly the files that need it.
    const blank = new File([new Uint8Array([0])], 'IMG_0002.HEIC', { type: '' });
    await convertHeicToJpeg(blank);
    expect(decode).toHaveBeenCalledTimes(1);
  });
});
