import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { ClubhouseQualifiersRoute } from '@/clubhouse/routes/qualifiers';
import { getGolfSessionProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Create Qualifier',
  description: 'Create a new team qualifier for player selection',
};

export default async function NewQualifierPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse Qualifiers: a coach's form; a player gets the coach-only state (D-23, D-30).
  return <ClubhouseQualifiersRoute view="new" />;
}
