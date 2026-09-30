/**
 * What the `recruit-documents` bucket takes, in one plain module (a server-action file may only export async
 * functions, so these cannot live in recruit-documents.ts). The bucket's own allowlist and size cap are set by
 * supabase/migrations/20260930140000_recruit_documents_film.sql; the numbers here are the ones that migration sets, so
 * the page can refuse a file before sending it. Storage still enforces its own limits, and the page says so when it
 * refuses a file this module let through (the bucket not updated yet, or a project-wide upload limit below it).
 */

const MB = 1024 * 1024;

/** Documents and images: the cap the bucket had before film (unchanged for them). */
export const RECRUIT_DOC_MAX_BYTES = 25 * MB;
/** Film. One bucket cap covers every type, so this is also the bucket's `file_size_limit` after the migration. */
export const RECRUIT_FILM_MAX_BYTES = 100 * MB;

/** Extension to canonical MIME for everything the bucket's allowlist takes (the first fifteen were its allowlist from the start). */
export const RECRUIT_DOC_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
};

export const RECRUIT_FILM_EXTENSIONS = ['mp4', 'mov', 'm4v'] as const;

export function recruitDocExtension(fileName: string): string {
  return fileName.includes('.') ? (fileName.split('.').pop() ?? '').toLowerCase() : '';
}

export const isRecruitFilmExtension = (ext: string): boolean => (RECRUIT_FILM_EXTENSIONS as readonly string[]).includes(ext);

/** The largest file a name's extension may carry. Film gets the bucket's full cap; everything else stays at 25 MB. */
export const recruitDocMaxBytes = (ext: string): number => (isRecruitFilmExtension(ext) ? RECRUIT_FILM_MAX_BYTES : RECRUIT_DOC_MAX_BYTES);

/** The canonical type for an extension the bucket takes, or null (an own-property read, so `constructor` or `__proto__` never pass). */
export const recruitDocMime = (ext: string): string | null =>
  Object.prototype.hasOwnProperty.call(RECRUIT_DOC_MIME_BY_EXT, ext) ? (RECRUIT_DOC_MIME_BY_EXT[ext] ?? null) : null;
