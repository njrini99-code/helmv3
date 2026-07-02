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
        // Full-height block so the tile (and its inner StatTile panel) fills
        // the grid row when a sibling cell is taller — see StatTile's own
        // `h-full` for the other half of this contract (phone-width KPI grid
        // audit, 2026-07-02: orphaned label + mismatched cell heights).
        'block h-full rounded-2xl transition-shadow hover:shadow-card-hover',
        // Fairway's real focus token (matches src/components/fairway/data-table/data-table.tsx
        // etc.) — the PRIOR `focus-visible:outline-2` set only outline-WIDTH
        // with no color/style, so the browser's own default blue focus ring
        // painted through on tap (iOS Safari can retain :focus-visible on a
        // tapped link after an in-page refresh). This is the stray blue ring
        // fix, not a new interaction — no other affordance changes.
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
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
