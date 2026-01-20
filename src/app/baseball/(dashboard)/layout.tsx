'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { ToastProvider } from '@/components/ui/toast';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { PageLoading } from '@/components/ui/loading';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-dashboard-gradient">
      {/* Skip Links for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-green-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Command Palette */}
      <CommandPalette />

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
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
        <Sidebar isMobile />
      </div>

      {/* Main Content Area */}
      <div
        className={cn(
          'min-h-screen flex flex-col',
          'transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
        )}
      >
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/baseball/login');
        return;
      }

      // Check if user has completed onboarding
      const [userResult, coachResult, playerResult] = await Promise.all([
        supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('baseball_coaches')
          .select('id, onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('baseball_players')
          .select('id, onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const userRole = userResult.data?.role;
      const coachProfile = coachResult.data;
      const playerProfile = playerResult.data;

      const declaredRole = (userRole === 'coach' || userRole === 'player') ? userRole : null;
      const resolvedRole = coachProfile && playerProfile
        ? (declaredRole || 'coach')
        : coachProfile
          ? 'coach'
          : playerProfile
            ? 'player'
            : declaredRole;

      if (resolvedRole === 'coach') {
        if (!coachProfile || !coachProfile.onboarding_completed) {
          router.push('/baseball/coach-onboarding');
          return;
        }
      } else if (resolvedRole === 'player') {
        if (!playerProfile || !playerProfile.onboarding_completed) {
          router.push('/baseball/player');
          return;
        }
      } else {
        // Unknown role - redirect to signup
        router.push('/baseball/signup');
        return;
      }

      setAuthorized(true);
      setLoading(false);
    }

    checkAuth();
  }, [router, supabase]);

  if (loading || !authorized) {
    return <PageLoading />;
  }

  return (
    <SidebarProvider>
      <ToastProvider>
        <SessionActivityProvider>
          <DashboardContent>{children}</DashboardContent>
        </SessionActivityProvider>
      </ToastProvider>
    </SidebarProvider>
  );
}
