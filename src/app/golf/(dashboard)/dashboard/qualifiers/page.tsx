import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { ClubhouseQualifiersRoute } from '@/clubhouse/routes/qualifiers';
import { getGolfSessionProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Qualifiers',
  description: 'Track and manage team qualifiers for player selection and performance evaluation',
};

// Cache qualifiers for 5 minutes (qualifiers don't change frequently)
export const revalidate = 300;

export default async function GolfQualifiersPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse Qualifiers: coaches and players, rendered in place (D-23, D-30).
  return <ClubhouseQualifiersRoute view="list" />;
}
