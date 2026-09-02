/**
 * Resolving a file's mime type when the browser reports nothing.
 *
 * Dependency-free ON PURPOSE. The same logic is needed by a client upload
 * (`lib/storage/attachments.ts`, which imports the BROWSER Supabase client)
 * and by a `'use server'` action (`app/golf/actions/documents.ts`, which
 * imports the SERVER one). Neither may import the other's client, so the
 * shared part lives here and imports nothing.
 *
 * WHY IT EXISTS. Reproduced against production 2026-08-31: iOS hands back an
 * EMPTY `file.type` for camera captures and some HEIC picks. That breaks two
 * separate things, and both must be fixed or the failure just moves:
 *
 *   1. Validation keyed on `ALLOWED_MIME_TYPES[file.type]` rejects the file
 *      before any request — silently, since nothing reaches the network.
 *   2. `.upload(path, file)` without an explicit `contentType` lets the SDK
 *      infer `application/octet-stream` from the same blank type, and BOTH
 *      buckets (`golf-attachments`, `documents`) list explicit
 *      `allowed_mime_types` that exclude it — so the object is refused.
 */

/** Extension -> mime, consulted only when the browser gave us nothing usable. */
export const EXTENSION_MIME_FALLBACK: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4a: 'audio/m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
};

/**
 * The mime type to USE for a file: what the browser reported when that is
 * usable, otherwise what its extension implies.
 *
 * `isUsable` lets a caller apply its own notion of "usable" — the messages
 * path only accepts types in its own allow-list, while the documents path
 * accepts any non-empty type the bucket will take. Default: any non-empty
 * string. A reported type always wins when it passes that test; the extension
 * is a weaker signal and never overrides one.
 */
export function resolveMimeType(
  file: { name: string; type: string },
  isUsable: (type: string) => boolean = (t) => t.length > 0,
): string {
  if (file.type && isUsable(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME_FALLBACK[ext] ?? file.type;
}
