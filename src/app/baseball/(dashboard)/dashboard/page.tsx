'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { PageLoading } from '@/components/ui/loading';

/**
 * Backward-compatible redirect page.
 *
 * Previously this page rendered different dashboards based on coach/player type
 * with client-side detection. Now each type has its own route:
 *   - /baseball/coach/{college|juco|high-school|showcase}
 *   - /baseball/player/{college|juco|high-school|showcase}
 *
 * This page detects the user's role + type and redirects accordingly,
 * so any old links or bookmarks to /baseball/dashboard still work.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const { user, coach, player, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user?.role === 'coach' && coach?.coach_type) {
      const type = coach.coach_type.replace('_', '-');
      router.replace(`/baseball/coach/${type}`);
    } else if (user?.role === 'player' && player?.player_type) {
      const type = player.player_type.replace('_', '-');
      router.replace(`/baseball/player/${type}`);
    } else if (!user) {
      router.replace('/baseball/login');
    }
  }, [loading, user, coach, player, router]);

  return <PageLoading />;
}
