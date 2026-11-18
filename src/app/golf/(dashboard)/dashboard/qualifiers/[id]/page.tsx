import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ClubhouseQualifiersRoute } from '@/clubhouse/routes/qualifiers';
// Only this address's own screen: a page loads every client component it imports on first paint (MAC-11).
import { QualifierDetail } from '@/clubhouse/screens/qualifiers/QualifierDetail';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import { qualifierDisplayName } from '@/lib/golf/qualifier-display';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();

  const { data: qualifier } = await supabase
    .from('golf_qualifiers')
    .select('name, description')
    .eq('id', id)
    .maybeSingle();

  return {
    title: qualifier?.name ? qualifierDisplayName(qualifier.name) : 'Qualifier',
    description: qualifier?.description || 'View live leaderboard and qualifier details for college golf recruiting',
  };
}

export default async function QualifierDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse Qualifiers: coaches and players, rendered in place (D-23, D-30).
  return <ClubhouseQualifiersRoute view="detail" id={id} screens={{ detail: QualifierDetail }} />;
}
