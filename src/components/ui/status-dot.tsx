import { cn } from '@/lib/utils';

type StatusDotVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'active';

interface StatusDotProps {
  variant?: StatusDotVariant;
  pulse?: boolean;
  className?: string;
  label?: string;
  size?: 'sm' | 'md';
}

const variantColors: Record<StatusDotVariant, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-400',
  active: 'bg-green-500',
};

export function StatusDot({
  variant = 'neutral',
  pulse = false,
  className,
  label,
  size = 'md',
}: StatusDotProps) {
  const sizeClass = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'rounded-full flex-shrink-0',
          sizeClass,
          variantColors[variant],
          pulse && 'animate-pulse',
          className
        )}
      />
      {label && (
        <span className="text-sm text-slate-600">{label}</span>
      )}
    </div>
  );
}

// Pipeline status dot with specific colors
export function PipelineStatusDot({
  stage,
  label,
  showLabel = true,
}: {
  stage: 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
  label?: string;
  showLabel?: boolean;
}) {
  const stageConfig: Record<string, { color: string; label: string }> = {
    watchlist: { color: 'bg-slate-400', label: 'Prospects' },
    high_priority: { color: 'bg-amber-500', label: 'High Priority' },
    offer_extended: { color: 'bg-blue-500', label: 'Offer Extended' },
    committed: { color: 'bg-green-500', label: 'Committed' },
    uninterested: { color: 'bg-slate-300', label: 'Not Interested' },
  };

  const config = stageConfig[stage] ?? stageConfig.watchlist;
  const colorClass = config?.color ?? 'bg-slate-400';
  const labelText = label ?? config?.label ?? 'Unknown';

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colorClass)} />
      {showLabel && (
        <span className="text-sm text-slate-600">{labelText}</span>
      )}
    </div>
  );
}

// Online status indicator
export function OnlineStatus({ online }: { online: boolean }) {
  return (
    <StatusDot
      variant={online ? 'success' : 'neutral'}
      pulse={online}
      size="sm"
    />
  );
}
