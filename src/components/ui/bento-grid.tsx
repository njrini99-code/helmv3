import { cn } from '@/lib/utils';

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}

export function BentoGrid({ children, className, cols = 4 }: BentoGridProps) {
  const colsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 auto-rows-min stagger-quick',
        colsClass[cols],
        className
      )}
    >
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  size?: 'default' | 'large' | 'wide' | 'tall';
  glass?: boolean;
  hover?: boolean;
}

export function BentoCard({
  children,
  className,
  size = 'default',
  glass = true,
  hover = true,
}: BentoCardProps) {
  const sizeClasses = {
    default: '',
    large: 'md:col-span-2 md:row-span-2',
    wide: 'md:col-span-2',
    tall: 'md:row-span-2',
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl p-6 overflow-hidden',
        glass
          ? 'bg-white/70 backdrop-blur-xl saturate-150 border border-white/20 shadow-card'
          : 'bg-white border border-slate-100 shadow-sm',
        hover && 'transition-all duration-300 hover:shadow-card-hover hover:border-slate-200/50',
        sizeClasses[size],
        className
      )}
    >
      {/* Shine effect for glass cards */}
      {glass && (
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// Stat card variant
interface BentoStatCardProps {
  label: string;
  value: number | string;
  change?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BentoStatCard({
  label,
  value,
  change,
  icon,
  iconBg = 'bg-slate-100',
  iconColor = 'text-slate-600',
  size = 'md',
  className,
}: BentoStatCardProps) {
  const valueSize = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <BentoCard className={cn('group', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className={cn('font-semibold text-slate-900 mt-1 tabular-nums', valueSize[size])}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {change && <p className="text-xs text-slate-400 mt-1.5">{change}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center',
              'group-hover:scale-110 transition-transform duration-300',
              iconBg,
              iconColor
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </BentoCard>
  );
}

// Featured card with dark gradient
interface BentoFeaturedCardProps {
  children: React.ReactNode;
  className?: string;
  size?: 'default' | 'large' | 'wide';
  glowColor?: string;
}

export function BentoFeaturedCard({
  children,
  className,
  size = 'default',
  glowColor = 'bg-green-500/10',
}: BentoFeaturedCardProps) {
  const sizeClasses = {
    default: '',
    large: 'md:col-span-2 md:row-span-2',
    wide: 'md:col-span-2',
  };

  return (
    <div
      className={cn(
        'relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
        'border border-slate-700/50 p-6 overflow-hidden',
        sizeClasses[size],
        className
      )}
    >
      {/* Glow effect */}
      <div className={cn('absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl', glowColor)} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
