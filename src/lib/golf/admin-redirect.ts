/**
 * Golf legacy `users.role === 'admin'` post-login routing.
 *
 * A handful of accounts carry the legacy `role='admin'` flag on `users` (they
 * have no `golf_coaches`/`golf_players` row) and must bypass the normal
 * coach/player onboarding resolution entirely, landing on the admin console
 * instead of `/golf/dashboard`.
 *
 * That console is **Helm Bridge (`/admin`)**. It used to be the legacy
 * `/golf/admin` page, which is now a redirect to `/admin` (see
 * next.config.mjs) — there is no route into the old dashboard any more.
 *
 * Safe for the accounts that exist: production has exactly ONE `role='admin'`
 * user (admin@helmsportslabs.com), and it is already in SUPER_ADMIN_USER_IDS —
 * verified behaviourally, by signing in on production and observing that login
 * lands on `/admin` and Helm Bridge serves it. That means the super-admin
 * branch in `loginActionImpl` already wins before this function is reached,
 * and this value is the fallback for the paths that do not check the allowlist
 * (the dashboard layout, welcome, native cold-start).
 *
 * If a future account is granted `role='admin'` WITHOUT being added to
 * SUPER_ADMIN_USER_IDS, it will be sent to `/admin` and refused by
 * `requireSuperAdmin`. Grant both, or give that population its own surface —
 * do not point this back at the retired dashboard.
 *
 * Callers:
 *   - src/app/golf/actions/auth.ts (server action, loginActionImpl)
 *   - src/app/golf/(dashboard)/layout.tsx (server, onboarding-retry path)
 *   - src/app/golf/(auth)/welcome/page.tsx (client, post-login greeting)
 *   - src/app/golf/(auth)/login/page.tsx (client, already-signed-in bounce)
 *   - src/components/NativeRedirect.tsx (client, native cold-start bounce)
 */
export const ADMIN_CONSOLE_PATH = '/admin';

export function resolveAdminPostLoginPath(
  isAdmin: boolean,
  fallback: string = '/golf/dashboard',
): string {
  return isAdmin ? ADMIN_CONSOLE_PATH : fallback;
}
