'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { PageLoading } from '@/components/ui/loading';

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

  useEffect(() => {
    async function loadUser() {
      // Normal Supabase auth flow
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/golf/login');
        return;
      }

      // Check if user is a golf coach
      // Using type assertion until golf schema is added to Supabase types
      const { data: coach } = await supabase
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
      const { data: player } = await supabase
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
  }, [router, supabase]);

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
