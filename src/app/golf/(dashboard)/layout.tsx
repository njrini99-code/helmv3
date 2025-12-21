'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { PageLoading } from '@/components/ui/loading';
import { useGolfAuthStore } from '@/stores/golf-auth-store';
import { isGolfDevMode } from '@/lib/golf-dev-mode';

interface UserData {
  role: 'coach' | 'player';
  name: string;
  teamName?: string;
  avatarUrl?: string;
}

export default function GolfDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);

  // Check for dev mode auth
  const { user: devUser, coach: devCoach, player: devPlayer, isDevMode } = useGolfAuthStore();

  useEffect(() => {
    async function loadUser() {
      // Check dev mode first
      if (isGolfDevMode() && isDevMode && devUser) {
        if (devCoach) {
          setUserData({
            role: 'coach',
            name: devCoach.full_name || 'Coach',
            teamName: devCoach.team?.name,
            avatarUrl: devCoach.avatar_url || undefined,
          });
        } else if (devPlayer) {
          setUserData({
            role: 'player',
            name: `${devPlayer.first_name} ${devPlayer.last_name}`,
            teamName: devPlayer.team?.name,
            avatarUrl: devPlayer.avatar_url || undefined,
          });
        }
        setLoading(false);
        return;
      }

      // Normal Supabase auth flow
      const { data: { user } } = await (supabase as any).auth.getUser();

      if (!user) {
        // In dev mode, redirect to dev page instead of login
        if (isGolfDevMode()) {
          router.push('/golf/dev');
        } else {
          router.push('/golf/login');
        }
        return;
      }

      // Check if user is a golf coach
      // Using type assertion until golf schema is added to Supabase types
      const { data: coach } = await (supabase as any)
        .from('golf_coaches')
        .select('*, team:golf_teams(name)')
        .eq('user_id', user.id)
        .single();

      if (coach) {
        if (!coach.onboarding_completed) {
          router.push('/golf/coach');
          return;
        }
        setUserData({
          role: 'coach',
          name: coach.full_name || 'Coach',
          teamName: coach.team?.name,
          avatarUrl: coach.avatar_url,
        });
        setLoading(false);
        return;
      }

      // Check if user is a golf player
      const { data: player } = await (supabase as any)
        .from('golf_players')
        .select('*, team:golf_teams(name)')
        .eq('user_id', user.id)
        .single();

      if (player) {
        if (!player.onboarding_completed) {
          router.push('/golf/player');
          return;
        }
        setUserData({
          role: 'player',
          name: `${player.first_name} ${player.last_name}`,
          teamName: player.team?.name,
          avatarUrl: player.avatar_url,
        });
        setLoading(false);
        return;
      }

      // No golf profile found - redirect to signup
      router.push('/golf/signup');
    }

    loadUser();
  }, [router, supabase, isDevMode, devUser, devCoach, devPlayer]);

  if (loading || !userData) {
    return <PageLoading />;
  }

  return (
    <div className="flex h-screen bg-[#FAF6F1]">
      <GolfSidebar
        userRole={userData.role}
        userName={userData.name}
        teamName={userData.teamName}
        avatarUrl={userData.avatarUrl}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
