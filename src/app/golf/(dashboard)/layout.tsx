'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { PageLoading } from '@/components/ui/loading';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { ToastProvider } from '@/components/ui/toast';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { CommandPalette } from '@/components/golf/CommandPalette';
import { MobileBottomNav } from '@/components/golf/MobileBottomNav';
import { KeyboardShortcutHint } from '@/components/golf/KeyboardShortcutHint';
import { cn } from '@/lib/utils';

interface UserData {
  role: 'coach' | 'player';
  name: string;
  teamName?: string;
  avatarUrl?: string;
}

function GolfDashboardContent({ children, userData }: { children: React.ReactNode; userData: UserData }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const isCoach = userData.role === 'coach';

  return (
    <div className="flex h-screen bg-dashboard-gradient">
      {/* Command Palette (Cmd+K) */}
      <CommandPalette isCoach={isCoach} />
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <GolfSidebar
          userRole={userData.role}
          userName={userData.name}
          teamName={userData.teamName}
          avatarUrl={userData.avatarUrl}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden',
          'transition-opacity duration-300 ease-out',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMobileOpen(false)}
      />
      
      {/* Mobile Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 lg:hidden',
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <GolfSidebar
          userRole={userData.role}
          userName={userData.name}
          teamName={userData.teamName}
          avatarUrl={userData.avatarUrl}
          isMobile
        />
      </div>

      {/* Main content */}
      <main
        className={cn(
          'flex-1 overflow-y-auto pb-20 lg:pb-0',
          'transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
        )}
        style={{ background: 'transparent' }}
      >
        <div className="animate-page-enter min-h-full" style={{ background: 'transparent' }}>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav isCoach={isCoach} />

      {/* Keyboard Shortcut Hint (shows once) */}
      <KeyboardShortcutHint />
    </div>
  );
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
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/golf/login');
        return;
      }

      // TEMPORARY: Simplified queries without joins + bypass onboarding for development
      console.log('🔍 DEBUG: Querying golf_coaches with simplified query (no joins)');
      const { data: coach, error: coachError } = await supabase
        .from('golf_coaches')
        .select('id, full_name, avatar_url, team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('🔍 DEBUG: Coach query result:', { coach, error: coachError });

      if (coach) {
        // Get team name if team_id exists
        let teamName: string | undefined;
        if (coach.team_id) {
          const { data: team } = await supabase
            .from('golf_teams')
            .select('name')
            .eq('id', coach.team_id)
            .single();
          teamName = team?.name;
        }

        setUserData({
          role: 'coach',
          name: coach.full_name || 'Coach',
          teamName,
          avatarUrl: coach.avatar_url || undefined,
        });
        setLoading(false);
        return;
      }

      console.log('🔍 DEBUG: Querying golf_players with simplified query (no joins)');
      const { data: player, error: playerError } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url, team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('🔍 DEBUG: Player query result:', { player, error: playerError });

      if (player) {
        // Get team name if team_id exists
        let teamName: string | undefined;
        if (player.team_id) {
          const { data: team } = await supabase
            .from('golf_teams')
            .select('name')
            .eq('id', player.team_id)
            .single();
          teamName = team?.name;
        }

        setUserData({
          role: 'player',
          name: `${player.first_name} ${player.last_name}`,
          teamName,
          avatarUrl: player.avatar_url || undefined,
        });
        setLoading(false);
        return;
      }

      router.push('/golf/signup');
    }

    loadUser();
  }, [router, supabase]);

  if (loading || !userData) {
    return <PageLoading />;
  }

  return (
    <SidebarProvider>
      <ToastProvider>
        <SessionActivityProvider>
          <GolfDashboardContent userData={userData}>
            {children}
          </GolfDashboardContent>
        </SessionActivityProvider>
      </ToastProvider>
    </SidebarProvider>
  );
}
