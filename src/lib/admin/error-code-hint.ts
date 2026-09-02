/**
 * What an error code MEANS, in one clause — for the incident row's detail
 * panel, where a bare `42501` tells an operator who has not memorised the
 * Postgres appendix nothing at all.
 *
 * Pure, and deliberately small. Only codes this platform has actually
 * produced belong here; a hint for a code nobody has seen is a hint nobody
 * can verify. Unknown codes return `null` and the row renders the bare code,
 * never an invented gloss.
 */

const HINTS: Readonly<Record<string, string>> = {
  // Postgres
  '42501': 'permission denied — row-level security or a missing grant',
  '42P01': 'relation does not exist — a table or view the query names is missing',
  '42703': 'column does not exist',
  '42883': 'function does not exist — often a signature mismatch on an RPC',
  '57014': 'statement timeout — the query ran past the database limit',
  '23505': 'unique constraint violated — a duplicate row',
  '23503': 'foreign key violated — the related row is missing',
  '23502': 'not-null violated — a required column was empty',
  '23514': 'check constraint violated',
  '22P02': 'invalid text representation — a malformed UUID, number or enum value',
  '22001': 'value too long for the column',
  '40001': 'serialization failure — safe to retry',
  '40P01': 'deadlock detected — safe to retry',
  '53300': 'too many connections',
  '08006': 'connection failure',
  P0001: 'raised by a database function (RAISE EXCEPTION)',
  // PostgREST
  PGRST116: 'PostgREST expected exactly one row and got none or several',
  PGRST301: 'PostgREST rejected the JWT — expired or malformed',
  PGRST204: 'PostgREST could not find the column in its schema cache',
  // HTTP-ish codes some paths record
  '401': 'unauthenticated',
  '403': 'forbidden',
  '429': 'rate limited',
  '500': 'upstream server error',
  '502': 'bad gateway — an upstream did not answer',
  '503': 'upstream unavailable',
  '504': 'upstream timed out',
};

/**
 * `provider_*` codes are the operator-gated faults `auto-resolve.ts` refuses
 * to close on silence: a spent balance, a rejected key. They share one hint
 * because they share one fix — a human, not a deploy.
 */
const PROVIDER_PREFIX = 'provider_';

export function describeErrorCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const direct = HINTS[code] ?? HINTS[code.toUpperCase()];
  if (direct) return direct;
  if (code.startsWith(PROVIDER_PREFIX)) {
    return 'provider fault — a credential, quota or plan gate; silence is not recovery';
  }
  return null;
}
