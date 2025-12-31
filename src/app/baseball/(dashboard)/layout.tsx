'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { ToastProvider } from '@/components/ui/toast';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { cn } from '@/lib/utils';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-dashboard-gradient">
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
          collapsed ? 'lg:ml-[88px]' : 'lg:ml-64'
        )}
      >
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
