/**
 * Is this string shaped like a UUID?
 *
 * Route params are strings, and Postgres rejects a non-UUID with
 * `22P02 invalid input syntax for type uuid` — which the `[id]` pages then
 * (correctly) treated as an unreadable row and turned into a 500, when the
 * honest answer to `/roster/not-a-real-uuid-12345` is a 404. Validate the
 * shape before it reaches the database.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
