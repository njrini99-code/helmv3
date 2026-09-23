'use client';

/**
 * AttributionReadout — A9 slice 3 (repair-plan §14.12): the coach-facing
 * display of a `golf_insight_outcome_attribution` row, fetched via
 * `getInsightAttributionReadout` (`src/app/golf/actions/insight-
 * attribution.ts`) and shaped by `attribution-view-model.ts`. Lives beside
 * `InsightCard`'s `OutcomeBadge` on the insight detail surface
 * (`FairwayPlayerInsight.tsx`) but reads a DIFFERENT column than that
 * badge: `OutcomeBadge` shows `golf_coach_insights.outcome_status`, a
 * player/coach's own self-reported verdict; this reads the AUTOMATED
 * attribution pipeline's measured before/after change.
 *
 * `readout === null` covers THREE cases the caller collapses on purpose —
 * the flag is off, the coach isn't authenticated, or the read failed — and
 * this component renders NOTHING for all three: an infra blip must never
 * look different from "this feature doesn't exist here", and a flag-off
 * coach must see nothing at all (repair-plan constraint: no behavior
 * change while `coachhelm_comparable_opportunity_attribution` stays off).
 *
 * `readout.state === 'missing'` (a real, non-null state — the insight
 * exists but was never attributed) DOES render, as a quiet, low-emphasis
 * note — distinct from silence, since a coach seeing NOTHING here could
 * otherwise misread it as "this insight was proven to do nothing" rather
 * than "we haven't measured this yet".
 *
 * LANGUAGE: every string below comes from `attribution-view-model.ts`'s
 * `describeMethodVersion`/`AttributionReadout` — this component adds no
 * strings of its own beyond the sample-size/"not attributed yet"
 * scaffolding, both scanned by `src/test/coachhelm/observed-outcome-
 * language.test.ts`.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttributionReadout as AttributionReadoutModel } from '@/lib/coachhelm/v3/effectiveness/attribution-view-model';

export interface AttributionReadoutProps {
  readout: AttributionReadoutModel | null;
  className?: string;
}

export function AttributionReadout({ readout, className }: AttributionReadoutProps) {
  if (!readout) return null;

  if (readout.state === 'missing') {
    return (
      <Badge
        tone="neutral"
        size="none"
        data-testid="attribution-readout"
        data-state="missing"
        className={cn('gap-1 px-2 py-0.5 text-eyebrow text-warm-500', className)}
      >
        <span>Not attributed yet</span>
      </Badge>
    );
  }

  if (readout.state === 'insufficient') {
    return (
      <Badge
        tone="neutral"
        size="none"
        data-testid="attribution-readout"
        data-state="insufficient"
        className={cn('gap-1 px-2 py-0.5 text-eyebrow', className)}
      >
        <span>Not enough rounds yet</span>
        <span className="text-warm-500">
          ({readout.sampleSize.before} before / {readout.sampleSize.after} after)
        </span>
      </Badge>
    );
  }

  return (
    <Badge
      tone={readout.method.isClean ? 'primary' : 'neutral'}
      size="none"
      data-testid="attribution-readout"
      data-state="result"
      data-method={readout.method.label}
      className={cn('gap-1 px-2 py-0.5 text-eyebrow', className)}
    >
      <span>{readout.method.description}</span>
      <span className="text-warm-500 tabular-nums">
        {readout.sampleSize.before}→{readout.sampleSize.after} rounds
      </span>
    </Badge>
  );
}
