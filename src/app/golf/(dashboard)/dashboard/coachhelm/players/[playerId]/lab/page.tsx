import { redirect } from 'next/navigation';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';

interface PageProps {
  params: Promise<{ playerId: string }>;
}

/** Player lab entry — genome is the primary deep-dive surface for now. */
export default async function CoachHelmPlayerLabPage({ params }: PageProps) {
  const { playerId } = await params;
  redirect(coachHelmRoutes.playerGenome(playerId));
}
