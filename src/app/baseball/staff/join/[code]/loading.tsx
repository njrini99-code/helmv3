import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Loading skeleton for the staff-invite accept flow. The page does several
 * sequential awaits (auth check, invitation lookup by token) before it can
 * render any of its terminal states, so mirror the page's own CenteredCard
 * shell rather than a generic spinner.
 */
export default function StaffJoinLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-auth-baseball p-4 sm:p-6">
      <PaperCard className="w-full max-w-md rounded-2xl p-6 sm:p-8" grain={false}>
        <Skeleton className="mx-auto mb-4 h-16 w-16 rounded-full" />
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="mx-auto mt-2 h-4 w-64" />
        <Skeleton className="mx-auto mt-1 h-3 w-40" />
        <Skeleton className="mx-auto mt-6 h-11 w-full rounded-lg" />
      </PaperCard>
    </div>
  );
}
