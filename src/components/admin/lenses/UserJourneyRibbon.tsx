import { Check, HelpCircle, X, ChevronRight } from 'lucide-react';
import { Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { RibbonStage, UserJourneyRibbon as UserJourneyRibbonData } from '@/lib/admin/lenses/user-ribbon';

/**
 * UserJourneyRibbon — the dominant visual on a user's lens detail page
 * (brief §20-27: "User Journey Ribbon on detail (Login → Dashboard → Start
 * round → Autosave → Submit → Stats → CoachHelm)").
 *
 * Local, minimal primitive — see JourneyFlow.tsx's header for why (Phase 1's
 * shared premium primitives are not landed yet). `reached` is a tri-state,
 * never coerced to a binary: filled check (true), hollow question mark
 * (null — not instrumented), hollow X (false — instrumented and genuinely
 * not observed). Never renders "unknown" as healthy.
 */

function StageDot({ stage, isLast }: { stage: RibbonStage; isLast: boolean }) {
  const Icon = stage.reached === true ? Check : stage.reached === false ? X : HelpCircle;
  const tone =
    stage.reached === true
      ? 'border-accent-500 bg-accent-50 text-accent-700'
      : stage.reached === false
        ? 'border-fw-danger/40 bg-fw-danger-bg text-fw-danger-ink'
        : 'border-dashed border-border-strong bg-surface-sunken text-text-tertiary';

  return (
    <div className="flex flex-1 items-center gap-2 md:gap-3">
      <div className="flex flex-1 flex-col items-center gap-1 text-center">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-full border-2', tone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <p className="text-caption font-semibold uppercase tracking-wide text-warm-600">{stage.label}</p>
        {stage.at && (
          <p className="font-fw-mono text-caption text-warm-400" suppressHydrationWarning>
            {new Date(stage.at).toISOString().slice(0, 16).replace('T', ' ')}
          </p>
        )}
      </div>
      {!isLast && (
        <div className="hidden shrink-0 text-warm-300 md:flex" aria-hidden>
          <ChevronRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function UserJourneyRibbon({ ribbon }: { ribbon: UserJourneyRibbonData }) {
  return (
    <Surface padding="md">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-2">
        {ribbon.stages.map((stage, i) => (
          <StageDot key={stage.id} stage={stage} isLast={i === ribbon.stages.length - 1} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 text-xs text-warm-600 md:grid-cols-4">
        <div>
          <p className="uppercase tracking-wide text-warm-400">Incidents</p>
          <p className="font-fw-mono text-sm text-warm-900">{ribbon.incidents.count ?? 'Unavailable'}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-warm-400">Sessions (logins)</p>
          <p className="font-fw-mono text-sm text-warm-900">{ribbon.sessions.count ?? 'Unavailable'}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-warm-400">Live release</p>
          <p className="font-fw-mono text-sm text-warm-900">{ribbon.release.sha ?? 'Unknown'}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-warm-400">Trace/replay</p>
          <p className="font-fw-mono text-sm text-warm-900">{ribbon.traceReplayAvailable ? 'Available' : 'Not available'}</p>
        </div>
      </div>
      <p className="mt-3 text-caption text-warm-400">{ribbon.flagsCohort.note}</p>
    </Surface>
  );
}
