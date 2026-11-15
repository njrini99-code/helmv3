import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ClubhouseQualifiersRoute } from '@/clubhouse/routes/qualifiers';
import { getGolfSessionProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Manage selections',
  description: 'Choose the coach’s picks and confirm the qualifier squad',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Manage selections (coach only; a player gets the Clubhouse coach-only state). */
export default async function QualifierSelectionPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  return <ClubhouseQualifiersRoute view="selection" id={id} />;
}
