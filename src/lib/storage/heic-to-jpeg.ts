/**
 * Convert an Apple HEIC/HEIF photo to JPEG before it is uploaded.
 *
 * WHY. HEIC is not a web-displayable format outside Apple platforms. An
 * iPhone photo uploads fine and then renders as a BROKEN IMAGE for every
 * teammate on desktop Chrome, Firefox, or Android, because both the composer
 * preview and the message thread render attachments with a plain
 * `<img src=…>`. From the recipient's side that is still "we can't do
 * pictures", and no amount of mime-type fixing changes it — the bytes really
 * are undecodable there.
 *
 * WHERE IT WORKS. Conversion happens on the DEVICE THAT HAS THE PHOTO, which
 * is the one platform guaranteed to decode HEIC: iOS. `createImageBitmap`
 * uses the OS decoder, so Safari and the Capacitor WKWebView succeed exactly
 * where the file comes from. A desktop browser that cannot decode HEIC simply
 * fails the attempt — and that is fine, because it is also the platform that
 * almost never has a HEIC to send.
 *
 * FAILURE IS NOT AN ERROR. If decoding fails for any reason the ORIGINAL file
 * is returned unchanged and the upload proceeds exactly as it does today. This
 * can only improve the outcome; it can never block a photo that would
 * otherwise have been sent. That property is what makes it safe to run on
 * every image without a feature flag.
 */

/** Quality for the re-encode. 0.9 keeps it visually lossless at roughly a third of PNG size. */
const JPEG_QUALITY = 0.9;

function isHeic(file: File, resolvedType: string): boolean {
  const type = (resolvedType || file.type || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif';
}

/**
 * Returns a JPEG File when the input is HEIC/HEIF and this device can decode
 * it; otherwise returns the input untouched.
 */
export async function convertHeicToJpeg(file: File, resolvedType = ''): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!isHeic(file, resolvedType)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  try {
    // `imageOrientation: 'from-image'` applies the EXIF rotation while
    // decoding. Without it, a photo taken in portrait arrives sideways —
    // a canvas re-encode drops EXIF, so the rotation has to be baked in here
    // or it is lost for good.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob || blob.size === 0) return file;

    const name = file.name.replace(/\.(heic|heif)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    // Undecodable here (a desktop browser, most likely). Send the original —
    // strictly no worse than before this function existed.
    return file;
  }
}
