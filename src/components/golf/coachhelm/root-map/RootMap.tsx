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
  type AreaBranch,
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

/** A slot in the WHAT row: a cause, or an area's unexplained remainder. */
interface WhatSlot {
  key: string;
  area: AreaBranch;
  cause: CauseBranch | null;
  /** Width fraction (same strokes scale as the area row). */
  w: number;
  /** Left edge and width of this slot's slice inside its parent area bar. */
  srcX: number;
  srcW: number;
  /** Drawn left edge in the WHAT row, spread with gaps. */
  x: number;
}

const MAX_GAP = 0.03;

/**
 * Lays the WHAT row out left to right with gaps, so each branch flows out of
 * its slice of the area bar as a curved ribbon. Widths keep the area row's
 * strokes scale; only the gaps use the space the unsized areas leave free.
 */
export function layoutWhatRow(model: RootMapModel): WhatSlot[] {
  const slots: WhatSlot[] = [];
  for (const area of model.losses) {
    let cur = area.x;
    for (const c of area.causes) {
      slots.push({ key: c.id, area, cause: c, w: c.w, srcX: cur, srcW: c.w, x: 0 });
      cur += c.w;
    }
    if (area.remainder) {
      slots.push({ key: `${area.area}-rest`, area, cause: null, w: area.remainder.w, srcX: cur, srcW: area.remainder.w, x: 0 });
    }
  }
  const used = slots.reduce((sum, sl) => sum + sl.w, 0);
  if (slots.length < 2 || used <= 0) return slots;
  // Always leave a gap between branches so each ribbon visibly curves out of
  // its slice; when the row is full, shrink the drawn widths evenly to make
  // room (labels carry the exact strokes).
  const gap = MAX_GAP;
  const room = 1 - gap * (slots.length - 1);
  const k = used > room ? room / used : 1;
  let x = 0;
  for (const sl of slots) {
    sl.w *= k;
    sl.x = x;
    x += sl.w + gap;
  }
  return slots;
}

function ribbonPath(sx: number, sw: number, dx: number, dw: number): string {
  const [a, b, c, d] = [sx * 100, (sx + sw) * 100, dx * 100, (dx + dw) * 100];
  return `M${a},0 C${a},20 ${c},20 ${c},40 L${d},40 C${d},20 ${b},20 ${b},0 Z`;
}

export function branchSpokenLabel(b: CauseBranch, areaLabel: string, showWhy: boolean): string {
  const parts = [`${areaLabel}: ${b.label}, ${formatStrokes(b.strokes)} strokes a round`];
  if (showWhy) {
    if (b.contextPath) parts.push(`where it concentrates: ${b.contextPath}`);
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
  const slots = layoutWhatRow(model);

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
                  {g.w >= 0.2 ? <span className="truncate">{g.label}</span> : null}
                  {g.w >= 0.1 ? (
                    <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(g.sg, { signed: true })}</span>
                  ) : null}
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
            <span className="font-fw-mono tabular-nums text-text-primary">
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
                  {a.w >= 0.3 ? <span className="truncate">{a.label}</span> : null}
                  <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(a.sg, { signed: true })}</span>
                </div>
              </div>
            ))}
          </div>

          {hasCauses ? (
            <>
              {/* Ribbons from each area slice down to its branch. Decorative
                  geometry, labelled once for screen readers; the branches
                  below are the interactive layer. */}
              <svg
                role="img"
                aria-label={summary}
                viewBox="0 0 100 40"
                preserveAspectRatio="none"
                className="block h-12 w-full"
              >
                {slots.map((sl) => (
                  <path
                    key={sl.key}
                    d={ribbonPath(sl.srcX, sl.srcW, sl.x, sl.w)}
                    style={
                      sl.cause
                        ? { fill: NEG, fillOpacity: sl.cause.id === selectedId ? 0.42 : 0.16 }
                        : { fill: 'var(--fw-color-border-strong)', fillOpacity: 0.12 }
                    }
                  />
                ))}
              </svg>

              <div className="flex items-baseline justify-between">
                <Eyebrow as="p">{whatEyebrow}</Eyebrow>
                {showWhy ? <Eyebrow as="p">Why · root driver</Eyebrow> : null}
              </div>
              <div className={cn('relative', showWhy ? 'h-[5.5rem]' : 'h-11')}>
                {slots.map((sl) => {
                  const c = sl.cause;
                  if (!c) {
                    return (
                      <div
                        key={sl.key}
                        aria-hidden
                        className="absolute inset-y-0 flex flex-col gap-2 px-px"
                        style={{ left: pct(sl.x), width: pct(sl.w) }}
                      >
                        <div className="h-11 rounded-fw-sm border border-dashed border-border-strong" />
                        {showWhy ? <div className="h-8 rounded-fw-sm" style={rootStyleCss('unexplained')} /> : null}
                      </div>
                    );
                  }
                  const selected = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={branchSpokenLabel(c, sl.area.label, showWhy)}
                      onClick={onSelect ? () => onSelect(c.id) : undefined}
                      disabled={!onSelect}
                      className={cn(
                        'group absolute inset-y-0 flex flex-col gap-2 px-px text-left outline-none',
                        'focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-border-focus',
                        onSelect ? 'cursor-pointer' : 'cursor-default',
                      )}
                      style={{ left: pct(sl.x), width: pct(sl.w) }}
                    >
                      <span
                        className={cn(
                          'relative flex h-11 min-w-0 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-1.5 text-caption font-medium text-text-primary transition-shadow',
                          selected ? 'ring-2 ring-text-primary' : 'group-hover:ring-1 group-hover:ring-text-secondary',
                        )}
                        style={{ background: mix(NEG, 75) }}
                      >
                        {sl.w >= 0.24 ? <span className="truncate">{c.label}</span> : null}
                        {sl.w >= 0.1 ? (
                          <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(c.strokes)}</span>
                        ) : null}
                      </span>
                      {showWhy ? (
                        <span
                          className={cn(
                            'relative flex h-8 min-w-0 items-center overflow-hidden rounded-fw-sm px-1',
                            selected ? 'ring-2 ring-text-primary' : '',
                          )}
                          style={rootStyleCss(c.style)}
                        >
                          {c.contextPath && sl.w >= 0.2 ? (
                            <span className="truncate rounded-sm bg-surface px-1 text-caption text-text-primary">
                              {c.contextPath}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {c.isNew ? (
                        <span
                          aria-hidden
                          className="absolute -right-0.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent-500"
                        />
                      ) : null}
                    </button>
                  );
                })}
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
