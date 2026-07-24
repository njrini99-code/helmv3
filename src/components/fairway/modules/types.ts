// types.ts — public contracts for the Spine & Stage module kit
import type { ReactNode } from 'react';

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
export interface SpineLedgerProps { rows: SpineLedgerRow[]; className?: string }

export interface SpineProps {
  eyebrow: string;
  hero: { value: string; unit?: string };
  verdict: string;
  track?: StandingTrackProps;
  priorities?: PriorityItem[];
  ledger?: { label: string; value: string }[];
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

export interface RailBarRow { label: string; pct: number; value: string; dim?: boolean; tickPct?: number }
export interface RailBarsProps { rows: RailBarRow[]; labelWidth?: number }

export interface DivergingRow { label: string; delta: number; display: string }
export interface DivergingBarsProps { rows: DivergingRow[]; max: number }

export interface RampCell { value: string; n?: string; band: 0 | 1 | 2 | 3 | 4 }
export interface RampMatrixProps {
  cols: string[];
  rows: { label: string; cells: RampCell[] }[];
  legend?: { band: 1 | 2 | 3 | 4; label: string }[];
}

export interface TickerItem { label: string; heightPct: number; emphasis?: boolean }
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
}
export interface MatrixBoardRow {
  id: string;
  cells: ReactNode[];            // rendered per column, same order as columns
  expand?: ReactNode;            // inline detail band content
  ariaLabel: string;
}

export interface FilmstripHole { n: number; par: number; score: number; note?: string }
export interface FilmstripProps {
  holes: FilmstripHole[];
  activeHole?: number;
  onScrub?: (hole: FilmstripHole) => void;
}
