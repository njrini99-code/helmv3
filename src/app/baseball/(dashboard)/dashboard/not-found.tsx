import Link from 'next/link';
import { Button } from '@/components/fairway';
import { EditorsLetter } from '@/components/baseball/living-annual';

/**
 * Baseball dashboard-scoped 404 (W5 dead-code + coverage sweep, 2026-07-09).
 *
 * Catches `notFound()` / an unmatched dynamic segment anywhere under the
 * coach + shared dashboard route group (roster/[id], stats/games/[gameId],
 * messages/[id], and similar). Rendered INSIDE `(dashboard)/layout.tsx`, so
 * it keeps BaseballFairwayShell's nav + chrome rather than falling through to
 * the bare cross-product root `not-found.tsx` (which sits outside every
 * shell and offers a "Golf Dashboard" button alongside the baseball one —
 * wrong-product confusion for a baseball user, Nielsen #4). Mirrors the golf
 * equivalent at `src/app/golf/(dashboard)/dashboard/not-found.tsx`.
 *
 * Living Annual presentation — `<EditorsLetter>` (spec §7 empty/error-state
 * doctrine: an editorial letter, never a yellow warning box). The shell
 * already establishes the `.living-annual` scope, so the kit's tokens
 * resolve here without an extra wrapper.
 */
export default function BaseballDashboardNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-16 sm:px-6">
      <EditorsLetter
        ink="team"
        title="We couldn't find that page."
        body="It may have been moved, or the item you were looking for no longer exists — it may have been removed from your team."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/baseball/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
