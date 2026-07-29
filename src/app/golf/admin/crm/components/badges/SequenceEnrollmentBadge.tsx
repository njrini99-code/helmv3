import { StatusPill } from '@/components/fairway';
import type { CoachEnrollmentSummary } from '@/app/golf/actions/crm-sequences';

/**
 * Shows a coach's outreach-queue state on the Coaches + Conferences lists so
 * teammates working the list by hand can see who's already handled:
 *   Queued  (neutral)      — enrolled, not yet emailed (safe to work)
 *   Step N  (accent wash)  — in the sequence, touch N already sent
 *   Done    (accent fill)  — sequence complete (already emailed)
 *   Paused  (warning)      — temporarily held
 *   —                      — not in the queue (stopped / sold / never enrolled)
 *
 * Fairway StatusPill, not the pre-Fairway `@/components/ui/badge`: that shared
 * Badge resolves `blue`/`amber`/`emerald` to raw Tailwind hues that don't
 * follow the warm token set. The ramp here matches EmailStatusBadge and
 * EngagementBadge — progress through the queue deepens the accent — and the
 * label always carries the state, so colour is only reinforcement.
 */
export function SequenceEnrollmentBadge({ summary }: { summary?: CoachEnrollmentSummary | null }) {
  const placeholder = <span className="text-micro text-text-tertiary" aria-label="Not in queue">&mdash;</span>;
  if (!summary || summary.status === 'stopped') return placeholder;

  const cls = 'gap-1 px-1.5 text-eyebrow';
  if (summary.status === 'paused') {
    return (
      <StatusPill tone="warning" size="sm" dot={false} title="Paused in sequence" className={cls}>
        Paused
      </StatusPill>
    );
  }
  if (summary.status === 'completed') {
    return (
      <StatusPill
        tone="accent"
        size="sm"
        dot={false}
        title="Emailed — sequence complete"
        className={`${cls} bg-accent-650 text-text-on-accent border-accent-700`}
      >
        Done
      </StatusPill>
    );
  }
  // active
  if ((summary.current_step ?? 0) >= 1) {
    return (
      <StatusPill
        tone="accent"
        size="sm"
        dot={false}
        title={`In sequence — touch ${summary.current_step} sent`}
        className={cls}
      >
        Step {summary.current_step}
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="neutral" size="sm" dot={false} title="In queue — not yet emailed" className={cls}>
      Queued
    </StatusPill>
  );
}
