/**
 * scripts/db/query-json.mjs — read rows from `supabase db query --output-format json`.
 *
 * The CLI prints two different JSON documents for the same query, depending
 * on whether it believes an AI agent is driving it (supabase 2.117, `db query`
 * JSON encoder):
 *
 *   - agent detected (CLAUDECODE, CODEX_*, CURSOR_AGENT, AI_AGENT, … or
 *     `--agent yes`): `{"boundary": …, "rows": [ … ], "warning": …}`
 *   - no agent (a GitHub Actions runner, a human terminal, or `--agent no`):
 *     a bare array, `[ … ]`
 *
 * db:apply read `parsed.rows` and defaulted anything else to `[]`. That worked
 * in agent sessions, where it was written and tested, and read every result
 * as ZERO rows on the db-apply workflow's runner: the post-apply ledger
 * re-read and every VERIFY query FAILed after migrations that had applied,
 * and the preflight "ledger does not already carry this version" check
 * passed vacuously on every run.
 *
 * So the args pin `--agent no` (one deterministic shape wherever this runs),
 * and the parser accepts both documented shapes and THROWS on anything else.
 * It never returns a default: callers treat 0 rows as meaningful (preflight
 * reads it as "absent, as expected"), so an unknown shape mapped to `[]` is
 * exactly the bug above.
 */

/** argv for a JSON `db query` against the linked project. */
export function linkedQueryArgs(sql) {
  return ['db', 'query', '--linked', '--agent', 'no', '--output-format', 'json', sql];
}

/** Rows from the CLI's JSON output; throws on any shape it does not recognise. */
export function parseQueryRows(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`'supabase db query' did not return JSON: ${String(raw).slice(0, 200)}`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error(`unexpected response shape from 'supabase db query': ${String(raw).slice(0, 200)}`);
}
