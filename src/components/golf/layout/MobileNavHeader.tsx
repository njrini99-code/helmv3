'use client';

import { MobileMenuButton } from '@/components/golf/MobileMenuButton';

interface MobileNavHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // For action buttons on the right
}

/**
 * Mobile-friendly page header with hamburger menu button
 * Use this in dashboard pages to provide consistent mobile navigation
 */
export function MobileNavHeader({ title, subtitle, children }: MobileNavHeaderProps) {
  return (
    <div className="golf-mobile-page-header">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MobileMenuButton />
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900">{title}</h1>
              {subtitle && <p className="text-warm-500 mt-0.5 text-sm md:text-base truncate">{subtitle}</p>}
            </div>
          </div>
          {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
        </div>
      </div>
    </div>
  );
}
