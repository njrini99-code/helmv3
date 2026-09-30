import type { Metadata } from 'next';
import { isUuid } from '@/lib/utils/uuid';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

export const metadata: Metadata = {
  title: 'Round Review',
  description: 'AI-generated analysis of your completed round with insights and recommendations.',
};

// Clubhouse: a round's review is /rounds/[id].
export default async function RoundReviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isUuid(id)) await redirectToClubhouse({ coach: `/golf/dashboard/rounds/${id}`, player: `/golf/dashboard/rounds/${id}` });
  return children;
}
