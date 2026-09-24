import Link from 'next/link';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { Button } from '@/components/fairway/controls/button';
import { getGolfSessionProfile } from '@/lib/auth/session';

/**
 * Golf dashboard-scoped 404 (P431).
 *
 * Catches `notFound()` thrown by invalid dynamic IDs under the dashboard —
 * rounds/[id], roster/[id], qualifiers/[id], players/[playerId] (e.g. a deleted
 * player or round). Rendered INSIDE the (dashboard) layout, so it keeps the
 * dashboard shell + nav rather than falling through to the bare cross-product
 * root not-found.tsx (which sits outside the shell and offers a "Baseball
 * Dashboard" button — wrong-product confusion for a golf user, Nielsen #4).
 *
 * Token-correct Fairway surface (EmptyState + Fairway Button) with golf-only
 * CTAs. The (dashboard) shell already establishes the `.fairway-ds` scope +
 * bg-canvas, so the Fairway tokens resolve here.
 *
 * Also reached for any unmatched `/golf/dashboard/*` URL via the
 * `[...missing]` catch-all (DASH-13). The secondary link is role-aware
 * (DASH-14): a coach goes back to the roster, a player to their rounds.
 */
export default async function GolfDashboardNotFound() {
  const session = await getGolfSessionProfile().catch(() => null);
  const secondary =
    session?.role === 'coach'
      ? { href: '/golf/dashboard/roster', label: 'Back to roster' }
      : { href: '/golf/dashboard/rounds', label: 'Your rounds' };
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <EmptyState
        icon={<Compass strokeWidth={1.75} />}
        title="We couldn't find that"
        description="This page may have been moved, or the item you were looking for no longer exists. It may have been removed from your team."
        action={
          <Button asChild variant="primary">
            <Link href="/golf/dashboard">Back to dashboard</Link>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="ghost" size="sm">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        }
      />
    </div>
  );
}
