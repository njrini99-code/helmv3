/**
 * v3 Qualifying selection workspace (W29 — Part XV.0 new route).
 *
 * Coach-only. The existing /dashboard/qualifiers/[id] keeps owning
 * scoring + the real-time leaderboard; this route owns "who's going to
 * the tournament" — top-N auto-lock + coach-pick reasoning + final
 * confirmation flip.
 */

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import { QualifyingBoard } from '@/components/golf/coachhelm/v3/QualifyingBoard';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('golf_qualifiers')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  return {
    title: data?.name ? `${data.name} · Selection · CoachHelm` : 'Selection · CoachHelm',
  };
}

export default async function QualifyingWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect(`/golf/dashboard/qualifiers/${id}`);

  const supabase = await createClient();
  const workspace = await loadQualifyingWorkspace(supabase, id);
  if (!workspace) notFound();

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title="Selection workspace"
          backHref={`/golf/dashboard/qualifiers/${id}`}
          backLabel="Back to qualifier"
        />
      </AnimatedItem>
      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <QualifyingBoard workspace={workspace} />
      </div>
    </AnimatedPage>
  );
}
