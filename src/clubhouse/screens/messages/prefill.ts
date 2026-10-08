/**
 * Prefilled Messages (owner, 2026-10-08, D2-7): an action that reaches players never sends. It opens Messages with the
 * recipients chosen and a draft written; the coach reads it and presses Send.
 *
 *   /golf/dashboard/messages?players=<golf_players.id,...>&draft=<text>&title=<group name>
 *
 * One player opens their direct thread with the draft in its composer (or New message, seeded, when there is no thread
 * yet: nothing is created until the coach presses on). Two or more open New message as a group, named `title`.
 */
export const MESSAGES = '/golf/dashboard/messages';

export interface ChPrefill {
  /** golf_players ids. */
  players: string[];
  draft: string;
  /** The group's name when there are two or more. */
  title?: string;
}

export function messagesPrefillHref({ players, draft, title }: ChPrefill): string {
  const q = new URLSearchParams();
  q.set('players', players.join(','));
  if (draft) q.set('draft', draft);
  if (title && players.length > 1) q.set('title', title);
  return `${MESSAGES}?${q.toString()}`;
}

/** The prefill a Messages URL carries, or null. Ids are deduplicated; a draft is capped at 2,000 characters. */
export function readPrefill(params: { get: (k: string) => string | null }): ChPrefill | null {
  const raw = params.get('players');
  if (!raw) return null;
  const players = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!players.length) return null;
  const title = params.get('title')?.trim().slice(0, 80) || undefined;
  return { players, draft: (params.get('draft') ?? '').slice(0, 2000), title };
}
