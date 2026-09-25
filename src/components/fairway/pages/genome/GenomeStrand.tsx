'use client';

/**
 * The strand: the Genome's signature instrument.
 *
 * One horizontal band, one rung per skill, grouped by family (tee → approach
 * → short game → putting → scoring → pressure). Each rung carries a capsule
 * that grows UP from the midline when the player is ahead of the baseline
 * (green) and DOWN when behind (amber). Capsule length encodes the size of the
 * gap, scaled per skill so a percentage and a stroke average share one band;
 * the exact signed gap is always printed, never implied by length alone.
 *
 * Thin reads draw ghosted (dashed outline, no fill). A skill with no reading
 * yet keeps its rung as a gap, never a zero.
 *
 * Interaction: tap a rung, or drag across the band, to scrub. Each new rung
 * fires a selection haptic. The readout below names the skill with its value,
 * both baselines, window, n and read word, and opens the evidence sheet.
 * Arrow keys move the selection. No draw-in animation: the band is final at
 * first paint (server-rendered), and only a baseline change moves the capsules.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { fwHaptic } from '@/lib/fairway/haptics';
import {
  type Baseline,
  type StrandTrait,
  advantageUnit,
  formatAdvantage,
  groupByFamily,
  isGhost,
  readFor,
  readWord,
  readTierWord,
  windowLabel,
} from './strand-model';

/** Pixel room each half of the band gives a capsule at full magnitude. */
const HALF = 44;

export function toneFor(adv: number | null): 'ahead' | 'behind' | 'even' {
  if (adv == null || adv === 0) return 'even';
  return adv > 0 ? 'ahead' : 'behind';
}

/* ------------------------------------------------------------------------- */
/* StrandBand: the bars only. Shared by the detail stage and compare.        */
/* ------------------------------------------------------------------------- */

export interface StrandBandProps {
  traits: readonly StrandTrait[];
  baseline: Baseline;
  selectedId: string | null;
  onSelect: (id: string, via: 'tap' | 'scrub' | 'key') => void;
  /** Print the signed gap at the largest edge and the largest gap. */
  directLabels?: boolean;
  /** Ids to emphasise (compare: where the two players differ most). */
  emphasis?: ReadonlySet<string>;
  /** Accessible name for the band's rung group. */
  ariaLabel: string;
  /** Shorter band for compare. */
  size?: 'lg' | 'md';
  className?: string;
}

export function StrandBand({
  traits,
  baseline,
  selectedId,
  onSelect,
  directLabels = true,
  emphasis,
  ariaLabel,
  size = 'lg',
  className,
}: StrandBandProps) {
  const half = size === 'lg' ? HALF : 32;
  const bandH = half * 2 + (directLabels ? 40 : 16);
  const groups = React.useMemo(() => groupByFamily(traits), [traits]);
  const scrubbing = React.useRef(false);
  const lastScrubbed = React.useRef<string | null>(null);

  // Which rungs get a printed number: the single largest edge and gap.
  const labelled = React.useMemo(() => {
    if (!directLabels) return new Set<string>();
    let best: StrandTrait | null = null;
    let worst: StrandTrait | null = null;
    for (const t of traits) {
      if (isGhost(t, baseline)) continue;
      const m = readFor(t, baseline).magnitude ?? 0;
      if (m > 0 && (!best || m > (readFor(best, baseline).magnitude ?? 0))) best = t;
      if (m < 0 && (!worst || m < (readFor(worst, baseline).magnitude ?? 0))) worst = t;
    }
    return new Set([best?.id, worst?.id].filter(Boolean) as string[]);
  }, [traits, baseline, directLabels]);

  function idAt(clientX: number, clientY: number): string | null {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-trait-id]');
    return el?.dataset.traitId ?? null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    scrubbing.current = true;
    lastScrubbed.current = null;
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!scrubbing.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = idAt(e.clientX, rect.top + rect.height / 2);
    if (id && id !== lastScrubbed.current && id !== selectedId) {
      lastScrubbed.current = id;
      onSelect(id, 'scrub');
    }
  }
  function endScrub() {
    scrubbing.current = false;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const ids = traits.map((t) => t.id);
    const i = selectedId ? ids.indexOf(selectedId as StrandTrait['id']) : -1;
    const next = e.key === 'ArrowRight' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
    const id = ids[next];
    if (!id) return;
    onSelect(id, 'key');
    const btn = e.currentTarget.querySelector<HTMLElement>(`[data-trait-id="${id}"]`);
    btn?.focus();
  }

  return (
    <div className={cn('w-full', className)}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegates arrow keys and scrub to the rung buttons inside it */}
      <div
        role="group"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={endScrub}
        className="relative flex w-full touch-pan-y select-none gap-1 font-fw-sans text-caption"
        style={{ height: bandH }}
      >
        {/* The midline: the baseline itself. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-strong" />
        {groups.map(({ family, traits: fam }) => (
          <div
            key={family.id}
            className="flex min-w-0"
            style={{ flexGrow: fam.length, flexBasis: 0, minWidth: `${family.label.length}ch` }}
          >
            {fam.map((t) => (
              <Rung
                key={t.id}
                trait={t}
                baseline={baseline}
                half={half}
                selected={t.id === selectedId}
                emphasised={emphasis?.has(t.id) ?? false}
                showLabel={labelled.has(t.id)}
                onTap={() => onSelect(t.id, 'tap')}
              />
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex w-full gap-1 font-fw-sans text-caption">
        {groups.map(({ family, traits: fam }) => (
          <div
            key={family.id}
            className="min-w-0 border-t border-border-subtle pt-1.5 text-center font-fw-sans text-caption text-text-tertiary"
            style={{ flexGrow: fam.length, flexBasis: 0, minWidth: `${family.label.length}ch` }}
          >
            {family.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Rung({
  trait,
  baseline,
  half,
  selected,
  emphasised,
  showLabel,
  onTap,
}: {
  trait: StrandTrait;
  baseline: Baseline;
  half: number;
  selected: boolean;
  emphasised: boolean;
  showLabel: boolean;
  onTap: () => void;
}) {
  const r = readFor(trait, baseline);
  const ghost = isGhost(trait, baseline);
  const tone = toneFor(r.advantage);
  // A visible sliver even for a hair's-width gap, so "measured, about even"
  // never looks like "not measured".
  const len = r.magnitude == null ? 0 : Math.max(3, Math.abs(r.magnitude) * half);
  const up = tone === 'ahead';
  const measured = r.magnitude != null;

  const name = `${trait.label}: ${
    trait.valueText == null
      ? 'not measured yet'
      : measured
        ? `${trait.valueText}, ${formatAdvantage(trait.unit, r.advantage ?? 0)} ${advantageUnit(trait.unit)} vs ${baseline === 'team' ? 'team' : trait.tourLabel}`
        : `${trait.valueText}, ${r.missingReason ?? 'no comparison'}`
  }${ghost && measured ? `, ${readWord(trait.readN).toLowerCase()}` : ''}`;

  return (
    // eslint-disable-next-line helm/no-raw-button -- a strand rung is a 44pt-tall hit area drawn as a capsule; <Button>'s padding and pill chrome would break the band's alignment
    <button
      type="button"
      data-trait-id={trait.id}
      aria-pressed={selected}
      aria-label={name}
      tabIndex={selected ? 0 : -1}
      onClick={onTap}
      className={cn(
        'group relative h-full min-w-0 flex-1 rounded-sm outline-none transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-border-focus',
        selected ? 'bg-surface-sunken' : 'active:bg-surface-sunken',
      )}
    >
      {/* The rung: a hairline ladder step, always drawn. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-1/2 w-px -translate-x-1/2 bg-border-subtle',
          selected && 'bg-border-strong',
        )}
        style={{ top: `calc(50% - ${half}px)`, height: half * 2 }}
      />
      {measured ? (
        <span
          aria-hidden
          className={cn(
            'absolute left-1/2 w-[min(8px,70%)] -translate-x-1/2 rounded-full transition-[height,top] duration-200 ease-out motion-reduce:transition-none',
            ghost
              ? cn('border border-dashed bg-transparent', up ? 'border-accent-600' : 'border-fw-warning')
              : up
                ? 'bg-accent-600'
                : 'bg-fw-warning',
            emphasised && !ghost && 'w-[min(10px,80%)]',
          )}
          style={{
            height: len,
            top: up ? `calc(50% - ${len}px)` : '50%',
          }}
        />
      ) : (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-tertiary/50"
        />
      )}
      {showLabel && measured ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-fw-sans text-caption font-semibold tabular-nums',
            up ? 'text-accent-700' : 'text-fw-warning-ink',
          )}
          style={up ? { top: `calc(50% - ${len}px - 20px)` } : { top: `calc(50% + ${len}px + 2px)` }}
        >
          {formatAdvantage(trait.unit, r.advantage ?? 0)}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* StrandReadout: the selected skill, typeset under the band.                 */
/* ------------------------------------------------------------------------- */

export function StrandReadout({
  trait,
  baseline,
  onOpenEvidence,
}: {
  trait: StrandTrait | null;
  baseline: Baseline;
  onOpenEvidence: (t: StrandTrait) => void;
}) {
  if (!trait) return null;
  const r = readFor(trait, baseline);
  const tone = toneFor(r.advantage);
  const ghost = isGhost(trait, baseline);
  const n = trait.n;
  return (
    <div aria-live="polite" className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="min-w-0 font-fw-sans text-h3 text-text-primary">{trait.label}</h3>
        {r.advantage != null ? (
          <span
            className={cn(
              'shrink-0 font-fw-sans text-h3 tabular-nums',
              ghost ? 'text-text-secondary' : tone === 'ahead' ? 'text-accent-700' : tone === 'behind' ? 'text-fw-warning-ink' : 'text-text-primary',
            )}
          >
            {formatAdvantage(trait.unit, r.advantage)}
            <span className="ml-1 font-fw-sans text-caption font-medium text-text-tertiary">{advantageUnit(trait.unit)}</span>
          </span>
        ) : null}
      </div>
      <p className="font-fw-sans text-body-sm tabular-nums text-text-secondary">
        {trait.valueText ?? 'Not measured yet'}
        {trait.team.value != null ? <> · Team {formatBase(trait, trait.team.value)}</> : null}
        {trait.tour.value != null ? <> · {trait.tourLabel} {formatBase(trait, trait.tour.value)}</> : null}
        {r.missingReason && trait.valueText ? <> · {r.missingReason}</> : null}
      </p>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 font-fw-sans text-caption text-text-tertiary">
          {windowLabel(trait.window)}
          {n != null ? <span className="tabular-nums"> · n={n} rounds</span> : null}
          {' · '}
          {n != null ? readTierWord(trait.readN) : readWord(trait.readN)}
          {r.thin ? ' · team average thin' : null}
        </p>
        {trait.valueText ? (
          <Button variant="ghost" size="sm" className="-mr-2 shrink-0 text-accent-700" onClick={() => onOpenEvidence(trait)}>
            Evidence
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatBase(t: StrandTrait, v: number): string {
  // Baselines print in the trait's own unit, without a sign for level values.
  switch (t.unit) {
    case 'percent':
      return `${v.toFixed(1)}%`;
    case 'feet':
      return `${v.toFixed(1)} ft`;
    case 'strokes_round':
    case 'strokes':
      return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
    default:
      return v.toFixed(2);
  }
}

export { formatBase as formatBaselineValue };

/* ------------------------------------------------------------------------- */
/* Accessible table: the same numbers, for screen readers.                    */
/* ------------------------------------------------------------------------- */

export function StrandTable({ traits, caption }: { traits: readonly StrandTrait[]; caption: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">Value</th>
          <th scope="col">Team</th>
          <th scope="col">Tour</th>
          <th scope="col">Window</th>
          <th scope="col">Read</th>
        </tr>
      </thead>
      <tbody>
        {traits.map((t) => (
          <tr key={t.id}>
            <th scope="row">{t.label}</th>
            <td>{t.valueText ?? 'Not measured yet'}</td>
            <td>{t.team.value != null ? formatBase(t, t.team.value) : (t.team.missingReason ?? 'None')}</td>
            <td>{t.tour.value != null ? formatBase(t, t.tour.value) : (t.tour.missingReason ?? 'None')}</td>
            <td>{windowLabel(t.window)}{t.n != null ? `, ${t.n} rounds` : ''}</td>
            <td>{readWord(t.readN)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Selection helper with the haptic contract: scrub and key moves tick. */
export function useStrandSelection(initial: string | null) {
  const [selectedId, setSelectedId] = React.useState<string | null>(initial);
  const current = React.useRef(initial);
  const select = React.useCallback((id: string, via: 'tap' | 'scrub' | 'key') => {
    if (current.current !== id && via !== 'key') fwHaptic('selection');
    current.current = id;
    setSelectedId(id);
  }, []);
  return { selectedId, setSelectedId, select };
}
