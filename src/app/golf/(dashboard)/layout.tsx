'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { PageLoading } from '@/components/ui/loading';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { ToastProvider } from '@/components/ui/toast';
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
    <div className="flex h-screen bg-slate-50">
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
      >
        <div className="animate-page-enter min-h-full">
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
          avatarUrl: coach.avatar_url || undefined,
        });
        setLoading(false);
        return;
      }

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
        <GolfDashboardContent userData={userData}>
          {children}
        </GolfDashboardContent>
      </ToastProvider>
    </SidebarProvider>
  );
}
