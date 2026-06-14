/**
 * ============================================================================
 * Fairway — top-level barrel (Wave 1 integration, ADDITIVE)
 * ----------------------------------------------------------------------------
 * Single import surface for every Fairway warm-premium primitive built under
 * `src/components/fairway/*`. Import anything from here:
 *
 *   import { AppShell, ViewHeader, Surface, MetricCard, DataTable } from
 *     '@/components/fairway';
 *
 * ADDITIVE ONLY — nothing here is imported by the live app. Primitives render
 * correctly inside a `.fairway-ds` scope on a `bg-canvas` page (see
 * `@/lib/redesign/flag`).
 *
 * ── Name-collision resolutions ─────────────────────────────────────────────
 * Two groups export a `GlassSurface` (+ `GlassSurfaceProps`):
 *   • `surfaces`  → the CANONICAL restrained Liquid-Glass primitive
 *                   (DESIGN-SYSTEM §4 allow-list). Re-exported as the
 *                   unqualified `GlassSurface` / `GlassSurfaceProps`.
 *   • `command`   → a local glass panel the ⌘K palette floats in. Re-exported
 *                   here under the disambiguated names `CommandGlassSurface` /
 *                   `CommandGlassSurfaceProps` so both remain reachable.
 * Everything else is unique across the 12 groups.
 * ========================================================================== */

// ── app-shell ───────────────────────────────────────────────────────────────
export {
  AppShell,
  type AppShellProps,
  FairwaySidebar,
  type FairwaySidebarProps,
  FairwayTopBar,
  type FairwayTopBarProps,
  RouteTransition,
  type RouteTransitionProps,
  type NavItem,
  type NavSection,
  type Breadcrumb,
  type ShellUser,
  type FairwayIcon,
  type ShellLinkComponent,
} from './app-shell';

// ── page frame ────────────────────────────────────────────────────────────--
export {
  PageContainer,
  type PageContainerProps,
  type PageContainerWidth,
} from './app-shell/PageContainer';

// ── eyebrow (the ONE overline recipe) ───────────────────────────────────────
export { Eyebrow, type EyebrowProps, type EyebrowTone } from './controls/eyebrow';

// ── view-header ───────────────────────────────────────────────────────────--
export {
  ViewHeader,
  type ViewHeaderProps,
  type ViewHeaderSize,
  ViewHeaderSegments,
  type ViewHeaderSegment,
  type ViewHeaderSegmentsProps,
} from './view-header';

// ── surfaces (CANONICAL GlassSurface) ────────────────────────────────────────
export {
  Surface,
  SurfaceHeader,
  SurfaceBody,
  SurfaceFooter,
  Inset,
  Elevated,
  type SurfaceProps,
  type SurfaceHeaderProps,
  type SurfaceElevation,
  type SurfacePadding,
  type InsetProps,
  type ElevatedProps,
  GlassSurface,
  type GlassSurfaceProps,
  type GlassSurfaceKind,
} from './surfaces';

// ── cards-insight ─────────────────────────────────────────────────────────--
export {
  MetricCard,
  type MetricCardProps,
  type MetricCardVariant,
  type MetricCardDensity,
  type MetricDelta,
  type MetricDeltaDirection,
  type MetricGoodDirection,
  InsightCard,
  INSIGHT_PRIORITY,
  type InsightCardProps,
  type InsightVariant,
  type InsightPriority,
  type PriorityTone,
  // InsightPanel — the expanded/docked READ of one signal (Sheet | docked).
  InsightPanel,
  type InsightPanelProps,
  type InsightPanelMode,
  type InsightPanelAction,
} from './cards-insight';

// ── controls ────────────────────────────────────────────────────────────────
export {
  Button,
  IconButton,
  type ButtonProps,
  type IconButtonProps,
  type FwButtonVariant,
  type FwButtonSize,
  type FwIconButtonVariant,
  type FwIconButtonSize,
  Segmented,
  type SegmentedProps,
  type SegmentedOption,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsTriggerProps,
  StatusPill,
  type StatusPillProps,
  FilterPill,
  type FilterPillProps,
  Badge,
  Chip,
  type BadgeProps,
  type ChipProps,
  Avatar,
  AvatarGroup,
  type AvatarProps,
  type AvatarGroupProps,
  type AvatarSize,
  type AvatarStatus,
  Toolbar,
  ToolbarIconButton,
  type ToolbarProps,
  type ToolbarViewToggleProps,
  type ToolbarFilterMenuProps,
  type ToolbarFilterOption,
  type FwStatusTone,
} from './controls';

// ── forms ─────────────────────────────────────────────────────────────────--
export {
  Form,
  type FormProps,
  FormSection,
  type FormSectionProps,
  FormField,
  type FormFieldProps,
  Input,
  TextArea,
  type InputProps,
  type TextAreaProps,
  Select,
  SelectItem,
  SelectGroup,
  type SelectProps,
  type SelectOption,
  Combobox,
  type ComboboxProps,
  type ComboboxOption,
  type SingleComboboxProps,
  type MultiComboboxProps,
  NumberField,
  type NumberFieldProps,
  Checkbox,
  CheckboxGroup,
  type CheckboxProps,
  Switch,
  type SwitchProps,
  RadioGroup,
  Radio,
  type RadioGroupProps,
  type RadioProps,
  type RadioOption,
  type FieldStatus,
  type FieldSize,
} from './forms';

// ── data-table ──────────────────────────────────────────────────────────────
export {
  DataTable,
  type DataTableProps,
  DataTableSkeleton,
  type DataTableSkeletonProps,
  DataTableEmpty,
  DataTableError,
  densityMetrics,
  alignClass,
  type DensityMetrics,
  type DataTableDensity,
  type DataTableRowAction,
  type DataTableStateProps,
  type FairwayColumnMeta,
  type ColumnDef,
  type Row,
} from './data-table';

// ── calendar ────────────────────────────────────────────────────────────────
export {
  CalendarSurface,
  CalendarSurfaceDefault,
  DatePicker,
  DatePickerDefault,
  type CalendarSurfaceProps,
  type CalendarSurfaceBaseProps,
  type CalendarMode,
  type CalendarSize,
  type TemporalDirection,
  type DateRange,
  type Matcher,
  type Modifiers,
  type DatePickerProps,
} from './calendar';

// ── charts ────────────────────────────────────────────────────────────────--
export {
  ChartFrame,
  type ChartFrameProps,
  type ChartFrameState,
  type ChartTableColumn,
  type ChartTableData,
  ChartTooltip,
  RechartsTooltip,
  makeChartTooltip,
  type ChartTooltipProps,
  type TooltipRow,
  type RechartsTooltipProps,
  type RechartsTooltipOptions,
  type RechartsTooltipPayloadItem,
  type ChartTooltipRenderProps,
  Numeric,
  DeltaChip,
  type NumericProps,
  type DeltaChipProps,
  // ── Phase-1 charts batch: micro-trend + trend-classification primitives ──
  // TrendChip HOSTS the ONE shared trend-classification fn the whole cluster
  // consumes (Sparkline color, StatTile chip, MetricCard delta all route here).
  TrendChip,
  classifyTrend,
  classifyTrendFromValues,
  TREND_COLOR,
  TREND_ARROW,
  type TrendChipProps,
  type TrendDirection,
  type GoodDirection,
  type ClassifyTrendOptions,
  Sparkline,
  type SparklineProps,
  StatTile,
  type StatTileProps,
  // ChartCrosshair: the keyboard + aria-live a11y path for every line/area chart
  useChartCrosshair,
  ChartCrosshairCursor,
  ChartCrosshairLiveRegion,
  type CrosshairPoint,
  type UseChartCrosshair,
  type UseChartCrosshairOptions,
  type ChartCrosshairCursorProps,
  type ChartCrosshairLiveRegionProps,
  // GenomeFingerprint: diverging-bar compare (REPLACES the forbidden two radars)
  GenomeFingerprint,
  type GenomeFingerprintProps,
  type GenomeDimension,
  // ── Instrument-cluster HERO CHART INSTRUMENTS (the data-viz IS the hero art) ─
  // Cockpit dials that mount INTO the signature `instrument` InstrumentPanel:
  // a sweeping RadialGauge centerpiece, a bold filled Ribbon, a small
  // calibration Dial, a chunky SegmentBar. All consume the VIZ_* tokens.
  RadialGauge,
  type RadialGaugeProps,
  type RadialGaugeSize,
  Ribbon,
  type RibbonProps,
  type RibbonPoint,
  Dial,
  type DialProps,
  SegmentBar,
  type SegmentBarProps,
  type SegmentBarPart,
  type SegmentTone,
  TrendChart,
  BarCompare,
  type TrendChartProps,
  type TrendPoint,
  type BarCompareProps,
  type BarCompareDatum,
  GenomeRadar,
  type GenomeRadarProps,
  type GenomeAxis,
  StrokesGainedTornado,
  type StrokesGainedTornadoProps,
  type SGCategory,
  // LeakMap: the "you vs PGA" dot-and-curve chart for the stats leak maps.
  LeakMap,
  type LeakMapProps,
  type LeakMapBucket,
  // StandingStrip: flat matte PGA·team·you comparison (Fairway-native StandingBar).
  StandingStrip,
  type StandingStripProps,
  ShotDispersion,
  type ShotDispersionProps,
  type ShotPoint,
  PuttingHeatmap,
  type PuttingHeatmapProps,
  type HeatCell,
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
  useCanvasLayer,
  resolveCssColor,
  type UseCanvasLayer,
  type CanvasSize,
} from './charts';

// ── ChartCard alias (cohesion: ChartFrame self-describes as the §6 ChartCard) ─
// RESOLUTION from the blueprint — build NO new component; alias the existing
// ChartFrame so plan-named `ChartCard` / `ChartCardProps` imports resolve.
export { ChartFrame as ChartCard } from './charts';
export type { ChartFrameProps as ChartCardProps } from './charts';

// ── feedback ────────────────────────────────────────────────────────────────
export {
  ToastStack,
  fairwayToast,
  type ToastStackProps,
  type FairwayToastOptions,
  InlineNotice,
  type InlineNoticeProps,
  EmptyState,
  type EmptyStateProps,
  type EmptyStateVariant,
  InsufficientData,
  type InsufficientDataProps,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonStat,
  SkeletonList,
  type SkeletonProps,
  type SkeletonTextProps,
  OnboardingStep,
  OnboardingSteps,
  type OnboardingStepProps,
  type OnboardingStepStatus,
  type OnboardingStepsProps,
  toneStyle,
  TONES,
  type FeedbackTone,
  type ToneStyle,
} from './feedback';

// ── overlays ────────────────────────────────────────────────────────────────
export {
  ModalShell,
  type ModalShellProps,
  type ModalShellSize,
  Sheet,
  type SheetProps,
  type SheetSide,
  PopoverPanel,
  type PopoverPanelProps,
  type PopoverPanelSurface,
} from './overlays';

// ── command ─────────────────────────────────────────────────────────────────
// NOTE: `command` also exports a `GlassSurface`. To avoid colliding with the
// canonical `surfaces` one above, it is re-exported under disambiguated names.
export {
  SearchField,
  type SearchFieldProps,
  CommandMenu,
  type CommandMenuProps,
  type CommandItem,
  type CommandGroup,
} from './command';
export {
  GlassSurface as CommandGlassSurface,
  type GlassSurfaceProps as CommandGlassSurfaceProps,
} from './command';

// ── instrument (the "instrument cluster" hero kit — frosted-glass panels) ────
// The signature CoachHelm hero surface: layered frosted-glass instrument panels
// (base/raised/inset depth), the asymmetric cockpit cluster layout, and the big
// Fragment-Mono cockpit Readout (with the honest live/awaiting calibration).
export {
  InstrumentPanel,
  type InstrumentPanelProps,
  type InstrumentPanelTone,
  type InstrumentPanelDepth,
  type InstrumentPanelPadding,
  InstrumentCluster,
  type InstrumentClusterProps,
  type ClusterBalance,
  type ClusterTertiaryColumns,
  Readout,
  type ReadoutProps,
  type ReadoutState,
  type ReadoutSamples,
  type ReadoutDelta,
} from './instrument';

// ── pages · dashboard ─────────────────────────────────────────────────────--
export {
  FairwayPlayerDashboard,
  FairwayPlayerDashboardDefault,
  type PlayerDashboardData,
} from './pages/dashboard';

// ── pages · coachhelm (Phase-2 shell composites + lifted shared modules) ─────
// The keystone shell + sub-nav, the ONE focus-area vocabulary, the lifted
// AREA_TYPES vocabulary, and the shared optimistic chat-send hook. ADDITIVE +
// GATED — consumed only behind isRedesignEnabled() forks in the surfaces wave.
export {
  CoachHelmShell,
  type CoachHelmShellProps,
  type CoachHelmCrumb,
  FairwayBrief,
  type FairwayBriefProps,
  CoachHelmSubNav,
  type CoachHelmSubNavProps,
  type CoachHelmTab,
  type CoachHelmRole,
  FocusAreaCard,
  type FocusAreaCardProps,
  type FocusAreaCardData,
  type FocusAreaRole,
  type FocusAreaProgressEntry,
  // ── Players surface (coach "Players" tab + per-player genome detail/compare) ─
  PlayersGridView,
  type PlayersGridViewProps,
  type PlayersGridPlayer,
  type PlayersGridFocusArea,
  type PlayersGridStats,
  GenomeDetailView,
  type GenomeDetailViewProps,
  GenomeCompareView,
  type GenomeCompareViewProps,
  type ComparePlayerOption,
  type CompareSeries,
  AREA_TYPES,
  getAreaType,
  suggestedMetrics,
  getAreaAutoFill,
  isLowerIsBetter,
  getProgressPercent,
  LOWER_IS_BETTER_KEYWORDS,
  type AreaTypeValue,
  type AreaTypeConfig,
  type AreaAutoFillStats,
  type AreaAutoFill,
  useCoachChatSend,
  type UseCoachChatSendOptions,
  type UseCoachChatSendResult,
  type ChatSendResponse,
  type ChatMessage,
  // ── Ask surface (coach "Ask" tab over /coachhelm/chat) ─────────────────────
  AskWorkspace,
  type AskWorkspaceProps,
  AskConversationRail,
  type AskConversationRailProps,
  type AskConversationOrigin,
  type AskOriginKind,
  AskThreadPane,
  type AskThreadPaneProps,
  // ── Effectiveness surface (coach "Effectiveness" tab over analytics/coachhelm) ─
  FairwayEffectiveness,
  type FairwayEffectivenessProps,
  // ── Signals surface (coach "Signals" tab over alerts/insights/patterns) ─────
  // ONE component for all three Signals routes, discriminated by signalSource +
  // defaultFilter. Consumed by the alerts/insights/patterns flag forks.
  FairwayCoachHelmSignals,
  type FairwayCoachHelmSignalsProps,
  type SignalsDefaultFilter,
  type SignalsView,
  type SignalGroupBy,
  SignalsToolbar,
  type SignalsToolbarProps,
  type AppliedFilterChip,
  ScanTeamControl,
  type ScanTeamControlProps,
  insightToSignalRow,
  patternToSignalRow,
  insightsToSignalRows,
  patternsToSignalRows,
  type SignalRow,
  type SignalSource,
  type SignalEvidenceLine,
  // ── Player-path surfaces (phase 5 · the PLAYER shell variant) ──────────────
  FairwayPlayerCoachHelm,
  type FairwayPlayerCoachHelmProps,
  FairwayMyDevelopment,
  type FairwayMyDevelopmentProps,
} from './pages/coachhelm';
