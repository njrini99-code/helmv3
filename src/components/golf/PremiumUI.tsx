'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { forwardRef } from 'react';

// ============================================================================
// PAGE HEADER - Clean Linear-style sticky header
// ============================================================================

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: {
    label: string;
    variant?: 'default' | 'success' | 'warning' | 'info';
  };
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

export function PageHeader({ title, description, badge, actions, breadcrumb }: PageHeaderProps) {
  const badgeColors = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    info: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="border-b border-slate-200/60 bg-white/80 backdrop-blur-xl sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-5">
        {/* Breadcrumb */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1.5 text-sm mb-2">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300">/</span>}
                {item.href ? (
                  <Link href={item.href} className="text-slate-500 hover:text-slate-900 transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-slate-900 font-medium">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
                {badge && (
                  <span className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    badgeColors[badge.variant || 'default']
                  )}>
                    {badge.label}
                  </span>
                )}
              </div>
              {description && (
                <p className="text-sm text-slate-500 mt-0.5">{description}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// METRIC CARD - Compact stat display with subtle animations
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  iconColor?: string;
  trend?: {
    value: number;
    positive: boolean;
  };
  subValue?: string;
  href?: string;
  className?: string;
  delay?: number;
}

export function MetricCard({ 
  label, 
  value, 
  icon, 
  iconColor = 'bg-slate-100',
  trend, 
  subValue, 
  href, 
  className,
  delay = 0 
}: MetricCardProps) {
  const content = (
    <div 
      className={cn(
        'group relative bg-white rounded-xl p-4 transition-all duration-200',
        'border border-slate-200/60 hover:border-slate-300/80',
        'hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)]',
        href && 'cursor-pointer',
        className
      )}
      style={{ 
        animationDelay: `${delay}ms`,
        animation: 'fadeInUp 0.4s ease-out forwards',
        opacity: 0,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 mb-1 truncate">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
            {trend && (
              <span className={cn(
                'flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                trend.positive 
                  ? 'text-emerald-700 bg-emerald-50' 
                  : 'text-red-600 bg-red-50'
              )}>
                <svg 
                  width="8" 
                  height="8" 
                  viewBox="0 0 8 8" 
                  fill="currentColor"
                  className={trend.positive ? '' : 'rotate-180'}
                >
                  <path d="M4 1L7 5H1L4 1Z" />
                </svg>
                {Math.abs(trend.value).toFixed(1)}
              </span>
            )}
          </div>
          {subValue && (
            <p className="text-[11px] text-slate-400 mt-0.5">{subValue}</p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            'transition-transform group-hover:scale-105',
            iconColor
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ============================================================================
// DATA TABLE - Premium table with hover states
// ============================================================================

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyState?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function DataTable<T extends { id: string }>({ 
  columns, 
  data, 
  onRowClick,
  emptyState,
  loading,
  className 
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn('bg-white rounded-xl border border-slate-200/60 overflow-hidden', className)}>
        <div className="animate-pulse">
          <div className="h-12 bg-slate-50 border-b border-slate-100" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-b border-slate-50 flex items-center px-4 gap-4">
              <div className="h-4 bg-slate-100 rounded w-1/4" />
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-1/6 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className={cn('bg-white rounded-xl border border-slate-200/60 overflow-hidden', className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200/60 overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              {columns.map((col) => (
                <th 
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right'
                  )}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map((item, index) => (
              <tr 
                key={item.id}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'transition-colors duration-150',
                  onRowClick && 'cursor-pointer hover:bg-slate-50/80'
                )}
                style={{
                  animation: 'fadeInUp 0.3s ease-out forwards',
                  animationDelay: `${index * 30}ms`,
                  opacity: 0,
                }}
              >
                {columns.map((col) => (
                  <td 
                    key={col.key}
                    className={cn(
                      'px-4 py-3.5 text-sm',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right'
                    )}
                  >
                    {col.render 
                      ? col.render(item, index) 
                      : (item as any)[col.key]
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ACTION CARD - Quick action with icon
// ============================================================================

interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  href: string;
  variant?: 'default' | 'primary';
  delay?: number;
}

export function ActionCard({ icon, label, description, href, variant = 'default', delay = 0 }: ActionCardProps) {
  return (
    <Link href={href}>
      <div 
        className={cn(
          'group flex items-center gap-3.5 p-3.5 rounded-xl transition-all duration-200',
          variant === 'primary' 
            ? 'bg-slate-900 text-white hover:bg-slate-800' 
            : 'bg-white border border-slate-200/60 hover:border-slate-300 hover:shadow-sm'
        )}
        style={{ 
          animationDelay: `${delay}ms`,
          animation: 'fadeInUp 0.4s ease-out forwards',
          opacity: 0,
        }}
      >
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          'transition-transform group-hover:scale-105',
          variant === 'primary' ? 'bg-white/10' : 'bg-slate-100'
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-medium text-sm',
            variant === 'primary' ? 'text-white' : 'text-slate-900'
          )}>
            {label}
          </p>
          {description && (
            <p className={cn(
              'text-xs mt-0.5',
              variant === 'primary' ? 'text-white/60' : 'text-slate-500'
            )}>
              {description}
            </p>
          )}
        </div>
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 16 16" 
          fill="none"
          className={cn(
            'flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all',
            variant === 'primary' ? 'text-white/60' : 'text-slate-400'
          )}
        >
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </Link>
  );
}

// ============================================================================
// SECTION - Layout container with header
// ============================================================================

interface SectionProps {
  title?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}

export function Section({ title, action, children, className }: SectionProps) {
  return (
    <div className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
          )}
          {action && (
            <Link href={action.href}>
              <button className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors">
                {action.label}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </Link>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ============================================================================
// LIST CARD - Compact list item
// ============================================================================

interface ListCardProps {
  avatar?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string | number;
  valueLabel?: string;
  badge?: { label: string; color: string };
  onClick?: () => void;
  delay?: number;
}

export function ListCard({ avatar, title, subtitle, value, valueLabel, badge, onClick, delay = 0 }: ListCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 p-3 rounded-xl transition-all duration-150',
        onClick && 'cursor-pointer hover:bg-slate-50'
      )}
      style={{ 
        animationDelay: `${delay}ms`,
        animation: 'fadeInUp 0.3s ease-out forwards',
        opacity: 0,
      }}
    >
      {avatar && (
        <div className="flex-shrink-0">{avatar}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm text-slate-900 truncate">{title}</p>
          {badge && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', badge.color)}>
              {badge.label}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {(value !== undefined || valueLabel) && (
        <div className="text-right flex-shrink-0">
          {value !== undefined && (
            <p className="font-semibold text-sm text-slate-900 tabular-nums">{value}</p>
          )}
          {valueLabel && (
            <p className="text-[10px] text-slate-400">{valueLabel}</p>
          )}
        </div>
      )}
      {onClick && (
        <svg 
          width="14" 
          height="14" 
          viewBox="0 0 14 14" 
          fill="none"
          className="flex-shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

// ============================================================================
// EMPTY STATE - Premium empty states
// ============================================================================

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  compact?: boolean;
}

export function PremiumEmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-8 px-4' : 'py-16 px-6'
    )}>
      <div className={cn(
        'rounded-2xl bg-slate-100/80 flex items-center justify-center mb-4',
        'animate-pulse-subtle',
        compact ? 'w-12 h-12' : 'w-16 h-16'
      )}>
        <div className="text-slate-400">{icon}</div>
      </div>
      <h3 className={cn(
        'font-semibold text-slate-900',
        compact ? 'text-sm' : 'text-lg'
      )}>
        {title}
      </h3>
      <p className={cn(
        'text-slate-500 mt-1 max-w-sm',
        compact ? 'text-xs' : 'text-sm'
      )}>
        {description}
      </p>
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link href={action.href}>
              <button className="btn btn-primary btn-sm">
                {action.label}
              </button>
            </Link>
          ) : (
            <button onClick={action.onClick} className="btn btn-primary btn-sm">
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SCORE BADGE - Golf score display
// ============================================================================

interface ScoreBadgeProps {
  score: number;
  toPar: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, toPar, size = 'md' }: ScoreBadgeProps) {
  const sizes = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-14 h-14 text-xl',
  };

  return (
    <div className={cn(
      'rounded-xl flex flex-col items-center justify-center',
      sizes[size],
      toPar < 0 ? 'bg-emerald-50' : toPar === 0 ? 'bg-slate-100' : 'bg-amber-50'
    )}>
      <span className={cn(
        'font-bold tabular-nums leading-none',
        toPar < 0 ? 'text-emerald-600' : toPar === 0 ? 'text-slate-700' : 'text-amber-600'
      )}>
        {score}
      </span>
      <span className={cn(
        'text-[10px] font-medium mt-0.5',
        toPar < 0 ? 'text-emerald-500' : toPar === 0 ? 'text-slate-500' : 'text-amber-500'
      )}>
        {toPar > 0 ? '+' : ''}{toPar}
      </span>
    </div>
  );
}

// ============================================================================
// STAT GRID - Grid of stats
// ============================================================================

interface StatItem {
  label: string;
  value: string | number;
  color?: 'default' | 'success' | 'warning' | 'danger';
}

interface StatGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}

export function StatGrid({ stats, columns = 4, className }: StatGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  };

  const colors = {
    default: 'text-slate-700',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };

  return (
    <div className={cn('grid gap-4 text-center', gridCols[columns], className)}>
      {stats.map((stat, i) => (
        <div key={i}>
          <div className={cn('text-2xl font-bold tabular-nums', colors[stat.color || 'default'])}>
            {stat.value}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// BUTTON - Premium button variants
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const PremiumButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
      secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-5 py-2.5 text-base gap-2',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-lg',
          'transition-all duration-200 ease-out',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
PremiumButton.displayName = 'PremiumButton';

// ============================================================================
// KEYFRAMES - Animation keyframes for inline styles
// ============================================================================

export const keyframeStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
