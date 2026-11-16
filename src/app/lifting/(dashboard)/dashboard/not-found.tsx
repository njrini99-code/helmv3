import { EmptyState } from '@/components/ui/empty-state';
import { IconDumbbell } from '@/components/icons';

/**
 * Lift Lab dashboard-scoped 404 (GAP-R-07).
 *
 * Catches `notFound()` from a missing program, athlete or session
 * (programs/[programId], athletes/[athleteId], lift/[sessionId]). Rendered
 * INSIDE the (dashboard) layout, so the lifting coach keeps the Lab shell and
 * its nav instead of falling through to the cross-product root 404. Built from
 * the empty state Lift Lab's own pages use (athletes/[athleteId]), with one
 * way back to the Lift Lab dashboard.
 */
export default function LiftLabNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-16 sm:px-6">
      <EmptyState
        icon={<IconDumbbell size={24} />}
        title="We couldn’t find that"
        description="It may have been deleted, or the link is wrong. Everything else in Lift Lab is where you left it."
        action={{ label: 'Back to Lift Lab', href: '/lifting/dashboard' }}
      />
    </div>
  );
}
