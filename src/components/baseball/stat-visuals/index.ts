// =============================================================================
// src/components/baseball/stat-visuals/index.ts
//
// Public surface of the V10 baseball STAT-VISUAL chart library. The Stats Center,
// player profile, and any other surface import every chart + the shared frame and
// pure helpers from HERE.
//
// OWNED BY THE STAT-VISUALS PACKET. The shared <StatVisualFrame> and the imported
// <SourceTrustBadge> (re-exported from the source-trust foundation) are the only
// cross-surface components; every chart below is built on top of the frame.
// =============================================================================

// ---- Foundations frame (owned here) ----------------------------------------
export {
  StatVisualFrame,
  EmptyState as StatVisualEmptyState,
  type StatVisualState,
  type StatVisualFrameProps,
  type StatVisualSourceChip,
  type StatVisualSample,
  type StatVisualTableColumn,
  type StatVisualTableData,
} from './StatVisualFrame';

// ---- Foundations source badge (re-export of the source-trust foundation) ----
export { SourceTrustBadge } from '@/components/baseball/source-trust';

// ---- Shared chart primitives + pure geometry --------------------------------
export {
  useMeasuredWidth,
  AxisX,
  AxisY,
  makeTicks,
  ChartLegend,
  LegendGlyph,
  TabStrip,
  ContextSplitFilter,
  BulletBar,
  PLOT_MARGIN,
  type LegendItem,
} from './chart-primitives';

export {
  linearScale,
  niceDomain,
  gateSample,
  scatterRenderMode,
  hexbin,
  greenHeat,
  divergingHeat,
  pct,
  num,
  delta,
  SAMPLE_THRESHOLDS,
  type SampleGate,
  type SampleThresholds,
  type HexBin,
  type XYPoint,
  type ScatterRenderMode,
} from './chart-geometry';

// ---- Hitting ----------------------------------------------------------------
export {
  EvLaContactMatrix,
  ZoneChaseDamageHeatmap,
  SprayChart,
  ApproachCountLadder,
  GameVsPracticeGap,
  type EvLaContactMatrixProps,
  type ZoneChaseDamageHeatmapProps,
  type SprayChartProps,
  type ApproachCountLadderProps,
  type GameVsPracticeGapProps,
} from './HittingVisuals';

// ---- Pitching ---------------------------------------------------------------
export {
  PitchShapeMap,
  CommandHeatmap,
  VelocityCommandDecay,
  PitchMixOutcomeBoard,
  ReleaseConsistencyPlot,
  type PitchShapeMapProps,
  type CommandHeatmapProps,
  type VelocityCommandDecayProps,
  type PitchMixOutcomeBoardProps,
  type ReleaseConsistencyPlotProps,
} from './PitchingVisuals';

// ---- Catching / Defense / Baserunning --------------------------------------
export {
  CatcherWorkloadBoard,
  BatteryMatrix,
  DefensiveEventMap,
  BaserunningBoard,
  type CatcherWorkloadBoardProps,
  type BatteryMatrixProps,
  type DefensiveEventMapProps,
  type BaserunningBoardProps,
} from './FieldingVisuals';

// ---- Performance / Readiness ------------------------------------------------
export {
  ReadinessHeatStrip,
  LiftProgressionChart,
  PitcherWorkloadOverlay,
  type ReadinessHeatStripProps,
  type LiftProgressionChartProps,
  type PitcherWorkloadOverlayProps,
} from './PerformanceVisuals';

// ---- Practice / Import / Source quality / Player snapshot -------------------
export {
  PracticeFocusOutcomeBoard,
  ImportDiffViewer,
  SourceCoverageBoard,
  PlayerDnaPanel,
  type PracticeFocusOutcomeBoardProps,
  type ImportDiffViewerProps,
  type SourceCoverageBoardProps,
  type PlayerDnaPanelProps,
} from './DataQualityVisuals';

// ---- Mountable gallery (Stats Center + player profile) ----------------------
export {
  StatVisualsSection,
  type StatVisualsSectionProps,
  type StatVisualsData,
  type StatVisualSavedView,
} from './StatVisualsSection';

// ---- Arm strength + speed/decision -----------------------------------------
export {
  ArmBoard,
  SpeedDecisionBoard,
  type ArmBoardProps,
  type SpeedDecisionBoardProps,
} from './SpeedArmVisuals';

// Saved-view persistence hook — wires the gallery to baseball_stat_visual_views
// (the stat-visual-views server actions). Surfaces mount it with one line.
export {
  useStatVisualViews,
  type UseStatVisualViewsResult,
} from './use-stat-visual-views';
