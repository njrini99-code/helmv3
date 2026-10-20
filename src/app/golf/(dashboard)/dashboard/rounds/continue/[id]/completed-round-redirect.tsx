'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Continue Round for a round that is no longer in progress.
 *
 * The page used to `redirect()` here. That is fine on a plain navigation, but
 * this page is also re-rendered inside the submit action's response: the
 * submit calls `revalidatePath`, so Next re-renders the route the player is on
 * — this one — and by then the round is completed. A `redirect()` thrown in
 * that render surfaced as React #441 (digest NEXT_REDIRECT) and the route's
 * error boundary told a player whose round had just saved "We couldn't load
 * your saved scorecard" (production: 2026-09-06, -07, -15, -20).
 *
 * Rendering a client-side replace instead works in every render context and
 * lands on the same page the success overlay navigates to.
 */
export function CompletedRoundRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <div
      className={fairwayScope('flex min-h-[50vh] flex-col items-center justify-center gap-3 bg-canvas px-4 text-center')}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-text-secondary">This round is complete. Opening your round…</p>
      <Link href={href} replace className="text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
        View round
      </Link>
    </div>
  );
}
