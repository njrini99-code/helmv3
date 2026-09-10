// types.ts — public contracts for the Spine & Stage module kit
import type { ReactNode } from 'react';
import type { StandingBarsProps } from '../charts/StandingBars';

export interface StandingTrackProps {
  /** 0–100 position of the subject pin */
  pct: number;
  benchmarks: { label: string; pct: number; emphasis?: boolean }[];
  subjectLabel: string;          // "You" | "Team"
  /**
   * Override the label row's edge-clamp margin (see
   * `STANDING_TRACK_EDGE_MARGIN_PCT`). The default is calibrated for short
   * 3-5 char labels ("You"/"Team"/"Tour") — a caller whose benchmark labels
   * run longer (e.g. "Field Avg") should pass a wider margin so the label
   * text never clips against the track's own edge at narrow widths.
   */
  edgeMarginPct?: number;
  /** Override the label row's minimum-gap collision margin (see
   *  `STANDING_TRACK_MIN_GAP_PCT`). Widen alongside `edgeMarginPct` for
   *  longer labels so two adjacent labels still can't visually collide. */
  minGapPct?: number;
}

export interface PriorityItem { rank: number; title: string; value: string }

/** A signed ▲/▼/► annotation on a `SpineLedgerRow` — the direction the raw
 *  value actually moved (`up`/`down`/`flat`), plus whether that movement is
 *  GOOD for this metric (e.g. fewer putts is `up` in the "good" sense even
 *  though the raw number went down). `good` alone drives the color; the
 *  glyph is always literal direction so it never lies about which way the
 *  number moved. */
export interface SpineLedgerDelta {
  /** Pre-formatted signed magnitude, e.g. "+4%" / "−0.6". */
  text: string;
  direction: 'up' | 'down' | 'flat';
  good: boolean;
}
export interface SpineLedgerRow {
  label: string;
  value: string;
  /** Optional — omit for the unchanged flat-value row every existing caller
   *  (PlayerSpine/CoachSpine) already renders. */
  delta?: SpineLedgerDelta;
}
/**
 * A `SpineLedgerRow` whose `value` isn't necessarily plain text — e.g. a
 * count `Chip` (2026-09-10, primitives follow-up, for `Spine`'s `readouts`
 * slot). `SpineLedgerProps.rows` accepts this WIDER shape rather than
 * widening `SpineLedgerRow` itself, so every existing typed consumer of
 * `SpineLedgerRow` (`buildStatsViewModel.ts#buildLedger` returns
 * `SpineLedgerRow[]`, assigned into `StatsSpine`'s `ledger: Array<{label,
 * value: string}>` prop) keeps its narrower `string` value unchanged. A
 * `SpineLedgerRow[]` is still assignable wherever this wider type is
 * expected — `string` is a valid `ReactNode`.
 */
export interface SpineReadoutRow {
  label: string;
  value: ReactNode;
  delta?: SpineLedgerDelta;
}
export interface SpineLedgerProps { rows: SpineReadoutRow[]; className?: string }

export interface SpineProps {
  eyebrow: string;
  hero: { value: string; unit?: string };
  verdict: string;
  /**
   * The you/team/Tour standing readout, rendered as a bare (chrome-free)
   * `StandingBars` row group between two hairlines — same call site the
   * old `StandingTrack` pin/rail occupied. Full metric data, not a reduced
   * `{pct, benchmarks}` shape, so `StandingBars` can derive its own
   * cold-start gating (`team_n`), diverging-vs-rail geometry, and aria
   * label instead of trusting a caller-computed percentage.
   */
  standing?: StandingBarsProps;
  priorities?: PriorityItem[];
  /**
   * A compact multi-row ledger rendered directly under the verdict sentence
   * (2026-09-10, primitives follow-up) — for facts a single verdict string
   * can't hold without folding distinct signals together (REVIEW.md: the
   * cockpit folded "players needing attention" and "outcomes awaiting" into
   * one sentence for lack of this slot). Same `SpineLedger` visual as
   * `ledger` below (hairline row group, tabular numerals) but a SEPARATE
   * slot rendered earlier (right after the verdict, before `standing`) —
   * `ledger` keeps its existing position/callers untouched.
   */
  readouts?: SpineReadoutRow[];
  ledger?: { label: string; value: string }[];
  /**
   * An urgent signal rendered as a marked row BEFORE `ledger` and BEFORE
   * `children` (2026-09-10, primitives follow-up). Existing callers render
   * urgent content through `children`, which lands AFTER `ledger` — moving
   * that content into this slot instead is how a consumer fixes the
   * "urgent signal after the ledger" ordering flagged in REVIEW.md without
   * restructuring its own JSX.
   */
  urgent?: ReactNode;
  cta?: { label: string; onClick?: () => void; href?: string };
  children?: ReactNode;          // escape hatch for surface-specific rows
}

export interface StageView { key: string; node: ReactNode }
export interface StageRouterProps {
  /** search param name, e.g. "area" (stats) or "view" (coachhelm) */
  param: string;
  homeKey: string;               // key rendered when param is absent/unknown
  views: StageView[];
}

export interface DrillPanelProps {
  title: string;
  backLabel: string;             // e.g. "All areas"
  onBack: () => void;
  chip?: ReactNode;
  children: ReactNode;
}

export type CellChipTone = 'leak' | 'strength' | 'neutral';
export interface BentoCellProps {
  label: string;
  chip?: { tone: CellChipTone; text: string };
  headline?: { value: string; unit?: string };
  sentence?: string;
  span?: 1 | 2;                  // columns
  rows?: 1 | 2;
  exitLabel?: string;            // defaults to "→"
  onOpen?: () => void;
  children?: ReactNode;          // mini-viz slot
}

export interface RailBarRow {
  label: string;
  pct: number;
  value: string;
  dim?: boolean;
  tickPct?: number;
  /**
   * The evidence behind `value` — `'1/2'` where both halves are known, or a
   * bare `'n=3'` where only the denominator is (mirroring `RampCell.n`).
   *
   * A rate with no denominator is not a fact a coach can act on: one sand save
   * from two tries renders "50%", identical in weight to twenty from forty.
   * Measured 2026-08-17, 14 of 42 players carry a sand-save number derived from
   * four or fewer attempts. Mirrors `RampCell.n`, which already carries a
   * sample count in this same module family.
   *
   * Optional, and omitted rather than faked when the counts are unavailable.
   */
  sample?: string;
}
export interface RailBarsProps { rows: RailBarRow[]; labelWidth?: number }

export interface DivergingRow { label: string; delta: number; display: string }
export interface DivergingBarsProps { rows: DivergingRow[]; max: number }

export interface RampCell { value: string; n?: string; band: 0 | 1 | 2 | 3 | 4 }
export interface RampMatrixProps {
  cols: string[];
  rows: { label: string; cells: RampCell[] }[];
  legend?: { band: 1 | 2 | 3 | 4; label: string }[];
}

export interface TickerItem {
  label: string;
  heightPct: number;
  emphasis?: boolean;
  /**
   * Sign-colored fill (home.v2.md §6 "Recent rounds") — `good` (better than
   * even, bg-accent-500), `over` (worse than even, bg-fw-warning), `even`
   * (exactly even, bg-surface-sunken). Additive: when omitted (the Rounds
   * library's own `TickerStrip` call, its only other consumer), rendering
   * falls back to the existing `emphasis`-only behavior unchanged — this
   * turns the strip from "one bar highlighted, the rest identical dim wash"
   * into a form line that reads by sign without touching that call site.
   */
  tone?: 'good' | 'even' | 'over';
}
export interface TickerStripProps { items: TickerItem[] }

export interface RingGaugeProps { value: number; size?: number }   // value 0–100
export type SignalTone = 'hot' | 'watch' | 'quiet';
export interface SignalChipProps { tone: SignalTone; children: ReactNode }
export interface RankCellProps { rank: number; of: number }
export interface GradeDotsProps { score: 0 | 1 | 2 | 3 | 4 | 5; label: string }
export interface RxCardProps { title: string; children: ReactNode }

export interface MatrixColumn { key: string; label: string; align?: 'left' | 'center' }
export interface MatrixBoardProps {
  kpis: { label: string; value: ReactNode }[];
  columns: MatrixColumn[];
  rows: MatrixBoardRow[];
  /**
   * Externally controlled expand state: the `id` of the one row that should
   * read as expanded (`null` = none). Omit (leave `undefined`) to let each
   * row manage its own local open state exactly as before — a board with no
   * `expandedRowId` is byte-identical to the pre-existing uncontrolled
   * behavior, including independently-expandable rows.
   */
  expandedRowId?: string | null;
  /** Fires when a row's expand toggle is pressed WHILE `expandedRowId` is controlled — the new candidate id (or `null` when collapsing). Ignored (never called) in uncontrolled mode. */
  onExpandedRowChange?: (rowId: string | null) => void;
  /**
   * Column keys hidden below the 940px breakpoint, IN ADDITION to the
   * board's own built-in set (`scor`/`composite`/`trend`/`signal` —
   * `MatrixBoard.tsx`'s `HIDE_ON_MOBILE`). 2026-09-10, primitives follow-up:
   * a per-board column that needs the same phone-hiding behavior without
   * colliding with those literal keys (see `FairwayCoachRoster`'s
   * "MatrixBoard column keys" deviation note, which worked around the
   * absence of this prop by reusing the built-in keys for unrelated
   * columns). Omit for the unchanged built-in-only set.
   */
  hideOnMobile?: string[];
  /**
   * Fires when a BARE row (one with no `expand` content) is activated by
   * click, Enter, or Space. 2026-09-10, primitives follow-up (REVIEW.md
   * decision: "MatrixBoard has no bare row-select callback"). Never fires
   * for a row that HAS `expand` — those rows keep the existing toggle-only
   * behavior unchanged, and selecting a row never expands it. Omit to keep
   * bare rows non-interactive exactly as before.
   */
  onRowSelect?: (row: MatrixBoardRow) => void;
  /**
   * The id of the row that should read as selected (`aria-selected`) while
   * `onRowSelect` is in use. Has no effect on a row that isn't selectable
   * (i.e. one with `expand` content, or when `onRowSelect` is omitted).
   */
  selectedId?: string | null;
  /**
   * Override the identity (first) column's grid track. Default
   * `minmax(0,2fr)` (2026-09-10, primitives follow-up — was
   * `minmax(120px,1.6fr)`, which cut player names at ~10 characters on a
   * 390px phone because the 120px floor competed with the metric columns'
   * own floors for the remaining width instead of yielding to them first).
   */
  identityTrack?: string;
}
export interface MatrixBoardRow {
  id: string;
  cells: ReactNode[];            // rendered per column, same order as columns
  expand?: ReactNode;            // inline detail band content
  ariaLabel: string;
  /**
   * A trailing per-row action slot (e.g. an overflow `Menu`/`IconButton`),
   * rendered as a SIBLING of the row's press-target button — never nested
   * inside it, so a real interactive control here never produces a
   * button-inside-a-button. Omit for rows with no row-level actions.
   */
  actions?: ReactNode;
}

export interface FilmstripHole { n: number; par: number; score: number; note?: string }
export interface FilmstripProps {
  holes: FilmstripHole[];
  activeHole?: number;
  onScrub?: (hole: FilmstripHole) => void;
}

/** One bar in `ScoringHistogram` (round-review.v2.md R2) — `tone` reuses
 *  `TickerItem['tone']`'s exact sign vocabulary ('good' = better than par,
 *  'even' = par, 'over' = worse than par) rather than inventing a parallel
 *  one. */
export interface ScoringBucket { label: string; count: number; tone: 'good' | 'even' | 'over' }
export interface ScoringHistogramProps { buckets: ScoringBucket[] }

/** One hole in `DrivingDotStrip` (round-review.v2.md R6-01). `fairwayHit`
 *  is `null` for a hole with no fairway target at all (par-3) — a distinct
 *  state from a miss, never coerced to `false`. `missSide` is `null` for a
 *  hit, for a hole with no target, AND for a miss whose logged direction
 *  isn't left/right (short/long/unparsed) — that last case is a deliberate,
 *  documented simplification (renders centered, never a guessed side). */
export interface DrivingDotHole { n: number; fairwayHit: boolean | null; missSide: 'left' | 'right' | null }
export interface DrivingDotStripProps { holes: DrivingDotHole[] }

// ── ScoreField (LANGUAGE.md: the home and roster stage instrument) ─────────
/** One plotted round on a player's strip. `date` is a `YYYY-MM-DD` day. */
export interface ScoreFieldRound {
  id: string;
  date: string;
  score: number;
  toPar: number;
  /** Spoken and hovered description, e.g. "Aug 31, QA Test Course, 73 (+1)". */
  label: string;
  href?: string;
}
export interface ScoreFieldTrend {
  /** Split-half delta in strokes, signed the way the score moved (negative = better). */
  delta: number;
  direction: 'improving' | 'declining' | 'stable';
}
export interface ScoreFieldRow {
  id: string;
  name: string;
  avatarUrl?: string | null;
  href?: string;
  /** Oldest to newest; the strip positions them by `date` on the shared axis. */
  rounds: ScoreFieldRound[];
  avg: number | null;
  trend?: ScoreFieldTrend | null;
}
export interface ScoreFieldProps {
  rows: ScoreFieldRow[];
  /** Shared date axis, `YYYY-MM-DD` inclusive. */
  domain: { start: string; end: string };
  /** Strokes over/under par that reach full bar height. Derived from the data (4 to 12) when omitted. */
  cap?: number;
  /** Row heading column, e.g. "Player". */
  rowsLabel?: string;
  ariaLabel?: string;
  className?: string;
}
