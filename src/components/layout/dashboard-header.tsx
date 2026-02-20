'use client';

import { useSidebar } from '@/contexts/sidebar-context';
import { MobileMenuButton } from './mobile-menu-button';

interface DashboardHeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export function DashboardHeader({ title, children }: DashboardHeaderProps) {
  const { toggle, toggleMobile, mobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 glass-prominent border-b border-white/20">
      <div className="h-16 px-4 lg:px-6 flex items-center gap-4">
        {/* Menu Toggle Button - Always visible */}
        <MobileMenuButton
          onClick={() => {
            if (window.innerWidth < 1024) {
              toggleMobile();
            } else {
              toggle();
            }
          }}
          open={mobileOpen}
          animated
          theme="light"
          className="-ml-2"
        />

        {/* Title */}
        {title && (
          <h1 className="text-lg font-semibold text-slate-900 truncate">
            {title}
          </h1>
        )}

        {/* Right side content */}
        {children && (
          <div className="ml-auto flex items-center gap-3">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
