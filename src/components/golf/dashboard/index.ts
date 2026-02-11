/**
 * Golf Dashboard Premium Components
 * 
 * Shared UI components for the golf coach and player dashboards.
 * These implement the premium glassmorphism design system.
 * 
 * Usage:
 * ```tsx
 * import {
 *   PremiumGlassCard,
 *   PremiumStatCard,
 *   QuickActionCard,
 *   SectionHeader,
 *   RoundRow,
 *   TopPerformerRow,
 *   containerVariants,
 *   itemVariants
 * } from '@/components/golf/dashboard';
 * ```
 */

export {
    PremiumGlassCard,
    PremiumStatCard,
    QuickActionCard,
    SectionHeader,
    RoundRow,
    RecentRoundCard,
    TopPerformerRow,
    containerVariants,
    itemVariants
} from './premium-components';
export type { RecentRoundCardProps } from './premium-components';

// New bento dashboard components
export { TodayTimeline } from './today-timeline';
export { StatCardSparkline } from './stat-card-sparkline';
export { ActionItemsCard } from './action-items-card';
export { TeamPulseCard } from './team-pulse-card';
export { PerformanceRadar } from './performance-radar';
export { QuickStatRow } from './quick-stat-row';
