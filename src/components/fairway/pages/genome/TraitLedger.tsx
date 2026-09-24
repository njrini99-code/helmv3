'use client';

/**
 * The ranked ledger under the strand: every measured skill, largest edge first
 * and largest gap last, as hairline rows. Each row carries a small diverging
 * bar from the baseline, the signed gap, and a second line with the value, the
 * team and the Tour numbers. The whole row opens the evidence sheet.
 *
 * No trend glyph: the standing snapshot holds no history, and a glyph with no
 * series behind it would be invented.
 */

import { cn } from '@/lib/utils';
import {
  type Baseline,
  type StrandTrait,
  advantageUnit,
  formatAdvantage,
  isGhost,
  rankTraits,
  readFor,
  readWord,
} from './strand-model';
import { formatBaselineValue, toneFor } from './GenomeStrand';

export interface TraitLedgerProps {
  traits: readonly StrandTrait[];
  baseline: Baseline;
  selectedId: string | null;
  onOpen: (t: StrandTrait) => void;
}

export function TraitLedger({ traits, baseline, selectedId, onOpen }: TraitLedgerProps) {
  const ranked = rankTraits(traits, baseline);
  const unmeasured = traits.filter((t) => t.value == null);
  return (
    <div className="flex flex-col">
      <ol className="border-t border-border-strong">
        {ranked.map((t, i) => (
          <li key={t.id} id={`trait-${t.id}`} className="border-b border-border-subtle">
            <LedgerRow trait={t} rank={i + 1} baseline={baseline} selected={t.id === selectedId} onOpen={onOpen} />
          </li>
        ))}
      </ol>
      {unmeasured.length > 0 ? (
        <p className="pt-3 font-fw-sans text-caption text-text-tertiary">
          Not measured yet: {unmeasured.map((t) => t.label).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}

function LedgerRow({
  trait,
  rank,
  baseline,
  selected,
  onOpen,
}: {
  trait: StrandTrait;
  rank: number;
  baseline: Baseline;
  selected: boolean;
  onOpen: (t: StrandTrait) => void;
}) {
  const r = readFor(trait, baseline);
  const tone = toneFor(r.advantage);
  const ghost = isGhost(trait, baseline);
  const mag = r.magnitude ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(trait)}
      aria-label={`${rank}. ${trait.label}, ${trait.valueText ?? 'not measured'}${
        r.advantage != null ? `, ${formatAdvantage(trait.unit, r.advantage)} ${advantageUnit(trait.unit)} vs ${baseline === 'team' ? 'team' : trait.tourLabel}` : `, ${r.missingReason ?? 'no comparison'}`
      }. Open evidence`}
      className={cn(
        'grid min-h-14 w-full grid-cols-[minmax(0,1fr)_64px_72px] items-center gap-3 py-2.5 text-left transition-colors duration-150 md:grid-cols-[minmax(0,1fr)_96px_repeat(3,80px)_88px]',
        'active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
        selected && 'bg-surface-sunken/60',
      )}
    >
      <span className="min-w-0">
        <span className="block font-fw-sans text-body text-text-primary">{trait.label}</span>
        <span className="block font-fw-sans text-caption tabular-nums text-text-tertiary md:hidden">
          {trait.valueText}
          {trait.team.value != null ? ` · Team ${formatBaselineValue(trait, trait.team.value)}` : ''}
          {trait.tour.value != null ? ` · ${trait.tourLabel} ${formatBaselineValue(trait, trait.tour.value)}` : ''}
        </span>
        {ghost ? (
          <span className="block font-fw-sans text-caption text-text-tertiary">
            {r.magnitude == null
              ? (r.missingReason ?? 'No comparison')
              : r.thin
                ? 'Team average thin'
                : `${readWord(trait.read)}${trait.n != null ? ` · n=${trait.n}` : ''}`}
          </span>
        ) : null}
      </span>

      {/* Diverging bar from the baseline (centre). */}
      <span aria-hidden className="relative h-4 w-full">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
        {r.magnitude != null ? (
          <span
            className={cn(
              'absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full',
              ghost
                ? cn('border border-dashed bg-transparent', tone === 'ahead' ? 'border-accent-600' : 'border-fw-warning')
                : tone === 'ahead'
                  ? 'bg-accent-600'
                  : 'bg-fw-warning',
            )}
            style={
              mag >= 0
                ? { left: '50%', width: `${Math.max(4, mag * 50)}%` }
                : { right: '50%', width: `${Math.max(4, -mag * 50)}%` }
            }
          />
        ) : null}
      </span>

      <span className="hidden text-right font-fw-sans text-body-sm tabular-nums text-text-primary md:block">
        {trait.valueText ?? ''}
      </span>
      <span className="hidden text-right font-fw-sans text-body-sm tabular-nums text-text-secondary md:block">
        {trait.team.value != null ? formatBaselineValue(trait, trait.team.value) : '·'}
      </span>
      <span className="hidden text-right font-fw-sans text-body-sm tabular-nums text-text-secondary md:block">
        {trait.tour.value != null ? formatBaselineValue(trait, trait.tour.value) : '·'}
      </span>

      <span
        className={cn(
          'text-right font-fw-sans text-body font-semibold tabular-nums',
          r.advantage == null || ghost
            ? 'text-text-tertiary'
            : tone === 'ahead'
              ? 'text-accent-700'
              : tone === 'behind'
                ? 'text-fw-warning-ink'
                : 'text-text-secondary',
        )}
      >
        {r.advantage != null ? formatAdvantage(trait.unit, r.advantage) : ''}
        {r.advantage != null ? (
          <span className="block font-fw-sans text-caption font-medium text-text-tertiary">{advantageUnit(trait.unit)}</span>
        ) : null}
      </span>
    </button>
  );
}

/** Column heads for the ledger on md and up (phone keeps the second line). */
export function TraitLedgerHead({ baseline, tourLabel }: { baseline: Baseline; tourLabel: string }) {
  return (
    <div
      aria-hidden
      className="hidden grid-cols-[minmax(0,1fr)_96px_repeat(3,80px)_88px] gap-3 pb-2 font-fw-sans text-caption text-text-tertiary md:grid"
    >
      <span>Skill</span>
      <span />
      <span className="text-right">Player</span>
      <span className="text-right">Team</span>
      <span className="text-right">{tourLabel}</span>
      <span className="text-right">vs {baseline === 'team' ? 'team' : tourLabel}</span>
    </div>
  );
}
