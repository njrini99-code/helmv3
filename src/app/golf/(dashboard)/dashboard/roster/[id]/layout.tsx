import type { ReactNode } from 'react';
import { isUuid } from '@/lib/utils/uuid';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a coach's page for one player is that player's Stats profile. A player has no page for a teammate (the
// roster is read-only), so the address goes to the roster.
export default async function RosterPlayerLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isUuid(id)) await redirectToClubhouse({ coach: `/golf/dashboard/stats?player=${id}`, player: '/golf/dashboard/roster' });
  return children;
}
