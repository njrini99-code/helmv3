/**
 * Golf Calendar Components
 *
 * Premium calendar UI components for the golf platform.
 * Organized by implementation phase.
 */

// ============================================================================
// PHASE 1: Foundation & Design System
// ============================================================================
export { PremiumEventBlock } from './PremiumEventBlock';

// ============================================================================
// PHASE 2: Event Lifecycle States
// ============================================================================
export { StatusBadge, StatusBadgeWithTooltip } from './StatusBadge';
export { DraftEventCard, DraftEventListItem } from './DraftEventCard';
export { CancellationDialog } from './CancellationDialog';
export {
  EventStatusTimeline,
  CompactStatusTimeline,
  type StatusHistoryEntry,
} from './EventStatusTimeline';

// ============================================================================
// PHASE 3: RSVP System
// ============================================================================
export { RSVPProgressRing, CompactRSVPRing } from './RSVPProgressRing';
export { PlayerRSVPCard, CompactPlayerRSVPCard } from './PlayerRSVPCard';
export {
  RSVPLockIndicator,
  InlineRSVPLock,
  RSVPLockBadge,
} from './RSVPLockIndicator';
export {
  RSVPStatusSection,
  CompactRSVPStatus,
  type RSVPParticipant,
} from './RSVPStatusSection';

// ============================================================================
// PHASE 4: Check-In & Polling
// ============================================================================
export { AttendanceCheckIn, CompactAttendanceSummary } from './AttendanceCheckIn';
export { PlayerAttendanceRow, CompactPlayerAttendanceRow } from './PlayerAttendanceRow';
export { AbsenceReasonSheet, QuickAbsenceReason, type AbsenceData } from './AbsenceReasonSheet';
export { AvailabilityPollGrid, CompactAvailabilityGrid } from './AvailabilityPollGrid';
export {
  AvailabilityCell,
  AvailabilityCellLegend,
  CompactAvailabilityIndicator,
  AvailabilityBar,
} from './AvailabilityCell';
export { PollResultSelector, CompactPollResults } from './PollResultSelector';

// ============================================================================
// PHASE 5: Sync & Feeds
// ============================================================================
export {
  CalendarFeedManager,
  CompactFeedManager,
  type FeedType,
} from './CalendarFeedManager';
export { FeedCard, CompactFeedCard, type CalendarFeed } from './FeedCard';
export { CreateFeedSection, QuickCreateFeed } from './CreateFeedSection';
export {
  SubscriptionInstructions,
  CompactSubscriptionHelp,
} from './SubscriptionInstructions';
export { CalendarSyncButton, CalendarSyncChip } from './CalendarSyncButton';

// ============================================================================
// PHASE 6: Mobile-Optimized Components
// ============================================================================
export {
  MobileRSVPButtons,
  CompactMobileRSVPButtons,
  IconOnlyRSVPButtons,
  type RSVPResponse,
} from './MobileRSVPButtons';
export {
  MobileEventCard,
  CompactMobileEventCard,
  MobileEmptyEventsState,
} from './MobileEventCard';
export { MobileEventSheet, type MobileEventFormData } from './MobileEventSheet';
export {
  MobileCalendarListView,
  MobileWeekListView,
  MobileDayListView,
} from './MobileCalendarListView';

// ============================================================================
// PHASE 7: Enhanced Mobile Components (v2)
// ============================================================================
export {
  RSVPButtonsEnhanced,
  RSVPStatusBadge,
  type RSVPResponseType,
} from './RSVPButtonsEnhanced';
export {
  CalendarDayViewSwipeable,
  MobileWeekPicker,
} from './CalendarDayViewSwipeable';
export {
  QuickAddEventFAB,
  SimpleAddEventFAB,
  MiniAddEventButton,
} from './QuickAddEventFAB';
export {
  MobileCalendarWrapper,
  useIsMobileCalendar,
  ResponsiveCalendarContainer,
} from './MobileCalendarWrapper';
