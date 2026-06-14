/**
 * Client-safe recruit-document category vocabulary.
 *
 * Kept OUT of the `recruit-documents.ts` 'use server' module on purpose: a
 * 'use server' file may only export async functions, so a runtime const array
 * exported from there becomes an action proxy on the client (RECRUIT_DOC_CATEGORIES
 * .map would throw). Importing the vocabulary from this plain module is safe in
 * both server actions and client components.
 */

export const RECRUIT_DOC_CATEGORIES = [
  'note',
  'schedule',
  'transcript',
  'film',
  'other',
] as const;

export type RecruitDocCategory = (typeof RECRUIT_DOC_CATEGORIES)[number];
