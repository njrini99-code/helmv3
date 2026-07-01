/**
 * BaseballHelm "The Living Annual" — VIZ MOLECULE layer.
 *
 * The baseball-native data-viz that golf structurally can't do (spec §6 P1 #4 /
 * P2 #8): pitch break + batted-ball spray on the ONE dark ClayCanvas, and the
 * Development "Climb" arc on paper. Every molecule composes the atom kit's
 * `<Trace>` stroke language + honest `<EditorsLetter>` empty states, so an
 * empty feed reads like an unreleased first issue — never a fabricated chart.
 *
 *   import { BreakPlot, SprayChart, ClimbArc } from '@/components/baseball/living-annual/viz';
 */

export { BreakPlot } from './BreakPlot';
export type { BreakPlotProps, BreakPlotPitch } from './BreakPlot';

export { SprayChart } from './SprayChart';
export type { SprayChartProps, SprayBall, SprayOutcome } from './SprayChart';

export { ClimbArc } from './ClimbArc';
export type { ClimbArcProps, ClimbPoint } from './ClimbArc';
