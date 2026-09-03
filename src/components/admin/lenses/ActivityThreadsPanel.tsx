import Link from 'next/link';
import { Surface, StatusPill, type FwStatusTone } from '@/components/fairway';
import type { ActivityThreadsLens, ThreadSeverity } from '@/lib/admin/lenses/activity-threads';

/** Semantic activity threads panel — see activity-threads.ts's header for
 *  why each thread is a per-team sentence rather than a per-round
 *  narrative. Links out to the existing entity-thread page for full detail. */

const SEVERITY_TONE: Record<ThreadSeverity, FwStatusTone> = {
  critical: 'danger',
  warning: 'warning',
  quiet: 'neutral',
};

export function ActivityThreadsPanel({ lens }: { lens: ActivityThreadsLens }) {
  return (
    <Surface padding="sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Recent activity threads</p>
      <div className="mt-2 divide-y divide-warm-200/60">
        {lens.threads.length === 0 ? (
          <p className="py-3 text-sm text-warm-500">No team activity in the last 48 hours.</p>
        ) : (
          lens.threads.map((t) => (
            <Link
              key={t.teamId}
              href={t.threadHref}
              className="flex items-center justify-between gap-3 rounded-fw-md py-3 transition-colors hover:bg-surface-sunken"
            >
              <p className="truncate text-sm text-warm-800">{t.sentence}</p>
              <StatusPill tone={SEVERITY_TONE[t.severity]} size="sm" dot>
                {t.severity}
              </StatusPill>
            </Link>
          ))
        )}
      </div>
      {lens.degradedNote && <p className="mt-3 text-caption text-warm-400">{lens.degradedNote}</p>}
    </Surface>
  );
}
