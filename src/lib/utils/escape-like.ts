/**
 * Escape a user string for use inside a PostgREST `like` / `ilike` pattern.
 *
 * The obvious version of this is wrong, and shipped twice:
 *
 *   query.replace(/%/g, '\\%').replace(/_/g, '\\_')
 *
 * It escapes the two wildcards but never escapes the ESCAPE CHARACTER, so a
 * backslash the user typed survives into the pattern and changes what the
 * following character means:
 *
 *   input  `a\%b`  ->  `a\\%b`  ->  LIKE reads `\\` as a literal backslash and
 *                                   then `%` as a LIVE WILDCARD — precisely the
 *                                   thing the escaping exists to prevent.
 *   input  `100\`  ->  `100\`    ->  a trailing escape with nothing to escape,
 *                                   which is a malformed pattern.
 *
 * The escape character must be handled TOGETHER WITH the wildcards, in one
 * pass — escaping `%`/`_` first and the backslash afterwards would mangle the
 * escapes just added.
 *
 * Flagged by CodeQL as js/incomplete-sanitization (2 high alerts, one per
 * call site).
 */
export function escapeLikePattern(value: string): string {
  // Single pass over all three characters, matching the CORRECT copies that
  // already exist locally in demo-request.ts and the gmail-replies cron. A
  // comment beside one of them asks for exactly this shared home. Those two are
  // left in place for now — this change is scoped to the two search call sites
  // that were actually wrong.
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
