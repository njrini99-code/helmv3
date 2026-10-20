import { resolveMimeType } from '@/lib/storage/mime';

/**
 * What Team Hub's Documents takes: the file types Fairway's Documents offers in its picker (UPLOAD_ACCEPT in
 * FairwayDocuments.tsx), which are exactly the `documents` bucket's allowed_mime_types, and the bucket's 25 MB limit
 * (file_size_limit 26214400; read from production 2026-10-17). A file outside them is refused before anything is sent,
 * so it never reaches storage only to come back as a failed upload.
 */
export const HUB_UPLOAD_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'text/markdown',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/zip',
];

/** The picker's `accept`, the same string Fairway's Documents passes. */
export const HUB_UPLOAD_ACCEPT = HUB_UPLOAD_TYPES.join(',');

export const HUB_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** Why a file can't be shared, in the page's words, or null when it can. The type is the one the upload will send. */
export function uploadRefusal(file: { name: string; type: string; size: number }): { title: string; body: string } | null {
  if (!HUB_UPLOAD_TYPES.includes(resolveMimeType(file))) {
    return { title: `${file.name} can’t be shared`, body: 'Team Hub takes PDF, Word, Excel, PowerPoint, images, text, CSV, video and ZIP files.' };
  }
  if (file.size > HUB_UPLOAD_MAX_BYTES) {
    return { title: `${file.name} is too large`, body: 'Files can be up to 25 MB.' };
  }
  return null;
}
