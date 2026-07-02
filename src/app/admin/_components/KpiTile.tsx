import Link from 'next/link';
import { StatTile, type StatTileProps } from '@/components/fairway';
import { cn } from '@/lib/utils';

export function KpiTile({
  label,
  value,
  href,
  format,
  trendData,
  delta,
  goodDirection = 'up',
  tone = 'neutral',
}: {
  label: string;
  value: number | null;
  href: string;
  format?: Intl.NumberFormatOptions;
  trendData?: readonly number[];
  delta?: number;
  goodDirection?: 'up' | 'down';
  tone?: 'neutral' | 'danger' | 'warning';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'block rounded-2xl transition-shadow hover:shadow-card-hover focus-visible:outline-2',
        tone === 'danger' && 'ring-1 ring-fw-danger/40',
        tone === 'warning' && 'ring-1 ring-fw-warning/40',
      )}
    >
      <StatTile
        label={label}
        value={value ?? undefined}
        starved={value === null}
        // Fairway's StatTile takes number-flow's `Format` (Intl.NumberFormatOptions
        // minus scientific/engineering notation) — the Shared Interfaces contract
        // pins the wider Intl.NumberFormatOptions here, so narrow at the boundary.
        format={format as StatTileProps['format']}
        trendData={trendData}
        delta={delta}
        goodDirection={goodDirection}
        mono
      />
    </Link>
  );
}
