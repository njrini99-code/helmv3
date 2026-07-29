// Pure helper, deliberately OUTSIDE src/app/admin/actions/.
//
// It lived in triage.ts for about ten minutes and admin-gate-coverage.test.ts
// caught it: every export from an actions file must reach requireSuperAdmin(),
// and a `'use server'` module may only export async functions at all. A pure
// string mapper is neither, so it belongs here.

/**
 * Turn the RPC's raw error into something an operator can act on.
 *
 * `resolve_admin_event` raises a bare `Forbidden` (SQLSTATE 42501) when
 * `is_super_admin()` is false, and that word is genuinely misleading here:
 * the caller already passed `requireSuperAdmin()` a few lines earlier, so from
 * the UI it reads as "I am an admin and the button is broken". The two gates
 * read different sources — the env var lets you INTO the console, the
 * `admin_allowlist` table lets you WRITE — and when an account is in one and
 * not the other, every Resolve click is a no-op with no usable explanation.
 *
 * That is not hypothetical: it cost a long investigation on 2026-07-29,
 * starting from "if the errors are resolved it still doesn't go away it just
 * stays" and only settled by querying the table directly. The message now names
 * the actual cause so the next occurrence is a ten-second fix.
 */
export function describeResolveFailure(message: string): string {
  const forbidden = /forbidden/i.test(message) || message.includes('42501');
  if (!forbidden) return `resolve_admin_event failed: ${message}`;
  return (
    'Resolve was rejected by the database, not by the console. ' +
    'Bridge has two super-admin gates: SUPER_ADMIN_USER_IDS (which let you in) ' +
    'and the admin_allowlist table (which is_super_admin() checks before any ' +
    'write). Your account is almost certainly missing from admin_allowlist — ' +
    'add its user_id there, then try again. Nothing was resolved.'
  );
}
