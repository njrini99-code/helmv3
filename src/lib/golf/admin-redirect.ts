/**
 * Golf legacy `users.role === 'admin'` post-login routing.
 *
 * A handful of accounts carry the legacy `role='admin'` flag on `users` (they
 * have no `golf_coaches`/`golf_players` row) and must bypass the normal
 * coach/player onboarding resolution entirely, landing on the legacy
 * `/golf/admin` console instead of `/golf/dashboard`.
 *
 * This is intentionally distinct from Helm Bridge (`/admin`), which is gated
 * by `SUPER_ADMIN_USER_IDS` (see `isSuperAdminUserId` /
 * `checkSuperAdminAccess`) and is checked FIRST wherever both populations are
 * evaluated together (see `loginActionImpl` in
 * src/app/golf/actions/auth.ts) — a super-admin account can be team-less too,
 * so the Bridge check must win before this one ever runs.
 *
 * Centralizes the `isAdmin ? '/golf/admin' : fallback` ternary that was
 * previously copy-pasted (and had to stay in sync by hand) across every
 * post-login/post-auth-check redirect site:
 *   - src/app/golf/actions/auth.ts (server action, loginActionImpl)
 *   - src/app/golf/(dashboard)/layout.tsx (server, onboarding-retry path)
 *   - src/app/golf/(auth)/welcome/page.tsx (client, post-login greeting)
 *   - src/app/golf/(auth)/login/page.tsx (client, already-signed-in bounce)
 *   - src/components/NativeRedirect.tsx (client, native cold-start bounce)
 */
export function resolveAdminPostLoginPath(
  isAdmin: boolean,
  fallback: string = '/golf/dashboard',
): string {
  return isAdmin ? '/golf/admin' : fallback;
}
