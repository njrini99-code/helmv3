/**
 * ============================================================================
 * Fairway · instrument — the INSTRUMENT SURFACE KIT (local barrel)
 * ----------------------------------------------------------------------------
 * The signature "instrument cluster" material + layout for CoachHelm hero
 * surfaces (the data-viz-as-hero-art direction):
 *
 *   • InstrumentPanel    — the layered frosted-glass instrument bezel (the
 *                          signature surface; base / raised / inset depths).
 *   • InstrumentCluster  — the asymmetric cockpit layout (primary / secondary[]
 *                          / tertiary[] ranking).
 *   • Readout            — the big Fragment-Mono cockpit readout (huge value +
 *                          unit + delta + honest live/awaiting state).
 *
 * ADDITIVE ONLY. Re-exported from the top-level `@/components/fairway` barrel.
 * ========================================================================== */

export {
  InstrumentPanel,
  type InstrumentPanelProps,
  type InstrumentPanelTone,
  type InstrumentPanelDepth,
  type InstrumentPanelPadding,
} from './InstrumentPanel';

export {
  InstrumentCluster,
  type InstrumentClusterProps,
  type ClusterBalance,
  type ClusterTertiaryColumns,
} from './InstrumentCluster';

export {
  Readout,
  type ReadoutProps,
  type ReadoutState,
  type ReadoutSamples,
  type ReadoutDelta,
} from './Readout';
