'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface AdminCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'stat' | 'alert' | 'section';
  accent?: 'green' | 'amber' | 'red' | 'blue' | 'none';
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

const accentBorderColors: Record<string, string> = {
  green: 'border-l-primary-600',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
  blue: 'border-l-blue-500',
  none: '',
};

const alertBgColors: Record<string, string> = {
  green: 'bg-primary-50/60 border-primary-100',
  amber: 'bg-amber-50/60 border-amber-100',
  red: 'bg-red-50/60 border-red-100',
  blue: 'bg-blue-50/60 border-blue-100',
  none: 'bg-warm-50/60 border-warm-100',
};

export function AdminCard({
  children,
  className,
  variant = 'default',
  accent = 'none',
  title,
  subtitle,
  action,
}: AdminCardProps) {
  if (variant === 'alert') {
    return (
      <div
        className={cn(
          'rounded-2xl border p-4 sm:p-5 md:p-6',
          alertBgColors[accent],
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-warm-900">{title}</h3>
              {subtitle && (
                <p className="text-xs text-warm-500 mt-0.5">{subtitle}</p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }

  const isStatVariant = variant === 'stat';
  const isSectionVariant = variant === 'section';

  return (
    <div
      className={cn(
        // Glass effect
        'bg-white/65 backdrop-blur-[16px]',
        'border rounded-2xl',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
        // Padding
        'p-4 sm:p-5 md:p-6',
        // Stat variant: left accent border
        isStatVariant && [
          'border-l-[3px] border-t-white/30 border-r-white/30 border-b-white/30',
          accentBorderColors[accent],
        ],
        // Default/section variant: uniform border
        !isStatVariant && 'border-white/30',
        className
      )}
    >
      {/* Section header */}
      {isSectionVariant && title && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-warm-900">{title}</h3>
            {subtitle && (
              <p className="text-xs text-warm-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
