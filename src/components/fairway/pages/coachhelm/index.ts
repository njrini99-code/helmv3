/**
 * ============================================================================
 * Fairway · pages/coachhelm — barrel (Phase-2 shell composites + shared modules)
 * ----------------------------------------------------------------------------
 * The CoachHelm-shell keystone composites + the lifted shared vocabulary, all
 * ADDITIVE and consumed only behind `isRedesignEnabled()` flag forks in the
 * surfaces workflow. Nothing here is imported by the live app today.
 *
 *   • CoachHelmShell    — in-content presentation wrapper (masthead + sub-nav)
 *   • CoachHelmSubNav   — THE persistent 5-tab Link-engine underline strip
 *   • FocusAreaCard     — the ONE coach+player focus-area vocabulary
 *   • areaTypes         — the lifted 8-AREA_TYPES vocabulary + progress helpers
 *   • useCoachChatSend  — the ONE shared optimistic chat-send hook
 * ========================================================================== */

// ── Shell composites ─────────────────────────────────────────────────────────
export { CoachHelmShell } from './CoachHelmShell';
export type { CoachHelmShellProps, CoachHelmCrumb } from './CoachHelmShell';

export { CoachHelmSubNav } from './CoachHelmSubNav';
export type {
  CoachHelmSubNavProps,
  CoachHelmTab,
  CoachHelmRole,
} from './CoachHelmSubNav';

// ── Players surface (phase 3 · coach "Players" tab) ──────────────────────────
//   • PlayersGridView   — the roster grid + re-skinned create-focus-area modal
//                         (CoachHelmShell active="players"); imports the
//                         development.ts focus-area write family UNCHANGED.
//   • GenomeDetailView  — single-player genome (radar hero + persona + dim grid
//                         + this player's focus areas + real "Compute now"
//                         POST). Shared by /genome/[playerId] AND the Nick Rini
//                         sample UUID (same component). loadGenome/derivePersona
//                         reads happen in the route; results are passed in.
//   • GenomeCompareView — two-up compare via GenomeFingerprint DIVERGING BARS
//                         (NOT two radars), honest "N of M live" caption, and a
//                         "no genome computed" legend chip. ?p1=&p2= Link state
//                         preserved verbatim.
export { PlayersGridView } from './PlayersGridView';
export type {
  PlayersGridViewProps,
  PlayersGridPlayer,
  PlayersGridFocusArea,
  PlayersGridStats,
} from './PlayersGridView';
export { GenomeDetailView } from './GenomeDetailView';
export type { GenomeDetailViewProps } from './GenomeDetailView';
export { GenomeCompareView } from './GenomeCompareView';
export type {
  GenomeCompareViewProps,
  ComparePlayerOption,
  CompareSeries,
} from './GenomeCompareView';

// ── FocusAreaCard (players slice; player-path consumes) ──────────────────────
export { FocusAreaCard } from './FocusAreaCard';
export type {
  FocusAreaCardProps,
  FocusAreaCardData,
  FocusAreaRole,
  FocusAreaProgressEntry,
} from './FocusAreaCard';

// ── areaTypes (lifted shared vocabulary) ─────────────────────────────────────
export {
  AREA_TYPES,
  getAreaType,
  suggestedMetrics,
  getAreaAutoFill,
  getMetricCurrentValue,
  isLowerIsBetter,
  getProgressPercent,
  LOWER_IS_BETTER_KEYWORDS,
} from './areaTypes';
export type {
  AreaTypeValue,
  AreaTypeConfig,
  AreaAutoFillStats,
  AreaAutoFill,
} from './areaTypes';

// ── useCoachChatSend (the shared optimistic send hook) ───────────────────────
export { useCoachChatSend } from './useCoachChatSend';
export type {
  UseCoachChatSendOptions,
  UseCoachChatSendResult,
  ChatSendResponse,
  ChatMessage,
} from './useCoachChatSend';

// ── Ask surface (ask slice; coach-gated "Ask" tab over /coachhelm/chat) ──────
//   • AskWorkspace        — the two-pane inbox body (renders CoachHelmShell)
//   • AskConversationRail — left rail (snippet/date/origin render only if data)
//   • AskThreadPane       — right pane (embeds ChatComposer + ChatMessageList)
export { AskWorkspace } from './AskWorkspace';
export type { AskWorkspaceProps } from './AskWorkspace';
export { AskConversationRail } from './AskConversationRail';
export type {
  AskConversationRailProps,
  AskConversationOrigin,
  AskOriginKind,
} from './AskConversationRail';
export { AskThreadPane } from './AskThreadPane';
export type { AskThreadPaneProps } from './AskThreadPane';

// ── TeamCategoryLeakBand (Wave 2 · coach Brief "where the team is bleeding
//    strokes" band) — team-wide category rollup over getTeamCategoryInsights'
//    categories[]/teamHealth, mounted at the top of TriageDesk. ────────────
export { TeamCategoryLeakBand } from './TeamCategoryLeakBand';
export type { TeamCategoryLeakBandProps } from './TeamCategoryLeakBand';

// ── Effectiveness surface (phase 3 · coach "Effectiveness" tab) ──────────────
// The "Effectiveness" tab over /golf/dashboard/analytics/coachhelm. Renders the
// CoachHelmShell wrapper itself and consumes the four coachhelm-analytics.ts
// loaders UNCHANGED. Honest InsufficientData — never an authoritative 0%; the
// loop-closer (recordFocusAreaOutcome) is deferred to phase 4.
export { FairwayEffectiveness } from './FairwayEffectiveness';
export type { FairwayEffectivenessProps } from './FairwayEffectiveness';

// ── Signals surface (phase 3 · coach "Signals" tab) ──────────────────────────
// The monolithic FairwayCoachHelmSignals (alerts/insights/patterns discriminated
// union) was deleted 2026-07-22 (dead code purge) — all three routes are
// permanent-redirect shims onto the Signals drill of TriageDesk, which is fed
// by SignalQueue/SignalDossier instead. SignalsToolbar/ScanTeamControl/the
// patternToInsightVocabulary adapter below remain live, reused elsewhere.
export { SignalsToolbar } from './signals/SignalsToolbar';
export type {
  SignalsToolbarProps,
  AppliedFilterChip,
} from './signals/SignalsToolbar';
export { ScanTeamControl } from './signals/ScanTeamControl';
export type { ScanTeamControlProps } from './signals/ScanTeamControl';
export {
  insightToSignalRow,
  patternToSignalRow,
  insightsToSignalRows,
  patternsToSignalRows,
} from './signals/patternToInsightVocabulary';
export type {
  SignalRow,
  SignalSource,
  SignalEvidenceLine,
} from './signals/patternToInsightVocabulary';

// ── Player-path surfaces (phase 5 · the PLAYER shell variant) ────────────────
//   • FairwayPlayerCoachHelm — the player front door over /golf/dashboard/coachhelm.
//     Renders CoachHelmShell role="player" (sub-nav = Brief + My Development),
//     ONE GlassSurface hero (top insight + preserved LLM narrative), a MetricCard
//     row, secondary insights that EXPAND IN PLACE via InsightPanel (kills the
//     "View N more" dead-end), honest InsufficientData for null V3 panels, and a
//     RESERVED/disabled "Ask CoachHelm about this insight" entry (no gate lift).
//     Consumes getPlayerCoachHelmDashboard / getPlayerShotAnalytics /
//     getTopInsightForPlayer / getInsightsForPlayer / getPlayer{Profile,Trend,
//     ShotContext,WhatIf} / rateInsightAsPlayer UNCHANGED (props in; no fetch).
//   • FairwayMyDevelopment   — the player My Development list over
//     /golf/dashboard/my-development. Renders the player CoachHelmShell variant,
//     a FocusAreaCard list (active/completed partition preserved) with REAL
//     source-chip Links + per-area Sparkline (honest InsufficientData when thin),
//     a real error state distinct from empty, and retires the hand-rolled glass.
//     Wires development.ts#updateFocusAreaProgress / completeFocusArea UNCHANGED.
export { FairwayPlayerCoachHelm } from './FairwayPlayerCoachHelm';
export type { FairwayPlayerCoachHelmProps } from './FairwayPlayerCoachHelm';
export { FairwayMyDevelopment } from './FairwayMyDevelopment';
export type { FairwayMyDevelopmentProps } from './FairwayMyDevelopment';
