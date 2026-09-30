import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseQualifiersRoute } from '@/clubhouse/routes/qualifiers';
import { getGolfSessionProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Manage selections',
  description: 'Choose the coach’s picks and confirm the qualifier squad',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Manage selections (Clubhouse, coach only). Outside Clubhouse the same job
 * is the existing selection workspace, so this address sends there.
 */
export default async function QualifierSelectionPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (isClubhouseFor(session.coach ? 'coach' : session.player ? 'player' : null)) return <ClubhouseQualifiersRoute view="selection" id={id} />;
  redirect(session.coach ? `/golf/dashboard/coachhelm/qualifying/${id}` : `/golf/dashboard/qualifiers/${id}`);
}
