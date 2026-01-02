'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  glow?: 'none' | 'green' | 'subtle';
}

const variants = {
  primary: cn(
    "bg-white/70 backdrop-blur-[12px]",
    "border border-white/40",
    "rounded-[20px]",
    "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]"
  ),
  secondary: cn(
    "bg-white/50 backdrop-blur-[8px]",
    "border border-white/30",
    "rounded-[14px]",
    "shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]"
  ),
  subtle: cn(
    "bg-white/60 backdrop-blur-[4px]",
    "border border-white/25",
    "rounded-[10px]"
  ),
  accent: cn(
    "bg-white/70 backdrop-blur-[12px]",
    "border border-white/40 border-l-[3px] border-l-primary-600",
    "rounded-[20px]",
    "shadow-[0_4px_12px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.6)]"
  ),
};

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

const hoverEffect = cn(
  "transition-all duration-300",
  "hover:bg-white/75",
  "hover:border-white/50",
  "hover:-translate-y-0.5",
  "hover:shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.03),0_16px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]"
);

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      variant = 'primary',
      padding = 'md',
      hover = true,
      glow = 'none',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative",
          variants[variant],
          paddings[padding],
          hover && hoverEffect,
          glow === 'green' && "before:absolute before:inset-0 before:-z-10 before:rounded-[24px] before:bg-primary-500/8 before:blur-2xl",
          glow === 'subtle' && "before:absolute before:inset-0 before:-z-10 before:rounded-[24px] before:bg-white/30 before:blur-xl",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

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
    <GlassCard className="group" variant="primary">
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
