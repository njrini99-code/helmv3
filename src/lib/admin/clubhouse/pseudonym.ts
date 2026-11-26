import 'server-only';

import { createHash, createHmac } from 'node:crypto';

/**
 * Pseudonyms for people, teams and sessions in anything that leaves a Bridge screen: context packs, the Duet door,
 * Copy reports (plan D7). Keyed (HMAC-SHA256), so a list of candidate user ids cannot be hashed back to a pseudonym:
 * an unkeyed hash of a uuid is reversible by anyone holding the ids, which appear in URLs, logs and Sentry.
 *
 * The key is BRIDGE_PSEUDONYM_KEY (32+ characters, server only). Without it, a key is derived from the service-role
 * secret this server already holds, so pseudonyms work with no extra setup and never leave the server. With neither,
 * every pseudonym is `…-withheld`: a pack then says who it is about by role only.
 */
export const PSEUDONYM_KEY_ENV = 'BRIDGE_PSEUDONYM_KEY';
const MIN_KEY_LENGTH = 32;

export type PseudonymKind = 'person' | 'team' | 'session';
const PREFIX: Record<PseudonymKind, string> = { person: 'u', team: 't', session: 's' };

export function pseudonymKey(env: Record<string, string | undefined> = process.env): string | null {
  const own = env[PSEUDONYM_KEY_ENV];
  if (own && own.length >= MIN_KEY_LENGTH) return own;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (service && service.length >= MIN_KEY_LENGTH) return createHash('sha256').update(`bridge-pseudonym:${service}`).digest('hex');
  return null;
}

/** `u-…`, `t-…` or `s-…`: 12 hex of an HMAC over the kind and the id. Null for no id. */
export function bridgePseudonym(kind: PseudonymKind, id: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!id) return null;
  const key = pseudonymKey(env);
  if (!key) return `${PREFIX[kind]}-withheld`;
  return `${PREFIX[kind]}-${createHmac('sha256', key).update(`${kind}:${id}`).digest('hex').slice(0, 12)}`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** PostgREST's `details=` / `hint=` tails (describeError) carry row values such as `Key (player_id)=(<uuid>)`. */
const DETAIL_TAIL = /\s*(?:[;,]\s*)?\b(?:details|hint)=.*$/is;

/** Free text for a pseudonymous paste: no uuids, no PostgREST details or hints. Emails are already redacted upstream. */
export function scrubFreeText(text: string | null | undefined, max = 240): string | null {
  if (!text) return null;
  const out = text.replace(DETAIL_TAIL, '').replace(UUID, '[id]').trim();
  return out ? out.slice(0, max) : null;
}
