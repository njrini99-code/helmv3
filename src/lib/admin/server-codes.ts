/**
 * Postgres and PostgREST codes in plain words, for the admin (the Bridge error feed, Speed, the team Errors tab).
 *
 * Source of truth for PostgREST: https://docs.postgrest.org/en/stable/references/errors.html (read 2026-11-26), which
 * also maps SQLSTATE classes to HTTP statuses. Postgres: the SQLSTATE appendix. An exact code wins; else its
 * two-character class; else the code is shown as itself. Never shown to coaches or players: `src/lib/db-error.ts`
 * owns end-user wording.
 *
 * Steps name only things that exist: the Fix pack, Replay, Mark expected, Speed, `supabase/migrations/HELD.md`,
 * `npm run test:rls`, `src/lib/types/database.ts`.
 */

/** Who has to act. Drives the chip's word and colour. */
export type CauseOwner = 'access' | 'migration' | 'data' | 'database' | 'timeout' | 'network' | 'app' | 'server' | 'sign-in' | 'person' | 'unknown';

export interface ServerCodeEntry {
  /** Two or three words, for a chip. */
  label: string;
  owner: CauseOwner;
  /** One sentence: what the server said. */
  meaning: string;
  /** What to check, in order. */
  steps: readonly string[];
}

/** Codes that mean "the schema the code expects is not there": usually a migration not applied (or held). */
export const MIGRATION_MISSING_CODES: ReadonlySet<string> = new Set(['42P01', '42703', '42883', '3F000', 'PGRST202', 'PGRST204', 'PGRST205', 'PGRST200']);

const MIGRATION_STEPS = [
  'Compare the table, column or function the action uses with src/lib/types/database.ts (the live schema).',
  'Check supabase/migrations/HELD.md: a held or unapplied migration is the usual cause.',
  'If the schema is right, the API may be serving a stale schema cache; it refreshes on the next migration or a reload.',
] as const;

const RLS_STEPS = [
  'Open the Fix pack: it names the table and the policy the action needs.',
  'Check that this person is on the team the row belongs to (role and team are on the error).',
  'Run npm run test:rls to see whether the policy itself changed.',
] as const;

const TIMEOUT_STEPS = [
  'Open Speed: the slowest queries and pages for this window are there.',
  'Replay the session to see what the person had loaded when it stalled.',
  'If it keeps happening on one action, its query needs an index or a smaller read (Fix pack names the tables).',
] as const;

const EXACT: Readonly<Record<string, ServerCodeEntry>> = {
  // Access and sign-in
  '42501': { label: 'Row rule refused', owner: 'access', meaning: 'A row rule (RLS) or a grant did not let this person read or change the row.', steps: RLS_STEPS },
  PGRST301: { label: 'Session expired', owner: 'sign-in', meaning: 'The sign-in token could not be read or was invalid, usually because it expired.', steps: ['Nothing to fix if it is rare: the app signs the person in again.', 'If many people hit it at once, check the auth settings and token refresh.'] },
  PGRST302: { label: 'Not signed in', owner: 'sign-in', meaning: 'The request carried no sign-in token where one is required.', steps: ['Replay the session: the person may have been signed out mid-action.', 'If it repeats, the call is running before the session is restored.'] },
  PGRST303: { label: 'Session rejected', owner: 'sign-in', meaning: 'The sign-in token’s claims could not be checked.', steps: ['Check the auth settings: the token’s audience or role claim did not match.'] },
  // Data rules
  '23505': { label: 'Already exists', owner: 'data', meaning: 'A row with the same unique value already exists, often a double tap or a retry.', steps: ['Replay the session: a second press or a retry is the usual cause.', 'If it is not a retry, the action should update the existing row instead of adding one.'] },
  '23503': { label: 'Linked row missing', owner: 'data', meaning: 'The row points at another row that does not exist, often one deleted a moment earlier.', steps: ['Replay the session: something it points at (a round, a player, a team) was probably deleted first.', 'If the parent still exists, the action is sending the wrong id.'] },
  '23502': { label: 'Required field empty', owner: 'data', meaning: 'A required field reached the database empty.', steps: ['Open the Fix pack: the form or action skipped a field the table requires.'] },
  '23514': { label: 'Value not allowed', owner: 'data', meaning: 'A value broke a check rule on the table (out of range or not one of the allowed values).', steps: ['Open the Fix pack: the form allowed a value the table does not.'] },
  '23P01': { label: 'Overlaps another', owner: 'data', meaning: 'The row overlaps another one where the table forbids it (an exclusion rule).', steps: ['Replay the session: the person tried to book or save something that clashes with an existing row.'] },
  '22001': { label: 'Text too long', owner: 'data', meaning: 'A value was longer than the column allows.', steps: ['Open the Fix pack: the form needs the same length limit as the column.'] },
  '22P02': { label: 'Bad value format', owner: 'data', meaning: 'A value was the wrong shape for its column (for example text where an id or a number belongs).', steps: ['Open the Fix pack: the action sent a malformed id or number.'] },
  '22003': { label: 'Number out of range', owner: 'data', meaning: 'A number was too large or too small for its column.', steps: ['Open the Fix pack: the form needs the column’s range.'] },
  '22007': { label: 'Bad date', owner: 'data', meaning: 'A date or time was not in a form the database reads.', steps: ['Open the Fix pack: check how the date is built (time zone and format).'] },
  P0001: { label: 'Database rule said no', owner: 'data', meaning: 'A database function refused on purpose; its message says why.', steps: ['Read the message on the Server tab: it is the function’s own reason.', 'If the refusal is correct, Mark expected so the spike rules skip it.'] },
  // Schema and migrations
  '42P01': { label: 'Table missing', owner: 'migration', meaning: 'The table the action uses does not exist in this database.', steps: MIGRATION_STEPS },
  '42703': { label: 'Column missing', owner: 'migration', meaning: 'A column the action uses does not exist.', steps: MIGRATION_STEPS },
  '42883': { label: 'Function missing', owner: 'migration', meaning: 'The database function, or that version of its arguments, does not exist.', steps: MIGRATION_STEPS },
  '3F000': { label: 'Schema missing', owner: 'migration', meaning: 'The schema the action uses does not exist.', steps: MIGRATION_STEPS },
  '42P17': { label: 'Rule loops', owner: 'access', meaning: 'A row rule refers back to itself and never finishes.', steps: ['A policy reads a table whose own policy reads the first one. Run npm run test:rls and break the loop with a security definer function.'] },
  PGRST200: { label: 'Join not found', owner: 'migration', meaning: 'The read embeds a related table, but no foreign key links them (or the schema cache is stale).', steps: MIGRATION_STEPS },
  PGRST201: { label: 'Join ambiguous', owner: 'app', meaning: 'Two foreign keys link the same tables, so the embed must name which one.', steps: ['Open the Fix pack: name the foreign key in the select (table!fk_name).'] },
  PGRST202: { label: 'Function missing', owner: 'migration', meaning: 'The API has no function with that name and those arguments.', steps: MIGRATION_STEPS },
  PGRST203: { label: 'Function ambiguous', owner: 'migration', meaning: 'Two versions of the function match the call.', steps: ['Drop the old overload in a migration, or pass arguments that pick one.'] },
  PGRST204: { label: 'Column missing', owner: 'migration', meaning: 'A column named in the write is not in the API’s schema.', steps: MIGRATION_STEPS },
  PGRST205: { label: 'Table missing', owner: 'migration', meaning: 'The API has no table by that name.', steps: MIGRATION_STEPS },
  // Reads that returned the wrong number of rows
  PGRST116: { label: 'Not exactly one row', owner: 'data', meaning: 'The read asked for exactly one row and got none or more than one. None is the usual case: the row was deleted or the person cannot see it.', steps: ['Replay the session: the row may have been deleted, or this person is not allowed to see it.', 'If several rows match, the read needs a tighter filter or .maybeSingle().'] },
  // Load and time
  '57014': { label: 'Query timed out', owner: 'timeout', meaning: 'The query ran past the statement time limit and was cancelled.', steps: TIMEOUT_STEPS },
  PGRST003: { label: 'Database busy', owner: 'timeout', meaning: 'No database connection came free in time.', steps: ['Check Speed for a burst of slow queries at that minute.', 'If it repeats, something is holding connections (a long query or a cron job).'] },
  '40001': { label: 'Write clash', owner: 'database', meaning: 'Two writes touched the same rows at once and one was rolled back.', steps: ['Usually safe to retry. If it repeats on one action, it is racing another write: Replay the session.'] },
  '40P01': { label: 'Deadlock', owner: 'database', meaning: 'Two writes waited on each other and the database cancelled one.', steps: ['Retry is safe. If it repeats, two actions lock the same rows in opposite order (Fix pack names the tables).'] },
  '53300': { label: 'Too many connections', owner: 'database', meaning: 'The database had no connection slots left.', steps: ['Check Speed and the cron jobs for a burst at that minute.'] },
  '25006': { label: 'Read-only', owner: 'database', meaning: 'A write ran in a read-only transaction.', steps: ['Open the Fix pack: the write is going through a read-only path.'] },
  // Connection
  PGRST000: { label: 'Database unreachable', owner: 'server', meaning: 'The API could not connect to the database.', steps: ['Check the Supabase status and the database’s health; every action fails while this lasts.'] },
  PGRST001: { label: 'Database unreachable', owner: 'server', meaning: 'The API could not connect to the database (an internal error).', steps: ['Check the Supabase status and the database’s health.'] },
  PGRST002: { label: 'Database unreachable', owner: 'server', meaning: 'The API could not reach the database while loading the schema.', steps: ['Check the Supabase status; this follows a restart or an outage.'] },
  // Request shape
  PGRST100: { label: 'Bad query', owner: 'app', meaning: 'The API could not parse the query (a filter or select was malformed).', steps: ['Open the Fix pack: a filter value probably contained a comma or bracket that needs quoting.'] },
  PGRST102: { label: 'Bad request body', owner: 'app', meaning: 'The request body was empty or not valid JSON.', steps: ['Open the Fix pack: the action sent nothing or a malformed body.'] },
  PGRST103: { label: 'Bad page range', owner: 'app', meaning: 'The requested page of rows was out of range.', steps: ['Open the Fix pack: the paging asked past the end.'] },
};

const CLASS: Readonly<Record<string, ServerCodeEntry>> = {
  '08': { label: 'Connection lost', owner: 'server', meaning: 'The connection to the database failed.', steps: ['Check the Supabase status for that minute.'] },
  '22': { label: 'Bad value', owner: 'data', meaning: 'A value did not fit its column.', steps: ['Open the Fix pack: check what the form sends against the column type.'] },
  '23': { label: 'Data rule broken', owner: 'data', meaning: 'The write broke a rule on the table (unique, foreign key, check or required).', steps: ['Replay the session, then open the Fix pack for the table’s rules.'] },
  '25': { label: 'Transaction state', owner: 'database', meaning: 'The transaction was in a state that did not allow this.', steps: ['Open the Fix pack: look for a write after an earlier error in the same call.'] },
  '28': { label: 'Not authorized', owner: 'access', meaning: 'The database rejected the credentials.', steps: ['Check the service keys and auth settings.'] },
  '40': { label: 'Rolled back', owner: 'database', meaning: 'The transaction was rolled back (a clash or deadlock).', steps: ['Retry is usually safe; if it repeats, Replay the session.'] },
  '42': { label: 'Schema or access', owner: 'migration', meaning: 'The query named something the database does not have, or is not allowed to use.', steps: MIGRATION_STEPS },
  '53': { label: 'Out of resources', owner: 'database', meaning: 'The database ran short of memory, disk or connections.', steps: ['Check Speed and the database’s health for that minute.'] },
  '54': { label: 'Query too complex', owner: 'app', meaning: 'The query was too large or too deep.', steps: ['Open the Fix pack: split the read or narrow the filter.'] },
  '55': { label: 'Not ready', owner: 'database', meaning: 'An object was not in the state the query needed (often a lock).', steps: ['Retry; if it repeats, look for a migration or job holding a lock at that minute.'] },
  '57': { label: 'Cancelled', owner: 'timeout', meaning: 'The database cancelled the query (a timeout or an operator).', steps: TIMEOUT_STEPS },
  '58': { label: 'Database fault', owner: 'server', meaning: 'The database hit a system error.', steps: ['Check the Supabase status and logs for that minute.'] },
  P0: { label: 'Function failed', owner: 'data', meaning: 'A database function raised an error.', steps: ['Read the message on the Server tab: it is the function’s own text.'] },
  XX: { label: 'Database fault', owner: 'server', meaning: 'The database hit an internal error.', steps: ['Check the Supabase status and logs for that minute.'] },
};

export type CodeMatch = 'exact' | 'class' | 'none';

/** A server code explained: the exact entry, else its SQLSTATE class, else nothing known. */
export function describeServerCode(code: string | null | undefined): (ServerCodeEntry & { match: CodeMatch; source: 'PostgREST' | 'Postgres' }) | null {
  if (!code) return null;
  const source = code.startsWith('PGRST') ? 'PostgREST' : 'Postgres';
  const exact = EXACT[code];
  if (exact) return { ...exact, match: 'exact', source };
  const cls = code.startsWith('PGRST') ? undefined : CLASS[code.slice(0, 2)];
  if (cls) return { ...cls, match: 'class', source };
  return { label: `Code ${code}`, owner: 'unknown', meaning: `The server answered ${code}, which has no plain-words entry yet.`, steps: ['Look the code up in the Postgres or PostgREST error list, then add it to src/lib/admin/server-codes.ts.'], match: 'none', source };
}

/**
 * The narrow set a reader may treat as "not applied yet" (show as unconfigured, not failed): the function, table or
 * schema itself is absent. A missing column (42703) or a stale embed on an object that exists is a real breakage and
 * stays a failure there, so it is not in this set.
 */
export const NOT_APPLIED_CODES: ReadonlySet<string> = new Set(['PGRST202', '42883', '42P01', '3F000']);

export function isNotAppliedCode(code: string | null | undefined): boolean {
  return !!code && NOT_APPLIED_CODES.has(code);
}

/** True when the code means the schema the code expects is missing (a migration not applied, or held). */
export function isMigrationMissingCode(code: string | null | undefined): boolean {
  return !!code && MIGRATION_MISSING_CODES.has(code);
}
