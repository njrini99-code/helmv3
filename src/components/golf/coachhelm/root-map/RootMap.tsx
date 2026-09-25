'use client';

/**
 * ============================================================================
 * RootMap: one strokes-weighted diagram (gains above the Tour line, losses
 * below in Where / What / Why rows)
 * ----------------------------------------------------------------------------
 * Draws a {@link RootMapModel} from `src/lib/coachhelm/root-map`. Geometry is
 * percentages of the container only (no measuring, no ResizeObserver), so the
 * server render and the first client paint are identical at any width.
 *
 * Accessibility: the decorative band SVG is `role="img"` with a summary
 * label; every branch is a real `<button>` (sibling of the SVG, never inside
 * it) with `aria-pressed` and a full spoken label. A proportional branch can
 * be narrower than a thumb, so every branch is ALSO listed as a 44px chip
 * under the map (`RootBranchList`).
 *
 * Colors are tokens only: `--fw-viz-div-neg` (strokes lost) and
 * `--fw-viz-div-pos` (strokes gained) mixed into the surface.
 * ========================================================================== */

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/fairway';
import {
  CONFIDENCE_LABEL,
  ROOT_STYLE_LABEL,
  formatStrokes,
  type CauseBranch,
  type RootMapModel,
  type RootStyle,
} from '@/lib/coachhelm/root-map/build-root-map';

const NEG = 'var(--fw-viz-div-neg)';
const POS = 'var(--fw-viz-div-pos)';
const SURFACE = 'var(--fw-color-surface)';

const mix = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, ${SURFACE})`;

export function rootStyleCss(style: RootStyle): CSSProperties {
  switch (style) {
    case 'observed':
      return { background: NEG };
    case 'likely':
      return {
        backgroundColor: mix(NEG, 18),
        backgroundImage: `repeating-linear-gradient(135deg, ${NEG} 0 2px, transparent 2px 7px)`,
        border: `1px solid ${NEG}`,
      };
    case 'forming':
      return { background: 'transparent', border: `1.5px dashed ${NEG}` };
    default:
      return { background: 'var(--fw-color-surface-sunken)', border: '1px solid var(--fw-color-border-strong)' };
  }
}

function pct(v: number): string {
  return `${(Math.max(0, v) * 100).toFixed(4)}%`;
}

export function branchSpokenLabel(b: CauseBranch, areaLabel: string, showWhy: boolean): string {
  const parts = [`${areaLabel}: ${b.label}, ${formatStrokes(b.strokes)} strokes a round`];
  if (showWhy) {
    if (b.rootCause && b.style !== 'unexplained') parts.push(`root: ${b.rootCause}, ${ROOT_STYLE_LABEL[b.style].toLowerCase()}`);
    else parts.push(ROOT_STYLE_LABEL[b.style].toLowerCase());
  }
  if (b.tier) parts.push(CONFIDENCE_LABEL[b.tier]);
  if (b.isNew) parts.push('new since your last round');
  return parts.join('. ');
}

export interface RootMapProps {
  model: RootMapModel;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  /** Draw the WHY row (player map). The team map has no root-driver row. */
  showWhy?: boolean;
  /** Spoken summary for the diagram. */
  summary: string;
  lossEyebrow?: string;
  whatEyebrow?: string;
  /** Accessible name of the whole figure. */
  figureLabel?: string;
  className?: string;
}

export function RootMap({
  model,
  selectedId,
  onSelect,
  showWhy = true,
  summary,
  lossEyebrow = 'Losing · where',
  whatEyebrow = 'What',
  figureLabel = 'Root map',
  className,
}: RootMapProps) {
  const hasLosses = model.losses.length > 0;
  const hasCauses = model.losses.some((a) => a.causes.length > 0 || a.remainder);

  return (
    <figure className={cn('m-0 flex min-w-0 flex-col gap-2', className)} aria-label={figureLabel}>
      {model.gains.length > 0 ? (
        <div>
          <Eyebrow as="p" className="mb-1.5">
            Gaining on Tour
          </Eyebrow>
          <div className="relative h-10">
            {model.gains.map((g) => (
              <div
                key={g.area}
                className="absolute inset-y-0 px-px"
                style={{ left: pct(g.x), width: pct(g.w) }}
              >
                <div
                  className="flex h-full min-w-0 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-2 text-caption font-medium text-text-primary"
                  style={{ background: mix(POS, 55) }}
                  title={`${g.label} ${formatStrokes(g.sg, { signed: true })}`}
                >
                  <span className="truncate">{g.label}</span>
                  <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(g.sg, { signed: true })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-b-2 border-text-primary pb-1">
        <Eyebrow as="p" tone="secondary">
          Tour line
        </Eyebrow>
        {model.netSg !== null ? (
          <p className="text-caption text-text-secondary">
            net{' '}
            <span className="font-fw-mono font-medium tabular-nums text-text-primary">
              {formatStrokes(model.netSg, { signed: true })}
            </span>{' '}
            a round
          </p>
        ) : null}
      </div>

      {hasLosses ? (
        <div className="flex flex-col gap-1.5">
          <Eyebrow as="p">{lossEyebrow}</Eyebrow>
          <div className="relative h-10">
            {model.losses.map((a) => (
              <div key={a.area} className="absolute inset-y-0 px-px" style={{ left: pct(a.x), width: pct(a.w) }}>
                <div
                  className="flex h-full min-w-0 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-2 text-caption font-medium text-text-primary"
                  style={{ background: mix(NEG, 55) }}
                  title={`${a.label} ${formatStrokes(a.sg, { signed: true })}`}
                >
                  <span className="truncate">{a.label}</span>
                  <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(a.sg, { signed: true })}</span>
                </div>
              </div>
            ))}
          </div>

          {hasCauses ? (
            <>
              {/* Bands from each area down to its causes. Decorative geometry,
                  labelled once for screen readers; the branches below are the
                  interactive layer. */}
              <svg
                role="img"
                aria-label={summary}
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                className="block h-3 w-full"
              >
                {model.losses.flatMap((a) =>
                  a.causes.map((c) => (
                    <rect
                      key={c.id}
                      x={c.x * 100 + 0.15}
                      y={0}
                      width={Math.max(0, c.w * 100 - 0.3)}
                      height={10}
                      style={{ fill: NEG, fillOpacity: c.id === selectedId ? 0.45 : 0.18 }}
                    />
                  )),
                )}
              </svg>

              <div className="flex items-baseline justify-between">
                <Eyebrow as="p">{whatEyebrow}</Eyebrow>
                {showWhy ? <Eyebrow as="p">Why · root driver</Eyebrow> : null}
              </div>
              <div className={cn('relative', showWhy ? 'h-[5.5rem]' : 'h-11')}>
                {model.losses.map((a) =>
                  a.remainder ? (
                    <div
                      key={`${a.area}-rest`}
                      aria-hidden
                      className="absolute inset-y-0 flex flex-col gap-2 px-px"
                      style={{ left: pct(a.remainder.x), width: pct(a.remainder.w) }}
                    >
                      <div className="h-11 rounded-fw-sm border border-dashed border-border-strong" />
                      {showWhy ? <div className="h-8 rounded-fw-sm" style={rootStyleCss('unexplained')} /> : null}
                    </div>
                  ) : null,
                )}
                {model.losses.flatMap((a) =>
                  a.causes.map((c) => {
                    const selected = c.id === selectedId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={branchSpokenLabel(c, a.label, showWhy)}
                        onClick={onSelect ? () => onSelect(c.id) : undefined}
                        disabled={!onSelect}
                        className={cn(
                          'group absolute inset-y-0 flex flex-col gap-2 px-px text-left outline-none',
                          'focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-border-focus',
                          onSelect ? 'cursor-pointer' : 'cursor-default',
                        )}
                        style={{ left: pct(c.x), width: pct(c.w) }}
                      >
                        <span
                          className={cn(
                            'relative flex h-11 min-w-0 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-1.5 text-caption font-medium text-text-primary transition-shadow',
                            selected ? 'ring-2 ring-text-primary' : 'group-hover:ring-1 group-hover:ring-text-secondary',
                          )}
                          style={{ background: mix(NEG, 75) }}
                        >
                          <span className="truncate">{c.label}</span>
                          <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(c.strokes)}</span>
                        </span>
                        {showWhy ? (
                          <span
                            className={cn('relative block h-8 rounded-fw-sm', selected ? 'ring-2 ring-text-primary' : '')}
                            style={rootStyleCss(c.style)}
                          />
                        ) : null}
                        {c.isNew ? (
                          <span
                            aria-hidden
                            className="absolute -right-0.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent-500"
                          />
                        ) : null}
                      </button>
                    );
                  }),
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!hasCauses ? <figcaption className="sr-only">{summary}</figcaption> : null}
      <RootLegend showWhy={showWhy} />
    </figure>
  );
}

export function RootLegend({ showWhy = true }: { showWhy?: boolean }) {
  const items: RootStyle[] = showWhy ? ['observed', 'likely', 'forming', 'unexplained'] : ['observed', 'likely', 'forming'];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-caption text-text-secondary" aria-label="Legend">
      {items.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-4 rounded-sm" style={rootStyleCss(s)} />
          {ROOT_STYLE_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent-500" />
        New
      </li>
    </ul>
  );
}

/**
 * Every sized branch as a 44px chip, largest first. The thumb-sized way to
 * reach a branch that is drawn narrower than a finger.
 */
export function RootBranchList({
  model,
  selectedId,
  onSelect,
  label = 'Branches',
}: {
  model: RootMapModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
}) {
  const branches = model.losses
    .flatMap((a) => a.causes.map((c) => ({ c, area: a.label })))
    .sort((x, y) => y.c.strokes - x.c.strokes);
  if (branches.length === 0) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {branches.map(({ c, area }) => {
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(c.id)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-body-sm outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              selected
                ? 'border-text-primary bg-surface text-text-primary'
                : 'border-border-subtle bg-surface-sunken text-text-secondary hover:text-text-primary',
            )}
          >
            <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={rootStyleCss(c.style)} />
            <span className="max-w-[14rem] truncate">
              {c.label}
              <span className="sr-only"> ({area})</span>
            </span>
            <span className="font-fw-mono tabular-nums">{formatStrokes(c.strokes)}</span>
            {c.isNew ? <span aria-label="new" className="h-2 w-2 rounded-full bg-accent-500" /> : null}
          </button>
        );
      })}
    </div>
  );
}
