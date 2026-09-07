/**
 * Golf Message Attachments - Storage Utilities
 *
 * Handles file uploads and URL generation for message attachments.
 * Uses Supabase Storage with signed URLs for secure access.
 */

import { describeError } from '@/lib/utils/describe-error';
import { createClient } from '@/lib/supabase/client';
import { resolveMimeType } from './mime';
import { convertHeicToJpeg } from './heic-to-jpeg';

// Constants
export const STORAGE_BUCKET = 'golf-attachments';

/** Object cache lifetime, in seconds. Sent on both upload paths. */
const CACHE_CONTROL_SECONDS = '3600';

// File size limits by type (in bytes)
export const FILE_SIZE_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024,    // 10MB for images
  video: 100 * 1024 * 1024,   // 100MB for videos
  document: 25 * 1024 * 1024, // 25MB for documents
  audio: 25 * 1024 * 1024,    // 25MB for audio
};

// Max file size (largest allowed)
const MAX_FILE_SIZE = Math.max(...Object.values(FILE_SIZE_LIMITS));

// Allowed file types and their categories
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  // Videos
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-msvideo': 'video',
  'video/3gpp': 'video',
  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/mp4': 'audio',
  'audio/m4a': 'audio',
  'audio/x-m4a': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
};

type AttachmentFileType = 'image' | 'video' | 'document' | 'audio';

export interface AttachmentMetadata {
  fileName: string;
  fileType: AttachmentFileType;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

interface UploadResult {
  success: boolean;
  storagePath?: string;
  url?: string;
  thumbnailUrl?: string;
  metadata?: AttachmentMetadata;
  error?: string;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  metadata: AttachmentMetadata;
  uploadProgress: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  storagePath?: string;
  url?: string;
  error?: string;
}

/**
 * Extension -> mime, for the case where the browser reports NOTHING.
 *
 * iOS does this. Reproduced against production 2026-08-31 by dispatching the
 * three shapes an iPhone actually hands back:
 *
 *   HEIC, type "image/heic"   -> accepted
 *   HEIC, type ""             -> SILENTLY DROPPED
 *   camera capture, type ""   -> SILENTLY DROPPED
 *
 * `ALLOWED_MIME_TYPES[""]` is undefined, so the file was rejected before any
 * request was made — no preview, no error, no log. That is "we can't do
 * pictures" on a phone, in one line, while the same photo attaches fine from a
 * desktop because desktop browsers populate `type`.
 *
 * Only consulted when the browser gave us nothing usable; a reported type
 * always wins. The extension is a weaker signal than a real mime type, which
 * is why it is the fallback rather than the primary — and the Storage bucket
 * re-checks `allowed_mime_types` server-side regardless, so a lie here cannot
 * put an unsupported object in the bucket.
 */
export function resolveFileMimeType(file: File): string {
  // "Usable" here means the messages allow-list recognises it — a type this
  // path could not upload anyway is no better than none.
  return resolveMimeType(file, (t) => Boolean(ALLOWED_MIME_TYPES[t]));
}

/**
 * Validate a file for upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check mime type first to get the file category. Falls back to the
  // extension when the browser reported no usable type — see
  // EXTENSION_MIME_FALLBACK: iOS reports "" for camera captures and some HEIC
  // picks, and without this every one of those was dropped in silence.
  const fileType = ALLOWED_MIME_TYPES[resolveFileMimeType(file)];
  if (!fileType) {
    return {
      valid: false,
      error: 'File type not supported. Please upload images, videos, documents, or audio files.',
    };
  }

  // Get the size limit for this file type
  const sizeLimit = FILE_SIZE_LIMITS[fileType] || MAX_FILE_SIZE;

  // Check file size against type-specific limit
  if (file.size > sizeLimit) {
    return {
      valid: false,
      error: `File too large. Maximum size for ${fileType}s is ${formatFileSize(sizeLimit)}.`,
    };
  }

  return { valid: true };
}

/**
 * Get file type category from mime type
 */
function getFileType(mimeType: string): AttachmentFileType {
  return (ALLOWED_MIME_TYPES[mimeType] as AttachmentFileType) || 'document';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Generate a unique storage path for the file
 */
function generateStoragePath(
  conversationId: string,
  messageId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `conversations/${conversationId}/${messageId}/${timestamp}_${sanitizedName}`;
}

/**
 * Get image dimensions from a File
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Get video metadata from a File
 */
function getVideoMetadata(
  file: File
): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Math.round(video.duration),
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      reject(new Error('Failed to load video'));
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
}

/** What the transport did, flattened for the caller's one decision. */
interface TransportOutcome {
  success: boolean;
  /** 0 for a transport failure — no response was read. */
  status: number;
  error?: string;
}

/**
 * PUT a file to a signed upload URL, reporting REAL transfer progress (G-09b).
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: `xhr.upload.onprogress`
 * is the only upload-progress signal a browser gives without a streaming
 * request body, and it is the same signal `xhr.abort()` makes cancellable
 * (G-24). No new dependency, and nothing here that a TUS client would add.
 *
 * The headers are copied from the SDK's own raw-body branch
 * (`@supabase/storage-js/dist/index.mjs:631-636`) rather than invented — that
 * branch is the proof this endpoint accepts a raw body PUT. Note what is NOT
 * here: no `Authorization`, no `apikey`. The token travels in the query
 * string, which is what makes a bare XHR work at all.
 */
function putWithProgress(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<TransportOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('cache-control', `max-age=${CACHE_CONTROL_SECONDS}`);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!onProgress) return;
      // NO NUMBER WHEN THERE IS NO NUMBER. Without a computable length
      // `event.total` is 0, and `loaded / total` is NaN or Infinity —
      // reporting anything derived from it is precisely the fabricated
      // progress §1.1 forbids and G-09 is named for. The bar stays where it
      // is, which is the honest reading of "we cannot tell".
      if (!event.lengthComputable || event.total <= 0) return;
      // Capped below 100 while bytes are still moving: the last byte leaving
      // this device is not the upload succeeding, and the difference is
      // exactly the window in which the server can still refuse it. 100 is
      // reported by the caller, once the response says so.
      onProgress(Math.min(99, (event.loaded / event.total) * 100));
    };

    xhr.onload = () =>
      resolve({
        success: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        error: xhr.responseText || undefined,
      });
    xhr.onerror = () => resolve({ success: false, status: 0, error: 'Network error during upload' });
    xhr.ontimeout = () => resolve({ success: false, status: 0, error: 'Upload timed out' });

    xhr.send(file);
  });
}

/**
 * Upload the bytes, preferring the path that can report progress (G-09b).
 *
 * Replaces a hardcoded 10 / 90 / 100. Those constants were not merely
 * approximate, they were unconnected to the transfer — and until G-09a wired
 * the callback through they reached no pixel either, so nothing false was ever
 * on screen. This is the signal that makes the bar mean something.
 *
 * WHEN THE FALLBACK FIRES, and why it is narrower than "anything that is not
 * 2xx": a signing failure and a transport failure are cases where the server
 * never answered, so trying the other path can still succeed. A 4xx IS an
 * answer — the request was refused, and since G-61 both paths send the same
 * mime type for the same bytes, re-sending them through `.upload()` would
 * collect the same refusal at twice the latency. 5xx is kept because a server
 * fault is not a verdict about this request.
 *
 * The fallback reports 0 and then 100 and nothing between. `.upload()` gives
 * no transfer signal at all, and the shimmer overlay at 0% already reads as
 * "working" without claiming a fraction that nobody measured.
 */
async function uploadBytes(
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
  file: File,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<{ success: boolean; error?: string }> {
  if (typeof XMLHttpRequest !== 'undefined') {
    const { data: signed, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signError || !signed?.signedUrl) {
      console.warn(
        '[Attachments] Could not sign an upload URL; falling back to the SDK upload:',
        describeError(signError),
      );
    } else {
      const put = await putWithProgress(signed.signedUrl, file, contentType, onProgress);
      if (put.success) return { success: true };

      if (put.status >= 400 && put.status < 500) {
        return { success: false, error: put.error || `Upload rejected (${put.status})` };
      }

      console.warn(
        `[Attachments] Signed upload failed (status ${put.status}); falling back to the SDK upload:`,
        put.error,
      );
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: CACHE_CONTROL_SECONDS,
      upsert: false,
      // Kept for the raw-body branch, which DOES read it. For the Blob body
      // this call passes it is inert — see the `typedFile` note in
      // `uploadAttachment`, which is what actually carries the type.
      contentType,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }
  return { success: true };
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadAttachment(
  file: File,
  conversationId: string,
  messageId: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  const supabase = createClient();

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // HEIC in, JPEG out — on the one device that can decode it.
  //
  // An iPhone photo uploads fine as HEIC and then renders as a BROKEN IMAGE
  // for every teammate on desktop Chrome, Firefox or Android, because the
  // thread renders attachments with a plain <img>. Converting here, on the
  // device that HAS the photo, means what lands in storage is displayable
  // everywhere. If this device cannot decode HEIC the original comes back
  // unchanged and the upload proceeds exactly as before — never worse.
  //
  // Everything below describes the file that is ACTUALLY stored: its name (so
  // the extension matches the bytes), its size, and its type.
  const uploadFile = await convertHeicToJpeg(file, resolveFileMimeType(file));

  // Generate storage path
  const storagePath = generateStoragePath(conversationId, messageId, uploadFile.name);

  // One resolved type for the whole upload. Using a raw `type` here would
  // record an empty mimeType and categorise the file as a 'document'.
  const resolvedMimeType = resolveFileMimeType(uploadFile);
  const fileType = getFileType(resolvedMimeType);
  const metadata: AttachmentMetadata = {
    fileName: uploadFile.name,
    fileType,
    mimeType: resolvedMimeType,
    fileSize: uploadFile.size,
  };

  /**
   * G-61 — put the resolved type where the SDK will actually read it.
   *
   * The `contentType` option below is INERT for this call. `.upload()` sends a
   * Blob body down `uploadOrUpdate`'s FormData branch
   * (`@supabase/storage-js/dist/index.mjs:622-626`), which appends the file and
   * never touches `options.contentType`; only the raw-body branch at 631-636
   * sets a `content-type` header from it. A `File` IS a Blob, and
   * `convertHeicToJpeg` returns the ORIGINAL file untouched for anything that
   * is not HEIC — so the mime the Storage API sees is the file's own `type`,
   * and for an iOS camera capture that reports `""` the browser labels the
   * multipart part `application/octet-stream`. That is exactly the rejection
   * the `contentType` option was added to prevent, and it never prevented it.
   *
   * Retyping the Blob is the fix that does not depend on the SDK's branch:
   * whichever body shape it chooses, the type is on the bytes.
   * `heic-to-jpeg.ts:69` builds a File the same way, so this is the local
   * idiom rather than a new one, and it costs nothing when the type already
   * agrees (the common case returns the same object).
   */
  const typedFile =
    uploadFile.type === resolvedMimeType
      ? uploadFile
      : new File([uploadFile], uploadFile.name, {
          type: resolvedMimeType,
          lastModified: uploadFile.lastModified,
        });

  // Get dimensions for images/videos and duration for audio
  try {
    if (fileType === 'image') {
      const dims = await getImageDimensions(uploadFile);
      metadata.width = dims.width;
      metadata.height = dims.height;
    } else if (fileType === 'video') {
      const videoMeta = await getVideoMetadata(file);
      metadata.width = videoMeta.width;
      metadata.height = videoMeta.height;
      metadata.durationSeconds = videoMeta.durationSeconds;
    } else if (fileType === 'audio') {
      const audioMeta = await getAudioMetadata(file);
      metadata.durationSeconds = audioMeta.durationSeconds;
    }
  } catch (err) {
    // Non-critical, continue with upload
    console.warn('[Attachments] Failed to get media metadata:', describeError(err));
  }

  // Zero, because zero is true: nothing has been transferred yet.
  onProgress?.(0);

  const transfer = await uploadBytes(
    supabase,
    storagePath,
    typedFile,
    resolvedMimeType,
    onProgress,
  );

  if (!transfer.success) {
    console.error('[Attachments] Upload error:', transfer.error);
    return {
      success: false,
      error: `Upload failed: ${transfer.error}`,
    };
  }

  // The bytes are stored. Reported HERE and not from the progress handler,
  // because "the last byte left this device" and "the server accepted it" are
  // different facts and only the second one is 100%.
  onProgress?.(100);

  // Get signed URL (valid for 1 hour)
  const { data: urlData, error: urlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (urlError || !urlData) {
    console.error('[Attachments] Failed to get signed URL:', describeError(urlError));
    return {
      success: false,
      error: 'Upload succeeded but failed to get URL',
    };
  }

  return {
    success: true,
    storagePath,
    url: urlData.signedUrl,
    metadata,
  };
}

/**
 * Check if a file is an image
 */
export function isImage(mimeType: string): boolean {
  return getFileType(mimeType) === 'image';
}

/**
 * Check if a file is a video
 */
export function isVideo(mimeType: string): boolean {
  return getFileType(mimeType) === 'video';
}

/**
 * Check if a file is audio
 */
export function isAudio(mimeType: string): boolean {
  return getFileType(mimeType) === 'audio';
}

/**
 * Get audio metadata from a File
 */
function getAudioMetadata(file: File): Promise<{ durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve({
        durationSeconds: Math.round(audio.duration),
      });
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => {
      reject(new Error('Failed to load audio'));
      URL.revokeObjectURL(audio.src);
    };
    audio.src = URL.createObjectURL(file);
  });
}
