/**
 * ============================================================================
 * Fairway charts — local barrel (Wave 1 "charts" primitive group)
 * ----------------------------------------------------------------------------
 * Warm, instrument-grade data-viz primitives for the stats / CoachHelm layer
 * (DESIGN-SYSTEM.md §5). Matte cards, calm green-on-cream palette, the single
 * glass tooltip, tabular numerics, accessible "view as table" on every chart.
 *
 * ADDITIVE ONLY: nothing here is imported by an existing page/component. These
 * render correctly inside a `.fairway-ds` scope on a `bg-canvas` page.
 *
 *  Shared    — ChartFrame, ChartTooltip / RechartsTooltip, Numeric / DeltaChip,
 *              theme tokens + formatters, useCanvasLayer
 *  Recharts  — TrendChart (line/area), BarCompare (horizontal), GenomeRadar
 *  visx      — StrokesGainedTornado (diverging bars)
 *  Canvas    — ShotDispersion (scatter + σ ellipses), PuttingHeatmap (grid)
 * ========================================================================== */

// ── Shared frame, tooltip, numeric ──────────────────────────────────────────
export { ChartFrame } from './ChartFrame';
export type {
  ChartFrameProps,
  ChartFrameState,
  ChartTableColumn,
  ChartTableData,
} from './ChartFrame';

export { ChartTooltip, RechartsTooltip, makeChartTooltip } from './ChartTooltip';
export type {
  ChartTooltipProps,
  TooltipRow,
  RechartsTooltipProps,
  RechartsTooltipOptions,
  RechartsTooltipPayloadItem,
  ChartTooltipRenderProps,
} from './ChartTooltip';

export { Numeric, DeltaChip } from './Numeric';
export type { NumericProps, DeltaChipProps } from './Numeric';

// ── Micro-trend + trend-classification primitives (charts batch) ────────────
// TrendChip HOSTS the ONE shared trend-classification fn the whole cluster uses.
export {
  TrendChip,
  classifyTrend,
  classifyTrendFromValues,
  TREND_COLOR,
  TREND_ARROW,
} from './TrendChip';
export type {
  TrendChipProps,
  TrendDirection,
  GoodDirection,
  ClassifyTrendOptions,
} from './TrendChip';

export { Sparkline } from './Sparkline';
export type { SparklineProps } from './Sparkline';

export { StatTile } from './StatTile';
export type { StatTileProps } from './StatTile';

export {
  useChartCrosshair,
  ChartCrosshairCursor,
  ChartCrosshairLiveRegion,
} from './ChartCrosshair';
export type {
  CrosshairPoint,
  UseChartCrosshair,
  UseChartCrosshairOptions,
  ChartCrosshairCursorProps,
  ChartCrosshairLiveRegionProps,
} from './ChartCrosshair';

export { GenomeFingerprint } from './GenomeFingerprint';
export type { GenomeFingerprintProps, GenomeDimension } from './GenomeFingerprint';

// ── Instrument-cluster HERO CHART INSTRUMENTS (the data-viz IS the hero art) ──
// Cockpit dials that mount INTO the signature `instrument` InstrumentPanel
// (frosted-glass bezel) + reuse its honest Readout: a sweeping RadialGauge
// centerpiece, a bold filled Ribbon, a small calibration Dial, a chunky
// SegmentBar. All consume the VIZ_* tokens (no raw hex).
export { RadialGauge } from './RadialGauge';
export type { RadialGaugeProps, RadialGaugeSize } from './RadialGauge';

export { Ribbon } from './Ribbon';
export type { RibbonProps, RibbonPoint } from './Ribbon';

export { Dial } from './Dial';
export type { DialProps } from './Dial';

export { SegmentBar } from './SegmentBar';
export type { SegmentBarProps, SegmentBarPart, SegmentTone } from './SegmentBar';

// The shared "view as table" a11y readout for the hero instruments above.
export { InstrumentTable, InstrumentTableToggle } from './InstrumentTable';
export type { InstrumentTableToggleProps } from './InstrumentTable';

// ── Recharts-based charts ───────────────────────────────────────────────────
export { TrendChart, BarCompare } from './TrendChart';
export type {
  TrendChartProps,
  TrendPoint,
  BarCompareProps,
  BarCompareDatum,
} from './TrendChart';

export { GenomeRadar } from './GenomeRadar';
export type { GenomeRadarProps, GenomeAxis } from './GenomeRadar';

// ── visx-based chart ────────────────────────────────────────────────────────
export { StrokesGainedTornado } from './StrokesGainedTornado';
export type { StrokesGainedTornadoProps, SGCategory } from './StrokesGainedTornado';

// ── visx "you vs PGA" dot-and-curve leak chart (stats surfaces) ──────────────
export { LeakMap } from './LeakMap';
export type { LeakMapProps, LeakMapBucket } from './LeakMap';

// ── Fairway-native standing strip (flat matte PGA·team·you comparison) ───────
export { StandingStrip } from './StandingStrip';
export type { StandingStripProps } from './StandingStrip';

// ── Fairway-native green-ruled leader stat (W6 polish — owner's "green
// rules, green leaders" ask; ports the RuledStatLine CONCEPT, not the code) ──
export { RuledLeaderStat } from './RuledLeaderStat';
export type { RuledLeaderStatProps, RuledLeaderStatSize } from './RuledLeaderStat';

// ── Canvas-based charts ─────────────────────────────────────────────────────
export { ShotDispersion } from './ShotDispersion';
export type { ShotDispersionProps, ShotPoint } from './ShotDispersion';

export { PuttingHeatmap } from './PuttingHeatmap';
export type { PuttingHeatmapProps, HeatCell } from './PuttingHeatmap';

// ── Theme tokens, formatters, Canvas helper ─────────────────────────────────
export {
  VIZ_SEQUENTIAL,
  VIZ_DIVERGING,
  VIZ_CHROME,
  VIZ_COLOR,
  VIZ_DEFS,
  VIZ_FONT,
  TABULAR_NUMS,
  VIZ_REVEAL_MS,
  VIZ_EASE,
  formatSigned,
  formatPercent,
  formatCompact,
  chartAriaLabel,
  prefersReducedMotion,
} from './theme';

export { useCanvasLayer, resolveCssColor } from './useCanvasLayer';
export type { UseCanvasLayer, CanvasSize } from './useCanvasLayer';
