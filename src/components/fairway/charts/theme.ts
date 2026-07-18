/**
 * ============================================================================
 * Fairway charts — shared theme + helpers (self-contained, local to this group)
 * ----------------------------------------------------------------------------
 * The one place the cream/green viz vocabulary is defined for every Fairway
 * chart primitive. Mirrors the locked `--fw-viz-*` tokens (design-tokens.css /
 * DESIGN-SYSTEM.md §1.2/§5) so Recharts, visx, and the Canvas layer all draw
 * from a single warm, instrument-grade palette.
 *
 * IMPORTANT: this helper lives INSIDE the charts folder on purpose (the brief
 * forbids top-level shared files other agents might also create). It is only
 * imported by sibling files in this folder.
 *
 * No DOM access at module scope — safe to import in server components. The
 * token strings are CSS `var(--fw-*)` references that resolve inside a
 * `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * Tokenized viz palette (CSS var references — resolve in the .fairway-ds scope)
 * ------------------------------------------------------------------------- */

/** Sequential cream → green → amber ramp (heatmaps, density). 6 stops. */
export const VIZ_SEQUENTIAL = [
  'var(--fw-viz-seq-0)',
  'var(--fw-viz-seq-1)',
  'var(--fw-viz-seq-2)',
  'var(--fw-viz-seq-3)',
  'var(--fw-viz-seq-4)',
  'var(--fw-viz-seq-5)',
] as const;

/** Diverging amber ↔ cream ↔ green ramp (SG tornado, bias). */
export const VIZ_DIVERGING = {
  /** warm amber — "strokes lost" / below baseline */
  negative: 'var(--fw-viz-div-neg)',
  /** cream baseline — exactly at benchmark */
  mid: 'var(--fw-viz-div-mid)',
  /** helm green — "strokes gained" / above baseline */
  positive: 'var(--fw-viz-div-pos)',
} as const;

/** Calm axis / grid / benchmark tokens. */
export const VIZ_CHROME = {
  /** hairline horizontal gridlines (low-alpha warm tertiary) */
  grid: 'var(--fw-viz-grid)',
  /** ≤1px axis line + tick labels */
  axis: 'var(--fw-viz-axis)',
  /** the one emphasized dashed reference (par / benchmark / team-avg) */
  benchmark: 'var(--fw-viz-benchmark)',
} as const;

/** Core semantic colors a chart reaches for. */
export const VIZ_COLOR = {
  /** the ONE accent — helm green, spent on meaning only */
  accent: 'var(--fw-color-accent-500)',
  accentSoft: 'var(--fw-color-accent-300)',
  accentWash: 'var(--fw-color-accent-50)',
  warning: 'var(--fw-color-warning)',
  danger: 'var(--fw-color-danger)',
  textPrimary: 'var(--fw-color-text-primary)',
  textSecondary: 'var(--fw-color-text-secondary)',
  textTertiary: 'var(--fw-color-text-tertiary)',
  surface: 'var(--fw-color-surface)',
} as const;

/** Stable DOM ids for SVG <defs> (gradients/clips) — namespaced to avoid clash. */
export const VIZ_DEFS = {
  areaGradient: 'fw-chart-area-grad',
  accentGradient: 'fw-chart-accent-grad',
} as const;

/* ---------------------------------------------------------------------------
 * Typography for SVG text (charts use the Fairway sans/mono roles)
 * ------------------------------------------------------------------------- */

export const VIZ_FONT = {
  /** numerics: tabular General Sans (the spec default for changing figures) */
  numeric: 'var(--fw-font-sans)',
  /** ledger / code-like monospace columns */
  mono: 'var(--fw-font-mono)',
  /** axis tick + label size in px */
  tickSize: 11,
  labelSize: 12,
} as const;

/** Inline style applied to every numeric value (tabular, lining figures). */
export const TABULAR_NUMS: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums lining-nums',
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
};

/* ---------------------------------------------------------------------------
 * Motion — slow cinematic reveal, honoring prefers-reduced-motion
 * ------------------------------------------------------------------------- */

/** Chart draw-on duration (ms). §5.3: ~600–800ms ease-out, once on in-view. */
export const VIZ_REVEAL_MS = 720;

/** ease-out cubic-bezier matching `--fw-ease-soft`. */
export const VIZ_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

/* ---------------------------------------------------------------------------
 * Formatters — consistent, locale-aware, tabular-friendly
 * ------------------------------------------------------------------------- */

/** Signed Strokes-Gained style number: always shows +/− with fixed decimals. */
export function formatSigned(value: number, decimals = 2): string {
  const fixed = Math.abs(value).toFixed(decimals);
  // A value that ROUNDS to zero at this precision (a hairline float artifact
  // like -1e-15 from a "niced" scale tick, or a genuinely tiny value below
  // the display's resolution) must never carry a sign — "−0.0" reads as a
  // broken/garbled number, not an honest zero (§0 #8 honesty applies to
  // number FORMATTING too, not just missing data).
  if (Number(fixed) === 0) return fixed;
  if (value > 0) return `+${fixed}`;
  return `−${fixed}`; // U+2212 minus (aligns better than hyphen)
}

/** Percent with no trailing noise (e.g. 0.732 → "73%"). */
export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Compact count (1240 → "1.2k"). */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/* ---------------------------------------------------------------------------
 * A11y — concise takeaway label builder + reduced-motion detection
 * ------------------------------------------------------------------------- */

/**
 * Builds a concise `aria-label` for a chart's `role="img"` wrapper from a
 * human title plus an optional one-line takeaway. Never the only channel —
 * paired with the "view as table" fallback in `ChartFrame`.
 */
export function chartAriaLabel(title: string, takeaway?: string): string {
  return takeaway ? `${title}. ${takeaway}` : title;
}

/** SSR-safe reduced-motion check (used by Canvas charts; FM gates via hook). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
