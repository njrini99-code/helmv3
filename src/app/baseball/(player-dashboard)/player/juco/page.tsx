'use client';

import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { JucoPlayerDashboard } from '@/app/baseball/(dashboard)/dashboard/team/JucoPlayerDashboard';
import { getFullName } from '@/lib/utils';

export default function JucoPlayerDashboardPage() {
  const { player, loading: authLoading } = useAuth();

  if (authLoading || !player) return <PageLoading />;

  return (
    <JucoPlayerDashboard
      playerName={getFullName(player.first_name, player.last_name)}
      playerId={player.id}
    />
  );
}
