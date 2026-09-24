'use client';

/**
 * Evidence for one skill: the value, both baselines with their signed gaps,
 * the window, n and read word, and where the player sits in the team. One
 * action for a coach: make the skill a focus area.
 */

import { Sheet } from '@/components/fairway/overlays/Sheet';
import { cn } from '@/lib/utils';
import { getMetricDirection } from '@/lib/coachhelm/v3/metrics/registry';
import {
  type StrandTrait,
  type BaselineRead,
  advantageUnit,
  familyOf,
  formatAdvantage,
  percentilePhrase,
  readWord,
  windowLabel,
  TEAM_FLOOR,
} from './strand-model';
import { formatBaselineValue, toneFor } from './GenomeStrand';

export interface TraitEvidenceSheetProps {
  trait: StrandTrait | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coach only: turn this skill into a focus area. Omit for players. */
  onMakeFocus?: (t: StrandTrait) => void;
  focusBusy?: boolean;
}

export function TraitEvidenceSheet({ trait, open, onOpenChange, onMakeFocus, focusBusy }: TraitEvidenceSheetProps) {
  // The parent keeps the last trait set while `open` goes false, so the closing
  // sheet keeps its content through the exit instead of collapsing to empty.
  const t = trait;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t?.label ?? 'Evidence'}
      description={t ? familyOf(t.family).label : undefined}
      data-slot="genome-evidence-sheet"
    >
      {t ? (
        <div className="flex flex-col gap-6 px-1 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="font-fw-sans text-h1 tabular-nums text-text-primary">{t.valueText ?? 'Not measured'}</span>
            <span className="font-fw-sans text-body-sm text-text-tertiary">{unitNoun(t)}</span>
          </div>

          <dl className="divide-y divide-border-subtle border-y border-border-subtle">
            <CompareRow label="Team average" t={t} read={t.team} note={t.team.thin ? `Only ${t.teamN} teammates measured; under ${TEAM_FLOOR}, the average is thin` : null} />
            <CompareRow label={`${t.tourLabel} reference`} t={t} read={t.tour} note={null} />
            <Row label="Window" value={windowLabel(t.window)} />
            <Row label="Sample" value={t.n != null ? `${t.n} rounds` : 'Shot count not stored'} />
            <Row label="Read" value={readWord(t.read)} />
            {percentilePhrase(t.teamPercentile) ? <Row label="On the team" value={percentilePhrase(t.teamPercentile)!} /> : null}
          </dl>

          <p className="font-fw-sans text-caption text-text-tertiary">
            A plus sign means better than the baseline, for this skill&rsquo;s own direction
            {getMetricDirection(t.id) === 'lower_better' ? '; lower is better here' : ''}.
          </p>

          {onMakeFocus && t.valueText ? (
            <button
              type="button"
              onClick={() => onMakeFocus(t)}
              disabled={focusBusy}
              className="inline-flex h-12 w-full items-center justify-center rounded-fw-md bg-accent-650 font-fw-sans text-body font-semibold text-text-on-accent transition-[background-color,transform] duration-150 active:scale-[0.97] active:bg-accent-750 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2"
            >
              {focusBusy ? 'Creating focus area…' : 'Make it a focus area'}
            </button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function unitNoun(t: StrandTrait): string {
  switch (t.unit) {
    case 'percent':
      return 'make or save rate';
    case 'feet':
      return 'average proximity';
    case 'strokes_round':
      return 'strokes gained a round';
    case 'strokes_hole':
      return 'average strokes a hole';
    case 'per_round':
      return 'a round';
    case 'strokes':
      return 'strokes vs usual';
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="font-fw-sans text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-right font-fw-sans text-body-sm tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}

function CompareRow({ label, t, read, note }: { label: string; t: StrandTrait; read: BaselineRead; note: string | null }) {
  const tone = toneFor(read.advantage);
  return (
    <div className="flex min-h-11 flex-col justify-center gap-0.5 py-2">
      <div className="flex items-center justify-between gap-4">
        <dt className="font-fw-sans text-body-sm text-text-secondary">{label}</dt>
        <dd className="flex items-baseline gap-3 font-fw-sans text-body-sm tabular-nums">
          <span className="text-text-primary">{read.value != null ? formatBaselineValue(t, read.value) : 'None'}</span>
          {read.advantage != null ? (
            <span
              className={cn(
                'min-w-[4.5rem] text-right font-semibold',
                tone === 'ahead' ? 'text-accent-700' : tone === 'behind' ? 'text-fw-warning-ink' : 'text-text-secondary',
              )}
            >
              {formatAdvantage(t.unit, read.advantage)} {advantageUnit(t.unit)}
            </span>
          ) : null}
        </dd>
      </div>
      {read.missingReason ? <p className="font-fw-sans text-caption text-text-tertiary">{read.missingReason}</p> : null}
      {note ? <p className="font-fw-sans text-caption text-text-tertiary">{note}</p> : null}
    </div>
  );
}
