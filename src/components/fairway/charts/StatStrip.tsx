/**
 * ============================================================================
 * StatStrip — the ONE phone-shape rule for KPI / stat strips (Mobile Doctrine
 * rules 2, 3, 11 — see docs/MOBILE_DOCTRINE.md)
 * ----------------------------------------------------------------------------
 * A headless layout primitive. It owns nothing visual — no card, no glass, no
 * background — it only decides the CONTAINER shape a set of peer KPI cells
 * (a baseball `RuledStatLine`, a Fairway `StatTile`, an admin `KpiTile`) sit
 * in, so every KPI strip in the app resolves its phone shape the SAME way:
 *
 *   count 1        → single full-width figure.
 *   count 2        → 2-col grid, one row.
 *   count 3        → 2-col grid; the 3rd cell spans both columns (a
 *                    deliberate "2 + 1-wide" rhythm, not a ragged trailing
 *                    cell — doctrine rule 11).
 *   count 4        → 2×2 grid — everything visible in ≤2 rows (rule 3).
 *   count ≥ 5      → a single horizontal snap-rail. The FIRST child is the
 *                    one that should carry a `leader`/`emphasis` treatment —
 *                    callers pin it to index 0 before rendering.
 *
 * At `sm` (≥640px) and up, nothing here changes shape: the desktop
 * `sm:grid-cols-2 lg:grid-cols-N` composition is the byte-for-byte original
 * KPIContentsStrip recipe, just centralized so every consumer (baseball,
 * golf admin, Bridge) shares it instead of hand-rolling their own grid string.
 *
 * RSC-SAFE: no hooks, no `'use client'`. Renders fine inside a baseball
 * server component (KPIContentsStrip's original constraint) and inside an
 * admin RSC page. The only client-side behavior anywhere near this component
 * is the scroll-snap itself, which is native browser behavior, not React.
 *
 * NOT `React.memo` — `children` are always a fresh element from the caller's
 * map(); memoizing this component would just lie about referential stability.
 *
 * Zero framer-motion. Grid↔rail is Tailwind responsive classes; scroll-snap
 * is CSS `scroll-snap-type`. Per-cell mount motion (the green rule draw, the
 * numeral settle) stays owned by the atom (`RuledStatLine`), unchanged.
 * ========================================================================== */
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Desktop target column count (also the default rail-mode `lg` column count). */
type StatStripColumns = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Count at/above which phone uses the snap-rail instead of a 2-col grid —
 * `railThreshold`'s default below. Exported so callers that need to know the
 * threshold ahead of render (e.g. KPIContentsStrip's pin-first partition,
 * which must match StatStrip's own rail/grid decision) import this instead
 * of re-declaring the literal.
 */
export const STAT_STRIP_RAIL_THRESHOLD = 5;

export interface StatStripProps {
  /** The KPI cells — a `RuledStatLine` map, `StatTile`s, or `KpiTile` Links. */
  children: React.ReactNode;
  /** Authoritative peer count. Callers already know this (`items.length`). */
  count: number;
  /**
   * Desktop target columns above `sm`. Default = min(count, 6). Applied at
   * the `lg` breakpoint (`lg:grid-cols-{columns}`) — UNLESS `xlColumns` is
   * supplied, in which case the `lg` tier is suppressed entirely (see
   * `xlColumns`) so the `md`/`sm` value carries through the `lg` range
   * unchanged.
   */
  columns?: 2 | 3 | 4 | 5 | 6;
  /**
   * Optional `md` (≥768px) column override, for callers whose pre-existing
   * recipe had a `md:` tier distinct from `sm`/`lg` (e.g. admin's original
   * `md:grid-cols-3 xl:grid-cols-6`). Emitted in addition to the `sm`/`lg`/
   * `xl` tiers — never emitted unless supplied, so every other caller's
   * desktop composition is untouched.
   */
  mdColumns?: 2 | 3 | 4 | 5 | 6;
  /**
   * Optional `xl` (≥1280px) column override, for callers whose pre-existing
   * recipe promoted its final column count at `xl` rather than `lg` (e.g.
   * admin's `xl:grid-cols-6`). When supplied, the default `lg:grid-cols-
   * {columns}` tier is SUPPRESSED (only the `sm` base survives below `xl`,
   * so `mdColumns` — if also given — carries through the `lg` range) and
   * `xl:grid-cols-{xlColumns}` is emitted instead. Assumes `columns` (or the
   * count-derived default) resolves to ≥2 — pairing `xlColumns` with a
   * single-column resolution is a contradiction the caller shouldn't make.
   */
  xlColumns?: 2 | 3 | 4 | 5 | 6;
  /** Count at/above which phone uses the snap-rail instead of a 2-col grid. */
  railThreshold?: number;
  /**
   * Opt-in full-bleed for the rail, e.g. `"-mx-4 px-4"`. Default is contained
   * within the caller's own gutter — never hardcode a bleed some surface
   * doesn't use.
   */
  edgeBleedClassName?: string;
  /** aria-label for the rail's scroll region (unused in grid mode). */
  ariaLabel?: string;
  className?: string;
}

// ── Static, JIT-safe class maps — Tailwind must see complete literals. ──────

// Rail (phone) shell: horizontal snap scroller, hidden scrollbar, a
// forced-colors outline so the band's edge survives high-contrast mode (the
// green rule / sunken well it would otherwise rely on can flatten there).
const RAIL_BASE =
  'flex snap-x snap-mandatory overflow-x-auto gap-4 pb-1 scroll-px-4 ' +
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden forced-colors:outline';

// Per-chip wrapper in rail mode. `sm:basis-auto` hands sizing back to the
// grid once the rail dissolves into `sm:grid-cols-2` at ≥640px.
// `forced-colors:border` gives each chip its own visible boundary in
// high-contrast mode (mirrors RAIL_BASE's band-level outline).
const RAIL_CHIP = 'shrink-0 snap-start basis-[9.25rem] sm:basis-auto forced-colors:border';

// Phone-tier base grid (below `sm`): one column for a lone figure, two for
// everything else. Tightened gap so a 40px numeral has room in a ~163px cell.
const GRID_BASE: Record<1 | 2, string> = {
  1: 'grid grid-cols-1 gap-x-5 gap-y-6',
  2: 'grid grid-cols-2 gap-x-5 gap-y-6',
};

// The count===3 "2 + 1-wide" rhythm: the trailing cell spans both columns on
// phone AND at `sm` (still a 2-col template there), then gives the span back
// at `lg` once the desktop template grows to 3 real columns.
const GRID_LAST_SPAN_3 =
  '[&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1';

// When a caller grows the template to 3+ real columns already at `md` (via
// `mdColumns`), the count===3 trailing-cell span must hand its width back
// there too — otherwise the 768–1023px range renders a 3-col template whose
// last cell still spans 2, and grid auto-placement can't fit it into row 1's
// single remaining column, pushing it to a mostly-empty row 2 (visible gap).
// Not emitted for `mdColumns={2}`, where the "2 + 1-wide" rhythm is still the
// intended shape.
const MD_LAST_SPAN_RESET_3 = 'md:[&>*:last-child]:col-span-1';

// Desktop suffix for the GRID branch — byte-for-byte the original
// KPIContentsStrip `COLS` map. `columns` (desktop target) is independent of
// `count` (the phone-shape decision above).
const GRID_COLS: Record<StatStripColumns, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-6',
};

// Desktop suffix for the RAIL branch — same target column counts, but the
// rail has to switch `display` back to grid and cancel the scroller first.
const RAIL_COLS: Record<StatStripColumns, string> = {
  1: 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7',
  2: 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7',
  3: 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7 lg:grid-cols-3',
  4: 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7 lg:grid-cols-4',
  5: 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7 lg:grid-cols-5',
  6: 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7 lg:grid-cols-6',
};

// The RAIL branch's `sm` tier with the `lg:grid-cols-N` suffix stripped —
// used in place of `RAIL_COLS[resolvedColumns]` only when `xlColumns` is
// supplied, so the default `lg` override doesn't fight `xlColumns`' `xl`
// override for the 1024–1279px range (both are min-width queries; whichever
// is later in Tailwind's generated stylesheet order wins the cascade, so the
// `lg` tier must be omitted rather than merely shadowed).
const RAIL_SM_ONLY = 'sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-x-8 sm:gap-y-7';

// Same idea for the GRID branch's `sm` tier.
const GRID_SM_ONLY = 'sm:grid-cols-2';

// Optional `md` (≥768px) column override — only emitted when a caller passes
// `mdColumns` (e.g. admin's original `md:grid-cols-3`/`md:grid-cols-4`).
const MD_COLS: Record<StatStripColumns, string> = {
  1: '',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};

// Optional `xl` (≥1280px) column override — only emitted when a caller
// passes `xlColumns` (e.g. admin's original `xl:grid-cols-6`).
const XL_COLS: Record<StatStripColumns, string> = {
  1: '',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
};

/** Clamp a raw count into the 1–6 static-map domain (no arbitrary grid dims). */
function clampColumns(n: number): StatStripColumns {
  const clamped = Math.max(1, Math.min(6, Math.round(n)));
  return clamped as StatStripColumns;
}

/**
 * Phone → 2-col grid (≤4 peers) or single-band snap-rail (≥5 peers); desktop
 * grid preserved above `sm`. Bare grid/rail — deliberately NO card wrapper
 * around the whole strip (doctrine rule 11: a full-width panel here would be
 * the same "tell" as the retired accent-stripe card).
 */
export function StatStrip({
  children,
  count,
  columns,
  mdColumns,
  xlColumns,
  railThreshold = STAT_STRIP_RAIL_THRESHOLD,
  edgeBleedClassName,
  ariaLabel,
  className,
}: StatStripProps) {
  const resolvedColumns = columns ?? clampColumns(count);
  const isRail = count >= railThreshold;
  // `xlColumns` supersedes the default `lg` tier (see RAIL_SM_ONLY/GRID_SM_ONLY
  // doc comments) — everything else about the default maps is untouched, so
  // every caller that doesn't pass `mdColumns`/`xlColumns` gets byte-for-byte
  // the same classes as before this prop existed.
  const railDesktopTier = xlColumns ? RAIL_SM_ONLY : RAIL_COLS[resolvedColumns];
  const gridDesktopTier = xlColumns ? GRID_SM_ONLY : GRID_COLS[resolvedColumns];

  if (isRail) {
    return (
      <div
        role="list"
        aria-label={ariaLabel}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region MUST be focusable for keyboard scrolling; Safari (unlike Chrome) does not add this implicitly (WCAG 2.1.1, ACT 0ssw9k)
        tabIndex={0}
        className={cn(
          RAIL_BASE,
          railDesktopTier,
          mdColumns && MD_COLS[mdColumns],
          xlColumns && XL_COLS[xlColumns],
          edgeBleedClassName,
          className,
        )}
      >
        {React.Children.map(children, (child, i) =>
          React.isValidElement(child) ? (
            <div key={child.key ?? i} role="listitem" className={RAIL_CHIP}>
              {child}
            </div>
          ) : (
            child
          ),
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        GRID_BASE[count === 1 ? 1 : 2],
        count === 3 && GRID_LAST_SPAN_3,
        count === 3 && mdColumns !== undefined && mdColumns >= 3 && MD_LAST_SPAN_RESET_3,
        'sm:gap-x-8 sm:gap-y-7',
        gridDesktopTier,
        mdColumns && MD_COLS[mdColumns],
        xlColumns && XL_COLS[xlColumns],
        className,
      )}
    >
      {children}
    </div>
  );
}
