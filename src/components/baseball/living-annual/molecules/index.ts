/**
 * BaseballHelm "The Living Annual" — L2 MOLECULES.
 *
 * Composed, reused-across-surfaces blocks built strictly from the L1 atom kit
 * (spec: docs/baseball/design-system-living-annual.md §7; map:
 * docs/baseball/ui-migration-map.md L2). Every molecule composes atoms — it
 * never re-implements a rule, numeral, stamp, or seal. Import from this barrel:
 *
 *   import { PlayerRowPlate, RecruitCard, EmptyIssue } from
 *     '@/components/baseball/living-annual/molecules';
 */

// ── Stat composition ──
export { SlashLine } from './SlashLine';
export type { SlashLineProps } from './SlashLine';
export { StatLineStack } from './StatLineStack';
export type { StatLineStackProps } from './StatLineStack';
export { KPIContentsStrip } from './KPIContentsStrip';
export type { KPIContentsStripProps, KPIContentsItem } from './KPIContentsStrip';

// ── Record-book rows ──
export { PlayerRowPlate, PlayerRowPlateHeader } from './PlayerRowPlate';
export type { PlayerRowPlateProps, PlayerRowPlateHeaderProps, PlayerRowStat } from './PlayerRowPlate';

// ── Recruiting (clay lane) ──
export { RecruitCard } from './RecruitCard';
export type { RecruitCardProps, RecruitCardGrade } from './RecruitCard';

// ── Evaluation block ──
export { ToolRailStack } from './ToolRailStack';
export type { ToolRailStackProps, ToolRailStackTool } from './ToolRailStack';
export { GradeStampGrid } from './GradeStampGrid';
export type { GradeStampGridProps, GradeStampGridGrade } from './GradeStampGrid';

// ── Hero + artifact ──
export { CoverHero } from './CoverHero';
export type { CoverHeroProps } from './CoverHero';
export { TearSheet } from './TearSheet';
export type { TearSheetProps, TearSheetPlayer } from './TearSheet';

// ── Composed empty states ──
export { EmptyIssue, EMPTY_ISSUE_PRESETS } from './EmptyIssue';
export type { EmptyIssueProps, EmptyIssueVariant, EmptyIssuePreset } from './EmptyIssue';
