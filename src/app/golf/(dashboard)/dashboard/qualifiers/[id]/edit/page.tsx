import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ClubhouseQualifiersRoute } from '@/clubhouse/routes/qualifiers';
import { getGolfSessionProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Edit Qualifier',
  description: 'Edit an existing team qualifier',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditQualifierPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse Qualifiers: a coach's form; a player gets the coach-only state (D-23, D-30).
  return <ClubhouseQualifiersRoute view="edit" id={id} />;
}
