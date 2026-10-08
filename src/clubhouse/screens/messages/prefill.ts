/**
 * Prefilled Messages (owner, 2026-10-08, D2-7): an action that reaches players never sends. It opens Messages with the
 * recipients chosen and a draft written; the coach reads it and presses Send.
 *
 *   /golf/dashboard/messages?prefill=<key>
 *
 * The URL carries only an opaque key. The recipients, the draft and the group's name stay in this tab's
 * sessionStorage under that key: a draft can name a player's health or schoolwork, and a query string lands in server,
 * Vercel and Sentry logs and in browser history. Messages takes the entry once and deletes it (`takePrefill`). A cold
 * link, a new tab or a used key finds nothing and opens Messages as usual; the coach just types.
 *
 * One player opens their direct thread with the draft in its composer (or New message, seeded, when there is no thread
 * yet: nothing is created until the coach presses on). Two or more open New message as a group, named `title`.
 * Messages checks the recipients against the team and leaves out, and says so, anyone who isn't on it.
 */
export const MESSAGES = '/golf/dashboard/messages';

const STORE = 'ch.messages.prefill.';

export interface ChPrefill {
  /** golf_players ids. */
  players: string[];
  draft: string;
  /** The group's name when there are two or more. */
  title?: string;
}

/**
 * The key for a prefill: a hash of what it holds, so the same prefill gives the same href on the server and in the
 * browser (no hydration mismatch) and nothing of the draft can be read from it.
 */
function keyOf(p: ChPrefill): string {
  const s = JSON.stringify([p.players, p.draft, p.title ?? '']);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/**
 * The href that opens Messages with this prefill. In the browser it also keeps the prefill in sessionStorage under the
 * href's key (the same prefill writes the same entry, so calling it on every render is harmless). With no players it
 * returns null: there is nobody to write to.
 */
export function messagesPrefillHref({ players, draft, title }: ChPrefill): string | null {
  const ids = [...new Set(players.filter(Boolean))];
  if (!ids.length) return null;
  const p: ChPrefill = { players: ids, draft: draft.slice(0, 2000), title: ids.length > 1 ? title?.slice(0, 80) || undefined : undefined };
  const key = keyOf(p);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(STORE + key, JSON.stringify(p));
    } catch {
      // No storage (private mode, blocked): the link still opens Messages, with an empty composer.
    }
  }
  return `${MESSAGES}?prefill=${key}`;
}

/** The prefill a Messages URL points at, read once: the entry is deleted as it is read. Null when there is none. */
export function takePrefill(params: { get: (k: string) => string | null }): ChPrefill | null {
  const key = params.get('prefill');
  if (!key || typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORE + key);
    window.sessionStorage.removeItem(STORE + key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ChPrefill>;
    const players = Array.isArray(v.players) ? [...new Set(v.players.filter((x): x is string => typeof x === 'string' && !!x))] : [];
    if (!players.length) return null;
    const draft = typeof v.draft === 'string' ? v.draft.slice(0, 2000) : '';
    const title = typeof v.title === 'string' ? v.title.trim().slice(0, 80) || undefined : undefined;
    return { players, draft, title };
  } catch {
    return null;
  }
}

/** The prefill's players split by whether they are on the team (`known`), keeping their order. */
export function onRoster(players: string[], known: (id: string) => boolean): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const id of players) (known(id) ? kept : dropped).push(id);
  return { kept, dropped };
}
