/**
 * OWNER DECISION (bridge-tabs audit, users-01 / utilization-01): test, demo,
 * and internal-staff accounts stay IN every Users/Utilization count — no
 * filtering them out changes what "N users" means platform-wide — but the
 * page must disclose how many of that count are not real customers.
 *
 * No existing DB column marks an account this way (checked
 * `src/lib/types/database.ts` — no `is_test`/`is_internal`/`is_demo` on
 * `users`); the nearest precedent is id-based allowlists like
 * `DEMO_TEAM_IDS` (src/app/golf/actions/admin/demo-teams.ts) and
 * `DEMO_ORGANIZATION_IDS` (./lifting-demo-orgs.ts), which key organizations/
 * teams, not individual user accounts. This is the one small, tested helper
 * for the account-level question, so no caller hand-rolls its own pattern.
 */

const INTERNAL_EMAIL_DOMAIN = '@helmsportslabs.com';

/** Case-insensitive substring match against the email local part and/or a
 *  display name — deliberately broad (a seeded `qa-test-42@...` or a coach
 *  named "E2E Fixture" both count) since the cost of a false positive here
 *  (one real person mislabeled "internal" in a disclosure line) is far lower
 *  than the cost of understating how much of the directory is synthetic. */
const INTERNAL_NAME_PATTERNS: readonly RegExp[] = [/test/i, /demo/i, /e2e/i, /codex/i];

/**
 * Is this account internal/test/demo rather than a real customer?
 * `name` is optional — most callers (the Users directory) only have an
 * email to check; pass a name too wherever one is already loaded (never
 * fetch it just for this check).
 */
export function isInternalOrTestAccount(
  email: string | null | undefined,
  name?: string | null,
): boolean {
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  if (normalizedEmail.endsWith(INTERNAL_EMAIL_DOMAIN)) return true;
  const haystack = `${normalizedEmail} ${(name ?? '').trim().toLowerCase()}`;
  return INTERNAL_NAME_PATTERNS.some((pattern) => pattern.test(haystack));
}
