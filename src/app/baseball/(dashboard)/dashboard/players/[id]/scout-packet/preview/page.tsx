// =============================================================================
// src/app/baseball/(dashboard)/dashboard/players/[id]/scout-packet/preview/page.tsx
//
// V5 Scout Packet — staff "preview as a scout". Renders EXACTLY what a college
// coach opening a share link would see (the public ScoutPacketView), assembled
// through the scout-packet read model so the exposure gate + scout-rank filter
// are identical to the real packet. A coach uses this to confirm what is (and
// isn't) shared before sending a link.
// =============================================================================

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getScoutPacketPreview } from '@/app/baseball/actions/scout-packet';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { ScoutPacketView } from '@/components/baseball/passport/ScoutPacketView';
import { IconArrowLeft } from '@/components/icons';

export const metadata = {
  title: 'Scout Packet preview · BaseballHelm',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachScoutPacketPreviewPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/dashboard/command-center');
  if (context.activeRole !== 'coach') redirect('/baseball/player/passport');

  // Capability is enforced inside getScoutPacketPreview (can_export_reports).
  //
  // getScoutPacketPreview independently re-resolves auth (withBaseballAction),
  // so a session that expires in the narrow window between the context check
  // above and this call throws BaseballUnauthorizedError here. Left uncaught,
  // that raw-throws through this Server Component's render straight to
  // error.tsx and the error tracker (Sentry/Vercel) instead of the honest
  // "please sign in again" redirect — the same class of bug fixed on the
  // baseball announcements page. Redirect on that specific case; any other
  // thrown error (e.g. a real capability failure for a signed-in coach) is a
  // genuine failure and should keep propagating to error.tsx.
  let model: Awaited<ReturnType<typeof getScoutPacketPreview>>;
  try {
    model = await getScoutPacketPreview(id);
  } catch (error) {
    if (error instanceof BaseballUnauthorizedError) {
      redirect(
        `/baseball/login?returnTo=${encodeURIComponent(`/baseball/dashboard/players/${id}/scout-packet/preview`)}`,
      );
    }
    throw error;
  }

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <Link
          href={`/baseball/dashboard/players/${id}/scout-packet`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-warm-500 transition-colors hover:text-warm-700"
        >
          <IconArrowLeft size={16} />
          Back to share links
        </Link>
        <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-2.5 text-eyebrow font-medium text-primary-700">
          Preview — this is exactly what a college coach sees. Internal-only fields are never shown.
        </div>
      </div>
      <ScoutPacketView model={model} />
    </div>
  );
}
