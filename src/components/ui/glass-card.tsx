'use client';

import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'subtle' | 'standard' | 'prominent';
  hover?: boolean;
  shine?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles = {
  subtle: 'glass-subtle',
  standard: 'glass-standard',
  prominent: 'glass-prominent',
};

export function GlassCard({
  className,
  variant = 'standard',
  hover = false,
  shine = true,
  padding = 'md',
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden',
        'transition-all duration-200 ease-out',
        variantStyles[variant],
        hover && 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-6',
        padding === 'lg' && 'p-8',
        padding === 'none' && 'p-0',
        className
      )}
      {...props}
    >
      {/* Shine effect - subtle gradient on top edge */}
      {shine && (
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
      )}
      {children}
    </div>
  );
}

// Glass card header
export function GlassCardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-6 py-4 border-b border-white/10', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// Glass card content
export function GlassCardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-6', className)} {...props}>
      {children}
    </div>
  );
}

// Glass stat card
interface GlassStatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
}

export function GlassStatCard({ label, value, icon, trend }: GlassStatCardProps) {
  return (
    <GlassCard className="group" variant="standard">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 tabular-nums tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {trend && (
            <p
              className={cn(
                'text-sm mt-1',
                trend.direction === 'up' && 'text-green-600',
                trend.direction === 'down' && 'text-red-500',
                trend.direction === 'neutral' && 'text-slate-400'
              )}
            >
              {trend.direction === 'up' && '↑'}
              {trend.direction === 'down' && '↓'}
              {trend.direction === 'neutral' && '→'}
              {' '}{Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2.5 bg-white/50 rounded-lg text-slate-600 group-hover:scale-105 transition-transform duration-200">
            {icon}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
