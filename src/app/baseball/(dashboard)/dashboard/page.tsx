'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { PageLoading } from '@/components/ui/loading';

/**
 * Backward-compatible redirect page.
 *
 * Backward-compatible redirect for old links/bookmarks to /baseball/dashboard.
 * Completed users now land inside the BaseballHelm dashboard shell instead of
 * the legacy /baseball/coach/* or /baseball/player/* route families.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const { user, coach, player, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user?.role === 'coach' && coach?.coach_type) {
      router.replace('/baseball/dashboard/command-center');
    } else if (user?.role === 'player' && player?.player_type) {
      router.replace('/baseball/player/today');
    } else if (!user) {
      router.replace('/baseball/login');
    }
  }, [loading, user, coach, player, router]);

  return <PageLoading />;
}
