/**
 * BaseballHelm "The Living Annual" — FOUNDATION component kit.
 *
 * The consistency engine every redesigned baseball surface composes from
 * (spec: docs/baseball/design-system-living-annual.md §7). Import from this
 * barrel; do not deep-import individual files.
 *
 *   import { RuledStatLine, GradeStamp, EditorsLetter } from '@/components/baseball/living-annual';
 *
 * Components render inside the `.fairway-ds` redesign scope (provided by the
 * shell) and consume the Fairway --fw- tokens plus the baseball-native
 * --clay / --pursuit / --grade / --sodium tokens added in
 * src/styles/baseball-living-annual.css.
 */

// ── Atoms ──
export { RuledStatLine } from './RuledStatLine';
export type { RuledStatLineProps } from './RuledStatLine';
export { StatReadout } from './StatReadout';
export type { StatReadoutProps } from './StatReadout';
export { Eyebrow } from './Eyebrow';
export type { EyebrowProps } from './Eyebrow';
export { Masthead } from './Masthead';
export type { MastheadProps } from './Masthead';
export { SectionMasthead } from './SectionMasthead';
export type { SectionMastheadProps } from './SectionMasthead';
export { HairlineRule } from './HairlineRule';
export type { HairlineRuleProps } from './HairlineRule';
export { PositionChip } from './PositionChip';
export type { PositionChipProps } from './PositionChip';
export { InkBadge } from './InkBadge';
export type { InkBadgeProps } from './InkBadge';
export { AgingBar } from './AgingBar';
export type { AgingBarProps } from './AgingBar';
export { LiveDot } from './LiveDot';
export type { LiveDotProps } from './LiveDot';

// ── Evaluation (recruiting lane) ──
export { GradeStamp } from './GradeStamp';
export type { GradeStampProps } from './GradeStamp';
export { ToolRail } from './ToolRail';
export type { ToolRailProps, ToolRailAthlete } from './ToolRail';

// ── Surfaces ──
export { PaperCard } from './PaperCard';
export type { PaperCardProps } from './PaperCard';
export { ClayCanvas } from './ClayCanvas';
export type { ClayCanvasProps } from './ClayCanvas';
export { Trace } from './Trace';
export type { TraceProps } from './Trace';

// ── Composed states + ceremony ──
export { EditorsLetter } from './EditorsLetter';
export type { EditorsLetterProps } from './EditorsLetter';
export { CommitSeal, PacketSeal } from './CommitSeal';
export type { CommitSealProps } from './CommitSeal';

// ── Shared motion + grade helpers ──
export {
  rulesDraw,
  inkSettles,
  inkColumn,
  stampPress,
  inkBleed,
  traceDraw,
  useSettleStagger,
  EASE_GLIDE,
  EASE_SOFT,
  DUR,
} from './motion';
export {
  gradeColor,
  gradeLabel,
  isPlus,
  GRADE_TEXT_CLASS,
  GRADE_BG_CLASS,
  GRADE_VAR,
} from './grades';
export type { GradeBand } from './grades';
