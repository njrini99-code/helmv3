'use client';

/**
 * ============================================================================
 * RootSummary: the summary card on top of every root-map screen
 * ----------------------------------------------------------------------------
 * Summary first (owner direction 2026-09-25). One card:
 *
 *   - the key number: strokes lost a round to the Tour line, summed over the
 *     losing areas (labelled as that sum; the net and any gains sit beside
 *     it, never mixed in)
 *   - one sentence on where the strokes go (the stored headline)
 *   - ONE bold bar: the loss split by area, in proportion. It is the
 *     screen's single `role="img"` with the spoken summary.
 *   - the two biggest spots, listed beside the bar (not drawn inside it: a
 *     spot can be larger than its area when other spots there gain), each a
 *     44px button; the first carries one line of Why
 *   - the screen's one primary action, handed in by the caller
 *
 * Everything else on the screen sits behind a `Disclosure`.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/fairway';
import {
  formatStrokes,
  rootStyleLabel,
  whyIdOf,
  type BranchDetail,
  type CauseBranch,
  type RootAudience,
  type RootMapModel,
} from '@/lib/coachhelm/root-map/build-root-map';
import { INFERRED_LABEL } from '@/lib/coachhelm/root-map/plain-copy';
import { evidenceFillCss, evidenceFillOf, playersText } from './RootMap';

const NEG = 'var(--fw-viz-div-neg)';
const SURFACE = 'var(--fw-color-surface)';
const mix = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, ${SURFACE})`;
/** One hue, stepped by rank: the biggest area reads darkest. */
const AREA_SHADE = [100, 72, 52, 36];
/** Areas at least this share of the bar carry their label inside it. */
const INSIDE_LABEL_MIN = 0.24;

/** The biggest spots across the map, largest first. */
export function topSpots(model: RootMapModel, n = 2): CauseBranch[] {
  return model.losses
    .flatMap((a) => a.causes)
    .slice()
    .sort((a, b) => b.strokes - a.strokes)
    .slice(0, n);
}

/** One plain line of Why for a spot: its stored root in brief, or why there
 *  is none. Never states an inferred root as fact. */
export function leadWhyLine(
  spot: CauseBranch,
  details: Record<string, BranchDetail> | undefined,
  audience: RootAudience,
): string {
  const id = whyIdOf(spot);
  const detail = id ? details?.[id] ?? null : null;
  if (!id) {
    const m = spot.measured;
    return m
      ? `Measured from ${m.n} ${m.unit} over ${m.rounds} ${m.rounds === 1 ? 'round' : 'rounds'}; no stored read on this spot yet.`
      : 'No stored read on this spot yet.';
  }
  const root = detail?.rootCause ?? spot.rootCause;
  if (!root) return `${rootStyleLabel(spot.style, audience)}; the cause is not explained yet.`;
  const inferred = (detail?.causality ?? spot.causality) === 'inferred_hypothesis';
  return inferred ? `${root} (${INFERRED_LABEL.toLowerCase()})` : root;
}

export interface RootSummaryProps {
  model: RootMapModel;
  /** The stored one-sentence headline. */
  headline: string | null;
  /** Spoken summary of the whole map (the bar's accessible name). */
  summary: string;
  /** Accessible name prefix, e.g. "Team root map". */
  imgLabel?: string;
  details?: Record<string, BranchDetail>;
  audience?: RootAudience;
  eyebrow?: string;
  onSpot?: (id: string) => void;
  selectedId?: string | null;
  /** The screen's one primary action. */
  action?: ReactNode;
  /** Extra content under the spots (e.g. the team's "Needs you"). */
  children?: ReactNode;
  className?: string;
}

export function RootSummary({
  model,
  headline,
  summary,
  imgLabel,
  details,
  audience = 'player',
  eyebrow = 'Strokes lost a round to the Tour line',
  onSpot,
  selectedId = null,
  action,
  children,
  className,
}: RootSummaryProps) {
  const losses = [...model.losses].sort((a, b) => b.loss - a.loss);
  const lost = losses.reduce((t, a) => t + a.loss, 0);
  const gains = model.gains;
  const spots = topSpots(model);
  const narrow = losses.filter((a) => lost > 0 && a.loss / lost < INSIDE_LABEL_MIN);
  const label = imgLabel ? `${imgLabel}. ${summary}` : summary;

  return (
    <section
      className={cn('flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6', className)}
      data-slot="root-summary"
      aria-label="Summary"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow as="p">{eyebrow}</Eyebrow>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-fw-mono text-display tabular-nums text-text-primary" data-slot="summary-lost">
            {formatStrokes(lost)}
          </p>
          {gains.length > 0 && model.netSg !== null ? (
            <p className="text-caption text-text-secondary">
              gaining{' '}
              {gains.map((g, i) => (
                <span key={g.area}>
                  {i > 0 ? ', ' : ''}
                  {g.label.toLowerCase()}{' '}
                  <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(g.sg, { signed: true })}</span>
                </span>
              ))}{' '}
              · net <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(model.netSg, { signed: true })}</span>
            </p>
          ) : null}
        </div>
        {headline ? <p className="text-body text-text-secondary">{headline}</p> : null}
      </div>

      {losses.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div role="img" aria-label={label} className="flex h-12 w-full gap-0.5 overflow-hidden rounded-fw-md" data-slot="summary-bar">
            {losses.map((a, i) => {
              const share = lost > 0 ? a.loss / lost : 0;
              return (
                <div
                  key={a.area}
                  className="flex min-w-1.5 flex-col justify-center overflow-hidden px-2.5 text-text-primary"
                  style={{ width: `${share * 100}%`, background: mix(NEG, AREA_SHADE[i] ?? 30) }}
                  title={`${a.label} ${formatStrokes(a.sg, { signed: true })}`}
                  data-area={a.area}
                >
                  {share >= INSIDE_LABEL_MIN ? (
                    <>
                      <span className="truncate text-caption font-medium">{a.label}</span>
                      <span className="font-fw-mono text-body-sm font-semibold tabular-nums">{formatStrokes(a.loss)}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          {narrow.length > 0 ? (
            <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
              {narrow.map((a) => (
                <li key={a.area} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: mix(NEG, AREA_SHADE[losses.indexOf(a)] ?? 30) }}
                  />
                  {a.label} <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(a.loss)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {spots.length > 0 ? (
        <div className="flex flex-col gap-1" data-slot="summary-spots">
          <Eyebrow as="p" tone="secondary">
            {spots.length === 1 ? 'Biggest leak' : 'Biggest leaks'}
          </Eyebrow>
          <ol className="flex flex-col divide-y divide-border-subtle">
            {spots.map((s, i) => {
              const area = model.losses.find((a) => a.area === s.area);
              const body = (
                <>
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-fw-mono text-caption tabular-nums text-text-primary"
                    style={evidenceFillCss(evidenceFillOf(s.style))}
                  >
                    <span className="rounded-full bg-surface px-1">{i + 1}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-text-primary">{s.label}</span>
                    <span className="truncate text-caption text-text-secondary">
                      {area?.label}
                      {s.players !== undefined ? ` · ${playersText(s.players)}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-fw-mono text-title-2 tabular-nums text-text-primary">{formatStrokes(s.strokes)}</span>
                </>
              );
              return (
                <li key={s.id} className="flex flex-col gap-1 py-2" data-slot="summary-spot">
                  {onSpot ? (
                    <button
                      type="button"
                      aria-pressed={s.id === selectedId}
                      onClick={() => onSpot(s.id)}
                      className="-mx-2 flex min-h-11 items-center gap-3 rounded-fw-md px-2 text-left outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus motion-safe:transition-colors"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3">{body}</div>
                  )}
                  {i === 0 ? (
                    <p className="line-clamp-2 pl-10 text-body-sm text-text-secondary" data-slot="summary-why">
                      {leadWhyLine(s, details, audience)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {children}
      {action ? <div>{action}</div> : null}
    </section>
  );
}
