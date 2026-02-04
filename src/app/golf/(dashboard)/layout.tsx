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
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/golf/login');
        return;
      }

      // Query role and profiles in parallel to resolve correct destination
      // Use retry logic to handle database propagation delays after onboarding
      let coach = null;
      let player = null;
      let userRole = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const [userResult, coachResult, playerResult] = await Promise.all([
          supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('golf_coaches')
            .select('id, full_name, avatar_url, organization_id, onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('golf_players')
            .select('id, first_name, last_name, avatar_url, onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        userRole = userResult.data?.role;
        coach = coachResult.data;
        player = playerResult.data;

        // If we have a completed profile, break immediately
        if ((coach && coach.onboarding_completed) || (player && player.onboarding_completed)) {
          break;
        }

        // Wait before retry to allow database propagation
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      const declaredRole = (userRole === 'coach' || userRole === 'player') ? userRole : null;
      const resolvedRole = coach && player
        ? (declaredRole || 'coach')
        : coach
          ? 'coach'
          : player
            ? 'player'
            : declaredRole;

      if (resolvedRole === 'coach') {
        // Only redirect to onboarding if coach record exists but onboarding is incomplete
        // If no coach record at all, that's handled below in the "unknown state" branch
        if (coach && !coach.onboarding_completed) {
          router.push('/golf/coach');
          return;
        }

        // If coach record doesn't exist at all, let them through to dashboard
        // (this handles edge case where onboarding just completed but record isn't found yet)
        if (!coach) {
          // Check one more time with a longer delay
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: retryCoach } = await supabase
            .from('golf_coaches')
            .select('id, full_name, avatar_url, organization_id, onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle();

          if (retryCoach) {
            coach = retryCoach;
            if (!coach.onboarding_completed) {
              router.push('/golf/coach');
              return;
            }
          } else {
            // Still no coach record - redirect to onboarding
            router.push('/golf/coach');
            return;
          }
        }

        // Get team name via organization_id
        let teamName: string | undefined;
        if (coach.organization_id) {
          const { data: team } = await supabase
            .from('golf_teams')
            .select('name')
            .eq('organization_id', coach.organization_id)
            .maybeSingle();
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

      if (resolvedRole === 'player') {
        // Only redirect to onboarding if player record exists but onboarding is incomplete
        if (player && !player.onboarding_completed) {
          router.push('/golf/player');
          return;
        }

        // If player record doesn't exist at all, check again with delay
        if (!player) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: retryPlayer } = await supabase
            .from('golf_players')
            .select('id, first_name, last_name, avatar_url, onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle();

          if (retryPlayer) {
            player = retryPlayer;
            if (!player.onboarding_completed) {
              router.push('/golf/player');
              return;
            }
          } else {
            // Still no player record - redirect to onboarding
            router.push('/golf/player');
            return;
          }
        }

        // Get team name via golf_team_members
        let teamName: string | undefined;
        const { data: teamMember } = await supabase
          .from('golf_team_members')
          .select('team_id')
          .eq('player_id', player.id)
          .eq('status', 'active')
          .maybeSingle();

        if (teamMember?.team_id) {
          const { data: team } = await supabase
            .from('golf_teams')
            .select('name')
            .eq('id', teamMember.team_id)
            .maybeSingle();
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

      // Unknown state - check users table role to determine onboarding destination
      if (declaredRole === 'coach') {
        router.push('/golf/coach');
      } else if (declaredRole === 'player') {
        router.push('/golf/player');
      } else {
        // Truly unknown - go to signup
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
