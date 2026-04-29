'use client';

import { cn } from '@/lib/utils';
import type { CoachEngagement } from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// EngagementSparkline — opens vs clicks (90d) at a glance
// ============================================================================
// Used inside CoachDetailPanel (Phase 1.5). Two stacked bars on a fixed
// 80x24 canvas; widths scale to the coach's max(opens_90d, clicks_90d).
// If both counts are zero we render a muted "no activity" line instead.
// ============================================================================

interface EngagementSparklineProps {
  engagement?: CoachEngagement;
  className?: string;
  width?: number;
  height?: number;
}

export function EngagementSparkline({
  engagement,
  className,
  width = 80,
  height = 24,
}: EngagementSparklineProps) {
  if (!engagement || (engagement.opens_90d === 0 && engagement.clicks_90d === 0)) {
    return (
      <div
        className={cn('flex items-center', className)}
        style={{ width, height }}
        aria-label="No email engagement in last 90 days"
      >
        <div className="h-px w-full bg-warm-200" />
      </div>
    );
  }

  const max = Math.max(engagement.opens_90d, engagement.clicks_90d);
  const barH = Math.max(2, Math.floor((height - 6) / 2));
  const opensW = Math.max(2, Math.round((engagement.opens_90d / max) * width));
  const clicksW = Math.max(2, Math.round((engagement.clicks_90d / max) * width));

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${engagement.opens_90d} opens and ${engagement.clicks_90d} clicks in last 90 days`}
    >
      {/* Opens — blue */}
      <rect
        x="0"
        y={Math.floor(height / 2) - barH - 1}
        width={opensW}
        height={barH}
        rx="1"
        className="fill-blue-400"
      />
      {/* Clicks — emerald */}
      <rect
        x="0"
        y={Math.floor(height / 2) + 1}
        width={clicksW}
        height={barH}
        rx="1"
        className="fill-emerald-500"
      />
    </svg>
  );
}
