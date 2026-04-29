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
    "bg-glass backdrop-blur-glass",
    "border border-glass-border-strong",
    "rounded-2xl",
    "shadow-glass"
  ),
  secondary: cn(
    "bg-glass-subtle backdrop-blur-glass-subtle",
    "border border-glass-border",
    "rounded-lg",
    "shadow-glass-sm"
  ),
  subtle: cn(
    "bg-glass-subtle backdrop-blur-xs",
    "border border-glass-border",
    "rounded-md"
  ),
  accent: cn(
    "bg-glass backdrop-blur-glass",
    "border border-glass-border-strong border-l-[3px] border-l-primary-600",
    "rounded-2xl",
    "shadow-glass"
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
  "hover:bg-glass-prominent",
  "hover:border-glass-border-prominent",
  "hover:-translate-y-0.5",
  "hover:shadow-glass-hover"
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
          glow === 'green' && "before:absolute before:inset-0 before:-z-10 before:rounded-3xl before:bg-primary-500/8 before:blur-2xl",
          glow === 'subtle' && "before:absolute before:inset-0 before:-z-10 before:rounded-3xl before:bg-white/30 before:blur-xl",
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
  suffix?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
}

export function GlassStatCard({ label, value, icon, suffix, trend }: GlassStatCardProps) {
  return (
    <GlassCard className="group" variant="primary">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-warm-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-warm-900 tabular-nums tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span className="text-lg font-normal text-warm-400 ml-1">{suffix}</span>}
          </p>
          {trend && (
            <p
              className={cn(
                'text-sm mt-1',
                trend.direction === 'up' && 'text-primary-600',
                trend.direction === 'down' && 'text-red-500',
                trend.direction === 'neutral' && 'text-warm-400'
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
          <div className="p-2.5 bg-cream-100/60 rounded-lg text-warm-600 group-hover:scale-105 transition-transform duration-200">
            {icon}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
