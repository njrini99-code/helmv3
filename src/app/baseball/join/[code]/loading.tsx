import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Loading skeleton for the player-invite accept flow. `page.tsx` is a
 * server component that runs several sequential Supabase awaits (auth
 * check, player lookup, invitation lookup, a fallback team lookup, then a
 * membership lookup) before it can render any of its terminal states — on a
 * phone this route is reached almost entirely via an SMS/text invite link
 * over cellular, exactly the case where that chain is slowest and a blank
 * page is most visible. Mirrors the near-identical `staff/join/[code]`
 * flow's own `loading.tsx` (same reasoning, fewer awaits) since every
 * terminal state this page renders (Already a Member / Invalid Code /
 * Expired / the real `JoinTeamClient`) is the same centered
 * `bg-auth-baseball` + `PaperCard` shape.
 */
export default function JoinTeamLoading() {
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
