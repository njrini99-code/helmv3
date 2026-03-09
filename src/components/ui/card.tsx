import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'base' | 'glass' | 'interactive' | 'stat' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ className, variant = 'base', padding = 'lg', loading = false, children, ...props }: CardProps) {
  if (loading) {
    return (
      <div
        className={cn(
          'bg-white border border-warm-200 rounded-2xl overflow-hidden',
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-warm-100 rounded w-1/3" />
          <div className="h-8 bg-warm-100 rounded w-1/2" />
          <div className="h-4 bg-warm-100 rounded w-2/3" />
        </div>
      </div>
    );
  }

  // Glass card variant
  if (variant === 'glass') {
    return (
      <div
        className={cn(
          'bg-white/70 backdrop-blur-glass border border-white/30 rounded-2xl',
          'shadow-glass transition-[background-color,box-shadow] duration-200 ease-out',
          'hover:bg-white/75 hover:shadow-glass-hover',
          paddingClasses[padding],
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
          'bg-white border border-warm-200 rounded-2xl cursor-pointer',
          'shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out',
          'hover:shadow-card-hover hover:-translate-y-1 hover:border-primary-200',
          'active:translate-y-0 active:shadow-card active:duration-75',
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Elevated card with more prominent shadow
  if (variant === 'elevated') {
    return (
      <div
        className={cn(
          'bg-white border border-warm-100 rounded-2xl shadow-md',
          'transition-[transform,box-shadow] duration-200 ease-out',
          'hover:shadow-lg hover:-translate-y-0.5',
          paddingClasses[padding],
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
          'transition-[box-shadow,border-color] duration-200 ease-out',
          'hover:shadow-sm hover:border-l-primary-500',
          padding === 'lg' ? 'p-6' : paddingClasses[padding],
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
        'bg-white border border-warm-200 rounded-2xl',
        'transition-colors duration-200 ease-out',
        paddingClasses[padding],
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
          <p className="text-3xl font-bold text-warm-900 tabular-nums">
            {value}
          </p>
          {trend && (
            <p className={cn(
              'text-sm mt-2 flex items-center gap-1 font-medium',
              trend.positive ? 'text-primary-600' : 'text-red-600'
            )}>
              <span className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs',
                trend.positive ? 'bg-primary-50' : 'bg-red-50'
              )}>
                {trend.positive ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                )}
              </span>
              {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-warm-50 text-warm-400">
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
