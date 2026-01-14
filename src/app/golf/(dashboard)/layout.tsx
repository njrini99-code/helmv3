'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { PageLoading } from '@/components/ui/loading';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { ToastProvider } from '@/components/ui/toast';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { ViewTransitionsProvider } from '@/components/providers/ViewTransitionsProvider';
import { CommandPalette } from '@/components/golf/CommandPalette';
import { MobileBottomNav } from '@/components/golf/MobileBottomNav';
import { KeyboardShortcutHint } from '@/components/golf/KeyboardShortcutHint';
import { MobileNavProvider } from '@/contexts/mobile-nav-context';
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
    <div className="flex h-screen bg-dashboard-gradient overscroll-none" style={{ overscrollBehavior: 'none' }}>
      {/* Command Palette (Cmd+K) */}
      <CommandPalette isCoach={isCoach} />
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:block" style={{ viewTransitionName: 'sidebar' }}>
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
          'flex-1 overflow-y-auto lg:overflow-y-auto',
          'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0',
          'transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-64',
          // Mobile scroll optimization
          'overscroll-none touch-pan-y',
          // Prevent scroll chaining
          'overscroll-behavior-contain'
        )}
        style={{ 
          background: 'transparent', 
          viewTransitionName: 'page-content',
          WebkitOverflowScrolling: 'touch',
        }}
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

      // OPTIMIZATION: Query both coach and player in parallel
      // Include onboarding_completed to check if they need to finish onboarding
      const [coachResult, playerResult] = await Promise.all([
        supabase
          .from('golf_coaches')
          .select('id, full_name, avatar_url, team_id, onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('golf_players')
          .select('id, first_name, last_name, avatar_url, team_id, onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const coach = coachResult.data;
      const player = playerResult.data;

      if (coach) {
        // Check if onboarding is complete - redirect to onboarding if not
        if (!coach.onboarding_completed) {
          router.push('/golf/coach');
          return;
        }

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

      if (player) {
        // Check if onboarding is complete - redirect to onboarding if not
        if (!player.onboarding_completed) {
          router.push('/golf/player');
          return;
        }

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

      // No profile at all - check users table to determine where to send them
      // This handles edge cases where the trigger failed to create a profile
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData?.role === 'coach') {
        router.push('/golf/coach');
      } else if (userData?.role === 'player') {
        router.push('/golf/player');
      } else {
        // Truly unknown state - go to signup
        router.push('/golf/signup');
      }
    }

    loadUser();
  }, [router, supabase]);

  if (loading || !userData) {
    return <PageLoading />;
  }

  return (
    <MobileNavProvider>
      <ViewTransitionsProvider>
        <SidebarProvider>
          <ToastProvider>
            <SessionActivityProvider>
              <GolfDashboardContent userData={userData}>
                {children}
              </GolfDashboardContent>
            </SessionActivityProvider>
          </ToastProvider>
        </SidebarProvider>
      </ViewTransitionsProvider>
    </MobileNavProvider>
  );
}
