import { CheckingCard, ResetShell } from './reset-shell';

/**
 * Route Suspense fallback for /golf/reset-password.
 *
 * The page's first paint is the "checking your link" card inside ResetShell,
 * so the fallback is that exact frame: when the page takes over, nothing moves.
 */
export default function Loading() {
  return (
    <ResetShell>
      <CheckingCard />
    </ResetShell>
  );
}
