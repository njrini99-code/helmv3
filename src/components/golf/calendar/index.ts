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
// PHASE 5: Sync & Feeds (Pending)
// ============================================================================
// export { CalendarFeedManager } from './CalendarFeedManager';
// export { FeedCard } from './FeedCard';
// export { CreateFeedSection } from './CreateFeedSection';
// export { SubscriptionInstructions } from './SubscriptionInstructions';
