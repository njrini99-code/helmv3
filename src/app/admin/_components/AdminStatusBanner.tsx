import { CheckCircle2, AlertTriangle, AlertOctagon, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BannerState = 'nominal' | 'attention' | 'critical' | 'stale';

const STATES: Record<BannerState, { icon: typeof CheckCircle2; dot: string; label: (n: number) => string }> = {
  nominal: { icon: CheckCircle2, dot: 'bg-fw-success', label: () => 'All systems nominal' },
  attention: { icon: AlertTriangle, dot: 'bg-fw-warning', label: (n) => `${n} item${n === 1 ? '' : 's'} need attention` },
  critical: { icon: AlertOctagon, dot: 'bg-fw-danger', label: (n) => `${n} item${n === 1 ? '' : 's'} need attention` },
  stale: { icon: CloudOff, dot: 'bg-fw-warning', label: () => 'Status feed stale — showing last known state' },
};

/** Severity is icon + label + dot — never color alone. */
export function AdminStatusBanner({
  state,
  attentionCount,
  checkedAt,
}: {
  state: BannerState;
  attentionCount: number;
  checkedAt: string;
}) {
  const s = STATES[state];
  const Icon = s.icon;
  return (
    <div
      role="status"
      className="flex items-center justify-between rounded-2xl bg-[var(--fw-color-nav-bg)] px-5 py-3 text-white"
    >
      <div className="flex items-center gap-3">
        <span className={cn('h-2.5 w-2.5 rounded-full', s.dot)} aria-hidden />
        <Icon size={16} aria-hidden />
        <span className="text-sm font-medium">{s.label(attentionCount)}</span>
      </div>
      <span className="font-fw-mono text-xs tabular-nums text-white/60">
        checked {new Date(checkedAt).toLocaleTimeString()}
      </span>
    </div>
  );
}
