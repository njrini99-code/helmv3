/**
 * ============================================================================
 * Fairway · pages · calendar — barrel
 * ----------------------------------------------------------------------------
 * The flag-on Calendar SHELL re-skin for /golf/dashboard/calendar. ADDITIVE +
 * GATED — consumed ONLY behind the isRedesignEnabled() fork in
 * `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`. The legacy engine
 * (PremiumCalendarClient grid + DnD + realtime + EventDetailModal) is reused
 * UNCHANGED behind the fork via the existing GolfCalendarWrapper.
 * ========================================================================== */

export { FairwayCalendar, default as FairwayCalendarDefault } from './FairwayCalendar';
export type { FairwayCalendarProps } from './FairwayCalendar';

export { FairwayCalendarHero } from './FairwayCalendarHero';
export type { FairwayCalendarHeroProps } from './FairwayCalendarHero';

export { FairwayDayStrip } from './FairwayDayStrip';
export type { FairwayDayStripProps } from './FairwayDayStrip';

export { FairwayAgendaView } from './FairwayAgendaView';
export type { FairwayAgendaViewProps } from './FairwayAgendaView';

export { FairwayMonthGrid } from './FairwayMonthGrid';
export type { FairwayMonthGridProps, ScheduleOverlay } from './FairwayMonthGrid';

export { FairwayCalendarMemberRail } from './FairwayCalendarMemberRail';
export type { FairwayCalendarMemberRailProps } from './FairwayCalendarMemberRail';

export { FairwayAvailabilityList } from './FairwayAvailabilityList';
export type { FairwayAvailabilityListProps } from './FairwayAvailabilityList';

export { FairwayEventCard } from './FairwayEventCard';
export type { FairwayEventCardProps } from './FairwayEventCard';

export { FairwayEventDetailDrawer } from './FairwayEventDetailDrawer';
export type { FairwayEventDetailDrawerProps } from './FairwayEventDetailDrawer';

export { FairwayEventEditor } from './FairwayEventEditor';
export type { FairwayEventEditorProps } from './FairwayEventEditor';
