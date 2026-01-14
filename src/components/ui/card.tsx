import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'base' | 'glass' | 'interactive' | 'stat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ className, variant = 'base', padding = 'lg', children, ...props }: CardProps) {
  // Glass card variant
  if (variant === 'glass') {
    return (
      <div
        className={cn(
          'bg-white/70 backdrop-blur-glass border border-white/30 rounded-2xl transition-all duration-200',
          padding === 'none' && 'p-0',
          padding === 'sm' && 'p-4',
          padding === 'md' && 'p-6',
          padding === 'lg' && 'p-8',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Interactive card variant (with hover lift + border glow)
  if (variant === 'interactive') {
    return (
      <div
        className={cn(
          'bg-white border border-warm-200 rounded-2xl transition-all duration-200 cursor-pointer',
          'hover:shadow-lg hover:-translate-y-0.5 hover:border-primary-200',
          padding === 'none' && 'p-0',
          padding === 'sm' && 'p-4',
          padding === 'md' && 'p-6',
          padding === 'lg' && 'p-8',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Stat card variant (2px green left border)
  if (variant === 'stat') {
    return (
      <div
        className={cn(
          'bg-white border border-warm-200 border-l-2 border-l-primary-600 rounded-2xl',
          padding === 'none' && 'p-0',
          padding === 'sm' && 'p-4',
          padding === 'md' && 'p-6',
          padding === 'lg' && 'p-6', // Stat cards use p-6 by default
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Base card variant
  return (
    <div
      className={cn(
        'bg-white border border-warm-200 rounded-2xl transition-all duration-200',
        padding === 'none' && 'p-0',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-6',
        padding === 'lg' && 'p-8',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Stat Card Content Components
interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  trend?: {
    value: string;
    positive?: boolean;
  };
  icon?: React.ReactNode;
}

export function StatCard({ className, label, value, trend, icon, ...props }: StatCardProps) {
  return (
    <Card variant="stat" padding="md" className={className} {...props}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className="text-3xl font-bold text-warm-900">
            {value}
          </p>
          {trend && (
            <p className={cn(
              'text-sm mt-2 flex items-center gap-1',
              trend.positive ? 'text-primary-600' : 'text-red-600'
            )}>
              {trend.positive ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="text-warm-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

// Card subcomponents
export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-8 py-6 border-b border-warm-100', className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-8', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-8 py-6 border-t border-warm-100 bg-warm-50/50', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-semibold text-warm-900', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-warm-500 mt-1', className)} {...props}>
      {children}
    </p>
  );
}
