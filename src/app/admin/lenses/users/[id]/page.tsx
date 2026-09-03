import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUserJourneyRibbon } from '@/lib/admin/lenses/user-ribbon';
import { UserJourneyRibbon } from '@/components/admin/lenses/UserJourneyRibbon';
import { Surface, InlineNotice } from '@/components/fairway';
import { PanelBoundary } from '../../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../../_components/PanelSkeletons';
import { PanelNoData } from '../../../_components/PanelStates';

export const dynamic = 'force-dynamic';

async function UserRibbonBody({ userId }: { userId: string }) {
  const ribbon = await fetchUserJourneyRibbon(userId);

  // Same contract as src/app/admin/users/[id]/page.tsx: an id that resolves
  // to no `users` row must say so explicitly, not render a full ribbon of
  // honest nulls that reads as "a real user with no data".
  if (!ribbon.found) {
    return <PanelNoData label="User not found" description={`No user with id ${userId}.`} />;
  }

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">User lens</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">User Journey Ribbon</h2>
        <p className="mt-2 text-sm leading-6 text-warm-600">
          Login → Dashboard → Start round → Autosave → Submit → Stats → CoachHelm. Opaque subject id only — no
          email or name is read here; the directory list is the place for identity.
        </p>
      </Surface>

      {ribbon.degradedNote && (
        <InlineNotice tone="warning" title="Some ribbon reads degraded">
          {ribbon.degradedNote}
        </InlineNotice>
      )}

      <UserJourneyRibbon ribbon={ribbon} />

      {ribbon.incidents.recentTitles.length > 0 && (
        <Surface padding="sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Recent incidents</p>
          <div className="mt-3 divide-y divide-warm-200/60">
            {ribbon.incidents.recentTitles.map((title, i) => (
              <p key={i} className="truncate py-2 text-sm text-warm-800">
                {title}
              </p>
            ))}
          </div>
        </Surface>
      )}

      <Link href={ribbon.threadHref} className="inline-block text-xs font-medium text-accent-700 hover:underline">
        Open full activity thread →
      </Link>
    </div>
  );
}

export default async function UserLensDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PanelBoundary title="User lens" skeleton={<PanelPageSkeleton rows={4} />}>
        <UserRibbonBody userId={id} />
      </PanelBoundary>
    </div>
  );
}
