import { Badge } from '@/components/ui/badge';
import type { CoachEnrollmentSummary } from '@/app/golf/actions/crm-sequences';

/**
 * Shows a coach's outreach-queue state on the Coaches + Conferences lists so
 * teammates working the list by hand can see who's already handled:
 *   Queued  (blue)   — enrolled, not yet emailed (safe to work)
 *   Step N  (amber)  — in the sequence, touch N already sent
 *   Done    (emerald)— sequence complete (already emailed)
 *   Paused  (warm)   — temporarily held
 *   —                — not in the queue (stopped / sold / never enrolled)
 */
export function SequenceEnrollmentBadge({ summary }: { summary?: CoachEnrollmentSummary | null }) {
  const placeholder = <span className="text-micro text-warm-300" aria-label="Not in queue">&mdash;</span>;
  if (!summary || summary.status === 'stopped') return placeholder;

  const cls = 'gap-1 text-eyebrow px-1.5 py-0.5';
  if (summary.status === 'paused') {
    return <Badge tone="warm" size="none" title="Paused in sequence" className={cls}>Paused</Badge>;
  }
  if (summary.status === 'completed') {
    return <Badge tone="emerald" size="none" title="Emailed — sequence complete" className={cls}>Done</Badge>;
  }
  // active
  if ((summary.current_step ?? 0) >= 1) {
    return (
      <Badge tone="amber" size="none" title={`In sequence — touch ${summary.current_step} sent`} className={cls}>
        Step {summary.current_step}
      </Badge>
    );
  }
  return <Badge tone="blue" size="none" title="In queue — not yet emailed" className={cls}>Queued</Badge>;
}
