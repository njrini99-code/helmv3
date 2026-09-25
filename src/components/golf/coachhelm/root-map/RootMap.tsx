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
 * Two layouts of the same What row, switched by CSS only (no hydration
 * difference):
 * - Phones (< md): the LEAK LADDER. One full-width row per losing area,
 *   largest loss first: the area and its total, then one stacked bar split
 *   into its spots in proportion (the top {@link LADDER_MAX_SEGMENTS}, the
 *   rest behind a "+N more" segment that expands). Each segment is a 44px
 *   button that opens the spot's Why; its fill says what supports it
 *   (solid = seen in shots, hatched = likely, dashed = forming, plain tint =
 *   no stored read yet).
 * - md and up: the Where → What → Why ribbon map. A node too narrow for its
 *   label names itself in a hover / focus tooltip.
 *
 * Accessibility: the Where row is the one `role="img"` with the spoken
 * summary; every branch is a real `<button>` with `aria-pressed` and a full
 * spoken label. The hidden layout is `display: none`, so assistive tech
 * reads one of the two.
 *
 * Colors are tokens only: `--fw-viz-div-neg` (strokes lost) and
 * `--fw-viz-div-pos` (strokes gained) mixed into the surface.
 * ========================================================================== */

import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/fairway';
import { DURATION, EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import {
  CONFIDENCE_LABEL,
  ROOT_STYLE_LABEL,
  formatStrokes,
  rootStyleLabel,
  type AreaBranch,
  type CauseBranch,
  type RootAudience,
  type RootMapModel,
  type RootStyle,
  type UnsizedCause,
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

/** "3 players" / "1 player". */
export function playersText(n: number): string {
  return `${n} ${n === 1 ? 'player' : 'players'}`;
}

export function branchSpokenLabel(
  b: CauseBranch,
  areaLabel: string,
  showWhy: boolean,
  audience: RootAudience = 'player',
): string {
  const parts = [`${areaLabel}: ${b.label}, ${formatStrokes(b.strokes)} strokes a round`];
  if (b.measured) parts.push(b.sizingNote ?? 'measured from recorded shots');
  if (b.players !== undefined) parts.push(playersText(b.players));
  if (showWhy) {
    if (b.contextPath) parts.push(`where it concentrates: ${b.contextPath}`);
    if (b.rootCause && b.style !== 'unexplained') parts.push(`root: ${b.rootCause}, ${rootStyleLabel(b.style, audience).toLowerCase()}`);
    else if (b.measured && !b.whyId) parts.push('no stored read on this spot yet');
    else parts.push(rootStyleLabel(b.style, audience).toLowerCase());
  }
  if (b.tier) parts.push(CONFIDENCE_LABEL[b.tier]);
  if (b.isNew) parts.push(audience === 'coach' ? 'new since the last round' : 'new since your last round');
  return parts.join('. ');
}

function unsizedSpokenLabel(u: UnsizedCause, areaLabel: string, audience: RootAudience): string {
  const parts = [`${areaLabel}: ${u.label}, no stroke value stored`];
  if (u.players !== undefined) parts.push(playersText(u.players));
  parts.push(rootStyleLabel(u.style, audience).toLowerCase());
  if (u.tier) parts.push(CONFIDENCE_LABEL[u.tier]);
  return parts.join('. ');
}

/** Where-row slices narrower than this carry their label outside the bar. */
const WHERE_LABEL_MIN_W = 0.3;
/** Sized What-row nodes narrower than this carry their label in a tooltip. */
const WHAT_LABEL_MIN_W = 0.24;
/** Remainder slots at least this wide carry a label and the unsized nodes. */
const REMAINDER_LABEL_MIN_W = 0.16;

/* ─────────────────────────────────────────────────────────────────────────
 * Evidence fill (shared by the ladder, the desktop nodes and the legend)
 * ──────────────────────────────────────────────────────────────────────── */

/** How a spot is filled: by the support of its stored read, or a plain tint
 *  when no stored read explains it yet. */
export type EvidenceFill = 'observed' | 'likely' | 'forming' | 'tint';

export function evidenceFillOf(style: RootStyle): EvidenceFill {
  return style === 'unexplained' ? 'tint' : style;
}

const TINT = mix(NEG, 45);

export function evidenceFillCss(fill: EvidenceFill): CSSProperties {
  return fill === 'tint' ? { background: TINT } : rootStyleCss(fill);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Leak ladder (phones): one row per losing area, one stacked bar per row
 * ──────────────────────────────────────────────────────────────────────── */

/** Most spots a ladder row draws as their own segment before "+N more". */
export const LADDER_MAX_SEGMENTS = 3;
/** A spot under this share of its row folds into "+N more" (unless it is
 *  the only one left). */
const LADDER_MIN_SHARE = 0.12;
/** Spots at least this share of the row carry their name in the segment. */
const LADDER_NAME_MIN_SHARE = 0.2;
/** The unmeasured rest is drawn as its own segment from this share up. */
const LADDER_REST_MIN_SHARE = 0.06;

export interface LadderRow {
  area: AreaBranch;
  /** Spots drawn as their own segment, largest first. */
  segments: CauseBranch[];
  /** Spots folded into the "+N more" segment, largest first. */
  more: CauseBranch[];
  /** The rest of the area no spot accounts for, when it is drawn. */
  rest: { strokes: number; label: string } | null;
  /** Σ of what the row draws (the proportion base). */
  total: number;
}

export function remainderLabel(area: AreaBranch): string {
  return area.measured ? 'Not tracked by shot' : 'Not yet explained';
}

/** The phone ladder, largest loss first. Pure (tested directly). */
export function buildLadder(model: RootMapModel): LadderRow[] {
  return [...model.losses]
    .sort((a, b) => b.loss - a.loss)
    .map((area) => {
      const causes = [...area.causes].sort((a, b) => b.strokes - a.strokes);
      const restStrokes = area.remainder?.strokes ?? 0;
      const total = causes.reduce((t, c) => t + c.strokes, 0) + restStrokes;
      const base = total > 0 ? total : 1;
      const segments: CauseBranch[] = [];
      const more: CauseBranch[] = [];
      causes.forEach((c, i) => {
        const lastOne = i === causes.length - 1 && more.length === 0;
        if (segments.length < LADDER_MAX_SEGMENTS && (c.strokes / base >= LADDER_MIN_SHARE || lastOne)) segments.push(c);
        else more.push(c);
      });
      // Folding a single spot saves nothing: draw it as itself.
      if (more.length === 1) segments.push(more.pop()!);
      const rest =
        restStrokes > 0 && (causes.length === 0 || restStrokes / base >= LADDER_REST_MIN_SHARE)
          ? { strokes: restStrokes, label: remainderLabel(area) }
          : null;
      return { area, segments, more, rest, total };
    });
}

/** Grid columns in proportion to `parts`, each at least a 44px target.
 *  Normalised: flex factors summing below 1 would leave the row part-empty. */
function cols(parts: number[]): string {
  const total = parts.reduce((t, p) => t + Math.max(p, 0), 0) || 1;
  return parts.map((p) => `minmax(2.75rem, ${((Math.max(p, 0) / total) * 100 + 0.01).toFixed(3)}fr)`).join(' ');
}

function NewDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent-500', className)} />;
}

const SEGMENT_BUTTON = cn(
  'group flex min-h-11 min-w-0 flex-col gap-1 rounded-fw-sm pb-0.5 text-left outline-none',
  'focus-visible:ring-2 focus-visible:ring-border-focus',
);
const SEGMENT_BAR = cn(
  'relative block h-4 rounded-sm motion-safe:transition-shadow motion-safe:duration-150',
  'group-hover:ring-1 group-hover:ring-text-secondary group-aria-pressed:ring-2 group-aria-pressed:ring-text-primary',
);

function LadderSegment({
  cause,
  area,
  share,
  selected,
  onSelect,
  showWhy,
  audience,
}: {
  cause: CauseBranch;
  area: AreaBranch;
  share: number;
  selected: boolean;
  onSelect?: (id: string) => void;
  showWhy: boolean;
  audience: RootAudience;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={branchSpokenLabel(cause, area.label, showWhy, audience)}
      title={`${cause.label} ${formatStrokes(cause.strokes)}`}
      onClick={onSelect ? () => onSelect(cause.id) : undefined}
      disabled={!onSelect}
      data-slot="ladder-segment"
      data-fill={evidenceFillOf(cause.style)}
      className={SEGMENT_BUTTON}
    >
      <span className={SEGMENT_BAR} style={evidenceFillCss(evidenceFillOf(cause.style))}>
        {cause.isNew ? <NewDot className="absolute -right-0.5 -top-1" /> : null}
      </span>
      <span className="flex min-w-0 flex-col text-caption leading-tight">
        {share >= LADDER_NAME_MIN_SHARE ? (
          <span className="line-clamp-2 break-words text-text-secondary group-aria-pressed:font-medium group-aria-pressed:text-text-primary">
            {cause.label}
          </span>
        ) : null}
        <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(cause.strokes)}</span>
      </span>
    </button>
  );
}

function UnsizedButtons({
  list,
  area,
  selectedId,
  onSelect,
  audience,
}: {
  list: UnsizedCause[];
  area: string;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  audience: RootAudience;
}) {
  if (list.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" data-slot="unsized-list">
      {list.map((u) => (
        <li key={u.id}>
          <button
            type="button"
            aria-pressed={u.id === selectedId}
            aria-label={unsizedSpokenLabel(u, area, audience)}
            onClick={onSelect ? () => onSelect(u.id) : undefined}
            disabled={!onSelect}
            data-slot="unsized-cause"
            className={cn(
              'inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-dashed px-3 text-caption outline-none',
              'focus-visible:ring-2 focus-visible:ring-border-focus motion-safe:transition-colors',
              u.id === selectedId ? 'border-text-primary text-text-primary' : 'border-border-strong text-text-secondary hover:text-text-primary',
            )}
          >
            <span className="min-w-0 truncate">{u.label}</span>
            <span className="shrink-0 text-text-tertiary">
              {u.players !== undefined ? `${playersText(u.players)} · ` : ''}not sized
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LadderRowView({
  row,
  selectedId,
  onSelect,
  showWhy,
  audience,
  unsized,
}: {
  row: LadderRow;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  showWhy: boolean;
  audience: RootAudience;
  unsized: UnsizedCause[];
}) {
  const reduce = useReducedMotionGuard();
  const moreSelected = row.more.some((c) => c.id === selectedId);
  const [open, setOpen] = useState(false);
  const expanded = open || moreSelected;
  const moreStrokes = row.more.reduce((t, c) => t + c.strokes, 0);
  const base = row.total > 0 ? row.total : 1;
  const parts = [
    ...row.segments.map((c) => c.strokes),
    ...(row.more.length > 0 ? [moreStrokes] : []),
    ...(row.rest ? [row.rest.strokes] : []),
  ];
  const { area } = row;
  return (
    <li className="flex flex-col gap-1.5" data-slot="ladder-row" data-area={area.area}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-text-primary">{area.label}</span>
        <span className="font-fw-mono text-body-sm tabular-nums text-text-primary">{formatStrokes(area.sg, { signed: true })}</span>
      </div>
      <div role="group" aria-label={`${area.label}: where the strokes go`} className="grid gap-0.5" style={{ gridTemplateColumns: cols(parts) }}>
        {row.segments.map((c) => (
          <LadderSegment
            key={c.id}
            cause={c}
            area={area}
            share={c.strokes / base}
            selected={c.id === selectedId}
            onSelect={onSelect}
            showWhy={showWhy}
            audience={audience}
          />
        ))}
        {row.more.length > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${area.label}: ${row.more.length} more spots, ${formatStrokes(moreStrokes)} strokes a round together`}
            onClick={() => setOpen((v) => !v)}
            data-slot="ladder-more"
            className={cn(SEGMENT_BUTTON)}
          >
            <span
              className={cn(SEGMENT_BAR, 'group-aria-expanded:ring-1 group-aria-expanded:ring-text-secondary')}
              style={{ background: mix('var(--fw-color-border-strong)', 70) }}
            />
            <span className="flex min-w-0 flex-col text-caption leading-tight">
              <span className="truncate text-text-secondary">{moreStrokes / base >= LADDER_NAME_MIN_SHARE ? `+${row.more.length} more` : `+${row.more.length}`}</span>
              <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(moreStrokes)}</span>
            </span>
          </button>
        ) : null}
        {row.rest ? (
          <div className="flex min-w-0 flex-col gap-1" data-slot="ladder-rest" title={`${row.rest.label} ${formatStrokes(row.rest.strokes)} a round`}>
            <span aria-hidden className="block h-4 rounded-sm" style={rootStyleCss('unexplained')} />
            <span className="flex min-w-0 flex-col text-caption leading-tight text-text-tertiary">
              {row.rest.strokes / base >= LADDER_NAME_MIN_SHARE || row.segments.length === 0 ? (
                <span className="truncate">{row.rest.label}</span>
              ) : (
                <span className="sr-only">{row.rest.label}</span>
              )}
              <span className="font-fw-mono tabular-nums">{formatStrokes(row.rest.strokes)}</span>
            </span>
          </div>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {expanded && row.more.length > 0 ? (
          <motion.ul
            key="more"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : DURATION.short, ease: EASE_CINEMATIC }}
            className="flex flex-col overflow-hidden"
            data-slot="ladder-more-list"
          >
            {row.more.map((c) => {
              const selected = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={branchSpokenLabel(c, area.label, showWhy, audience)}
                    onClick={onSelect ? () => onSelect(c.id) : undefined}
                    disabled={!onSelect}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 rounded-fw-sm px-1 text-left text-body-sm outline-none',
                      'focus-visible:ring-2 focus-visible:ring-border-focus',
                      selected ? 'font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary',
                    )}
                  >
                    <span aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-sm" style={evidenceFillCss(evidenceFillOf(c.style))} />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.isNew ? <NewDot /> : null}
                    <span className="shrink-0 font-fw-mono tabular-nums text-text-primary">{formatStrokes(c.strokes)}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      <UnsizedButtons list={unsized} area={area.label} selectedId={selectedId} onSelect={onSelect} audience={audience} />
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reconcile line
 * ──────────────────────────────────────────────────────────────────────── */

export interface MeasuredSummary {
  /** The one quiet line. */
  line: string;
  /** Per-area notes, behind a disclosure. */
  details: string[];
  /** Share / fallback areas: always shown inline. */
  exceptions: string[];
}

/** One line for how the What row was read, or null when no area is split
 *  by shot. Team rows (rounds 0) keep their players wording. */
export function measuredSummary(model: RootMapModel): MeasuredSummary | null {
  const measured = model.losses.filter((a) => a.measured);
  if (measured.length === 0) return null;
  const exceptions: string[] = [];
  for (const a of model.losses) {
    if (a.measured?.mode === 'share') exceptions.push(a.measured.note);
    else if (!a.measured) exceptions.push(`${a.label}: not split by shot; its What row comes from the stored reads.`);
  }
  const details = measured.filter((a) => a.measured!.mode === 'measured').map((a) => a.measured!.note);
  const allMatch = measured.every((a) => a.measured!.mode === 'measured');
  const team = measured.every((a) => a.measured!.rounds === 0);
  const rounds = Math.max(...measured.map((a) => a.measured!.rounds));
  const source = team ? 'Measured from the players’ recorded shots' : `Measured from ${rounds} ${rounds === 1 ? 'round' : 'rounds'} of shots`;
  const matched = measured.length - measured.filter((a) => a.measured!.mode === 'share').length;
  const verdict = team
    ? 'each area is summed player by player.'
    : allMatch && exceptions.length === 0
      ? 'every area matches its strokes-gained total.'
      : `${matched} of ${model.losses.length} losing ${model.losses.length === 1 ? 'area matches' : 'areas match'} ${model.losses.length === 1 ? 'its' : 'their'} strokes-gained total.`;
  return { line: `${source}; ${verdict}`, details, exceptions };
}

function MeasuredNote({ summary }: { summary: MeasuredSummary }) {
  return (
    <div className="flex flex-col gap-1 text-caption text-text-tertiary" data-slot="measured-summary">
      <p>{summary.line}</p>
      {summary.exceptions.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-text-secondary" data-slot="measured-exceptions">
          {summary.exceptions.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {summary.details.length > 0 ? (
        <details className="group" data-slot="measured-details">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden className="h-3.5 w-3.5 motion-safe:transition-transform group-open:rotate-180" />
            Per-area check
          </summary>
          <ul className="flex flex-col gap-0.5 pb-1">
            {summary.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * The map
 * ──────────────────────────────────────────────────────────────────────── */

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
  /** Voice for style labels ("Seen in shots" for a coach). */
  audience?: RootAudience;
  /** Desktop: draw the model's unsized causes as outlined nodes inside their
   *  area's unexplained remainder (team map). Otherwise they are listed
   *  under the What row. The phone ladder lists them under their area. */
  unsizedInRow?: boolean;
  /** List unsized causes on the map (default). The player Today view lists
   *  them in its own section, with their notes, and passes false. */
  listUnsized?: boolean;
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
  audience = 'player',
  unsizedInRow = false,
  listUnsized = true,
  className,
}: RootMapProps) {
  const hasLosses = model.losses.length > 0;
  const hasCauses = model.losses.some((a) => a.causes.length > 0 || a.remainder);
  const slots = layoutWhatRow(model);
  const narrowAreas = model.losses.filter((a) => a.w < WHERE_LABEL_MIN_W);
  const narrowGains = model.gains.filter((g) => g.w < WHERE_LABEL_MIN_W);
  const ladder = buildLadder(model);
  const measured = measuredSummary(model);
  // Unsized causes drawn inside a remainder slot wide enough to hold them.
  const unsizedBySlot = new Map<string, UnsizedCause[]>();
  if (unsizedInRow) {
    for (const sl of slots) {
      if (sl.cause || sl.w < REMAINDER_LABEL_MIN_W) continue;
      const list = model.unsized.filter((u) => u.area === sl.area.area);
      if (list.length > 0) unsizedBySlot.set(sl.key, list);
    }
  }
  const inRowIds = new Set([...unsizedBySlot.values()].flat().map((u) => u.id));
  const unsizedBelow = listUnsized ? model.unsized.filter((u) => !inRowIds.has(u.id)) : [];
  const whyStrip = showWhy && slots.some((sl) => sl.cause && sl.cause.style !== 'unexplained');
  const stack = Math.max(0, ...[...unsizedBySlot.values()].map((l) => l.length));
  // 44px node + 8px gap per stacked unsized node, under the 44px header row.
  const whatHeight = (whyStrip ? 84 : 44) + stack * 52;

  const fills = new Set<EvidenceFill>();
  for (const a of model.losses) for (const c of a.causes) fills.add(evidenceFillOf(c.style));
  const tintMeasured = model.losses.some((a) => a.measured && a.causes.some((c) => c.style === 'unexplained'));
  const hasNew = model.losses.some((a) => a.causes.some((c) => c.isNew));

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
                  className="flex h-full min-w-1 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-2 text-caption font-medium text-text-primary"
                  style={{ background: mix(POS, 55) }}
                  title={`${g.label} ${formatStrokes(g.sg, { signed: true })}`}
                >
                  {g.w >= WHERE_LABEL_MIN_W ? (
                    <>
                      <span className="truncate">{g.label}</span>
                      <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(g.sg, { signed: true })}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {narrowGains.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-x-3 text-caption text-text-secondary" data-slot="gain-callouts">
              {narrowGains.map((g) => (
                <li key={g.area} className="flex items-center gap-1">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: mix(POS, 55) }} />
                  <span className="font-medium text-text-primary">{g.label}</span>
                  <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(g.sg, { signed: true })}</span>
                </li>
              ))}
            </ul>
          ) : null}
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
          {/* The Where row is the diagram's one image for screen readers;
              the branches below are the interactive layer. */}
          <div role="img" aria-label={summary} className="relative h-10">
            {model.losses.map((a) => (
              <div key={a.area} className="absolute inset-y-0 px-px" style={{ left: pct(a.x), width: pct(a.w) }}>
                <div
                  className="flex h-full min-w-1 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-2 text-caption font-medium text-text-primary"
                  style={{ background: mix(NEG, 55) }}
                  title={`${a.label} ${formatStrokes(a.sg, { signed: true })}`}
                >
                  {a.w >= WHERE_LABEL_MIN_W ? (
                    <>
                      <span className="truncate">{a.label}</span>
                      <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(a.sg, { signed: true })}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {narrowAreas.length > 0 ? (
            // A slice too narrow for its own label keeps its true width; the
            // label and value sit just under it, so a small area never reads
            // as a cut-off sliver.
            <ul aria-hidden className="-mt-0.5 flex flex-wrap justify-end gap-x-3 text-caption text-text-secondary" data-slot="where-callouts">
              {narrowAreas.map((a) => (
                <li key={a.area} className="flex items-center gap-1">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: mix(NEG, 55) }} />
                  <span className="font-medium text-text-primary">{a.label}</span>
                  <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(a.sg, { signed: true })}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {hasCauses ? (
            <>
              {/* Phones: the leak ladder. */}
              <div className="flex flex-col gap-2 pt-2 md:hidden" data-slot="leak-ladder">
                <Eyebrow as="p">{whatEyebrow}</Eyebrow>
                <ol className="flex flex-col gap-4">
                  {ladder.map((row) => (
                    <LadderRowView
                      key={row.area.area}
                      row={row}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      showWhy={showWhy}
                      audience={audience}
                      unsized={listUnsized ? model.unsized.filter((u) => u.area === row.area.area) : []}
                    />
                  ))}
                </ol>
              </div>

              {/* md and up: the Where → What → Why ribbon map. */}
              <div className="hidden flex-col gap-1.5 md:flex" data-slot="ribbon-map">
                <svg aria-hidden viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-12 w-full">
                  {slots.map((sl) => (
                    <path
                      key={sl.key}
                      d={ribbonPath(sl.srcX, sl.srcW, sl.x, sl.w)}
                      className="motion-safe:transition-[fill-opacity] motion-safe:duration-200"
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
                  {whyStrip ? <Eyebrow as="p">Why · root driver</Eyebrow> : null}
                </div>
                <div className="relative" style={{ height: whatHeight }}>
                  {slots.map((sl) => {
                    const c = sl.cause;
                    if (!c) {
                      const rest = sl.area.remainder;
                      const inside = unsizedBySlot.get(sl.key) ?? [];
                      const restLabel = sl.area.measured ? 'Not tracked by shot' : 'Unexplained';
                      return (
                        <div
                          key={sl.key}
                          className="absolute inset-y-0 flex flex-col gap-2 px-px"
                          style={{ left: pct(sl.x), width: pct(sl.w) }}
                          data-slot="what-remainder"
                        >
                          <div
                            className="flex h-11 min-w-0 items-center justify-between gap-1 overflow-hidden rounded-fw-sm border border-dashed border-border-strong px-1.5 text-caption text-text-secondary"
                            title={rest ? `${restLabel} ${formatStrokes(rest.strokes)} a round` : undefined}
                            data-kind={sl.area.measured ? 'not-tracked' : 'unexplained'}
                          >
                            {rest && sl.w >= REMAINDER_LABEL_MIN_W ? (
                              <>
                                <span className="truncate">{restLabel}</span>
                                <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(rest.strokes)}</span>
                              </>
                            ) : (
                              <span className="sr-only">
                                {rest ? `${restLabel} ${formatStrokes(rest.strokes)} a round` : restLabel}
                              </span>
                            )}
                          </div>
                          {inside.map((u) => {
                            const selected = u.id === selectedId;
                            return (
                              <button
                                key={u.id}
                                type="button"
                                aria-pressed={selected}
                                aria-label={unsizedSpokenLabel(u, sl.area.label, audience)}
                                onClick={onSelect ? () => onSelect(u.id) : undefined}
                                disabled={!onSelect}
                                data-slot="what-unsized"
                                className={cn(
                                  'flex h-11 min-w-0 flex-col justify-center rounded-fw-sm border border-dashed border-text-secondary bg-surface px-1.5 text-left outline-none',
                                  'focus-visible:ring-2 focus-visible:ring-border-focus',
                                  selected ? 'ring-2 ring-text-primary' : 'hover:border-text-primary',
                                )}
                              >
                                <span className="truncate text-caption font-medium text-text-primary">{u.label}</span>
                                {u.players !== undefined ? (
                                  <span className="truncate text-caption text-text-tertiary">{playersText(u.players)} · not sized</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      );
                    }
                    const selected = c.id === selectedId;
                    const fill = evidenceFillOf(c.style);
                    const labelled = sl.w >= WHAT_LABEL_MIN_W;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={branchSpokenLabel(c, sl.area.label, showWhy, audience)}
                        onClick={onSelect ? () => onSelect(c.id) : undefined}
                        disabled={!onSelect}
                        data-fill={fill}
                        className={cn(
                          'group absolute inset-y-0 flex flex-col gap-2 px-px text-left outline-none',
                          'focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-border-focus',
                          onSelect ? 'cursor-pointer' : 'cursor-default',
                        )}
                        style={{ left: pct(sl.x), width: pct(sl.w) }}
                      >
                        <span
                          className={cn(
                            'relative flex h-11 min-w-0 items-center justify-between gap-1 overflow-hidden rounded-fw-sm px-1.5 text-caption font-medium text-text-primary motion-safe:transition-shadow',
                            selected ? 'ring-2 ring-text-primary' : 'group-hover:ring-1 group-hover:ring-text-secondary',
                          )}
                          style={{ background: showWhy ? TINT : mix(NEG, 55) }}
                        >
                          {labelled ? (
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span className="truncate">{c.label}</span>
                              {c.players !== undefined ? (
                                <span className="truncate font-normal text-text-secondary">{playersText(c.players)}</span>
                              ) : null}
                            </span>
                          ) : null}
                          {sl.w >= 0.1 ? (
                            <span className="shrink-0 font-fw-mono tabular-nums">{formatStrokes(c.strokes)}</span>
                          ) : null}
                          {!showWhy ? (
                            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1.5" style={evidenceFillCss(fill)} />
                          ) : null}
                        </span>
                        {whyStrip && fill !== 'tint' ? (
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
                        {c.isNew ? <NewDot className="absolute -right-0.5 -top-1" /> : null}
                        {!labelled ? (
                          // Too narrow for its own label: name and value on
                          // hover or keyboard focus.
                          <span
                            aria-hidden
                            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-fw-sm bg-text-primary px-2 py-1 text-caption text-canvas opacity-0 shadow-sm group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:transition-opacity"
                            data-slot="what-tooltip"
                          >
                            {c.label} <span className="font-fw-mono tabular-nums">{formatStrokes(c.strokes)}</span>
                            {c.players !== undefined ? ` · ${playersText(c.players)}` : ''}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {unsizedBelow.length > 0 ? (
                  <UnsizedButtons list={unsizedBelow} area="" selectedId={selectedId} onSelect={onSelect} audience={audience} />
                ) : null}
              </div>
              {measured ? <MeasuredNote summary={measured} /> : null}
            </>
          ) : null}
        </div>
      ) : null}

      <RootLegend
        fills={[...fills]}
        audience={audience}
        tintLabel={tintMeasured ? 'Measured, no stored read yet' : undefined}
        unsized={listUnsized && model.unsized.length > 0}
        showNew={hasNew}
      />
    </figure>
  );
}

const FILL_ORDER: EvidenceFill[] = ['observed', 'likely', 'forming', 'tint'];

/** The legend, once per map, listing only the states the map draws. */
export function RootLegend({
  fills,
  audience = 'player',
  tintLabel,
  unsized = false,
  showNew = false,
}: {
  fills: EvidenceFill[];
  audience?: RootAudience;
  /** Label for the plain tint (defaults to "Not yet explained"). */
  tintLabel?: string;
  /** Add the outlined "not sized" entry. */
  unsized?: boolean;
  showNew?: boolean;
}) {
  const present = FILL_ORDER.filter((f) => fills.includes(f));
  if (present.length === 0 && !unsized && !showNew) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-caption text-text-secondary" aria-label="Legend">
      {present.map((f) => (
        <li key={f} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-4 rounded-sm" style={evidenceFillCss(f)} />
          {f === 'tint' ? tintLabel ?? ROOT_STYLE_LABEL.unexplained : rootStyleLabel(f, audience)}
        </li>
      ))}
      {unsized ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-4 rounded-sm border border-dashed border-text-secondary" />
          Not sized
        </li>
      ) : null}
      {showNew ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent-500" />
          New
        </li>
      ) : null}
    </ul>
  );
}
