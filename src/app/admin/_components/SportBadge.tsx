import { cn } from '@/lib/utils';

export type BridgeSport = 'golf' | 'baseball' | 'shared';

const STYLES: Record<BridgeSport, { label: string; className: string }> = {
  golf: { label: 'Golf', className: 'text-accent-700 border-accent-200 bg-accent-50' },
  baseball: { label: 'Baseball', className: 'text-team-baseball border-team-baseball/30 bg-team-baseball/10' },
  shared: { label: 'Shared', className: 'text-warm-600 border-warm-300 bg-warm-100' },
};

/** Sport wayfinding ink — text + border, never color alone. Null → nothing
 *  (an event with no sport attribution renders unbadged, not mislabeled). */
export function SportBadge({ sport }: { sport: BridgeSport | null }) {
  if (!sport) return null;
  const s = STYLES[sport];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}
