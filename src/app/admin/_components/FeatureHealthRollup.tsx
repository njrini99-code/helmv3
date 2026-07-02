import Link from 'next/link';
import { StatusPill } from '@/components/fairway';
import type { FeatureHealthSummary } from '@/lib/admin/data/feature-health';

/**
 * W16 Task 5 — compact Feature-Health rollup for the Overview tab.
 * Banner-disciplined (N6): a small "N green / M amber / R red / K neutral"
 * summary + up to 4 inline red/amber chips, all linking to /admin/health.
 * Never a celebration wall — the all-green case renders the SAME one quiet
 * line, nothing more.
 */
export function FeatureHealthRollup({ summary }: { summary: FeatureHealthSummary }) {
  if (summary.degraded) {
    return (
      <p className="text-xs text-warm-600">
        Feature health unavailable this refresh — showing last-known Overview data, not a fabricated state.
      </p>
    );
  }

  const flagged = [
    ...summary.redFeatures.map((f) => ({ ...f, tone: 'danger' as const })),
    ...summary.amberFeatures.map((f) => ({ ...f, tone: 'warning' as const })),
  ];
  const chips = flagged.slice(0, 4);
  const overflow = flagged.length - chips.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/admin/health" className="font-fw-mono text-xs tabular-nums text-warm-700 hover:underline">
        Features: {summary.green} green · {summary.amber} amber · {summary.red} red · {summary.neutral} neutral
      </Link>
      {chips.map((c) => (
        <StatusPill key={c.key} tone={c.tone} dot size="sm">
          {c.label}
        </StatusPill>
      ))}
      {overflow > 0 ? (
        <Link href="/admin/health" className="text-xs font-medium text-accent-700 underline underline-offset-2">
          +{overflow} more → Health
        </Link>
      ) : null}
    </div>
  );
}
