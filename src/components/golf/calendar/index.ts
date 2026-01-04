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
// PHASE 4: Check-In & Polling (Pending)
// ============================================================================
// export { AttendanceCheckIn } from './AttendanceCheckIn';
// export { PlayerAttendanceRow } from './PlayerAttendanceRow';
// export { AbsenceReasonSheet } from './AbsenceReasonSheet';
// export { AvailabilityPollGrid } from './AvailabilityPollGrid';
// export { AvailabilityCell } from './AvailabilityCell';
// export { PollResultSelector } from './PollResultSelector';

// ============================================================================
// PHASE 5: Sync & Feeds (Pending)
// ============================================================================
// export { CalendarFeedManager } from './CalendarFeedManager';
// export { FeedCard } from './FeedCard';
// export { CreateFeedSection } from './CreateFeedSection';
// export { SubscriptionInstructions } from './SubscriptionInstructions';
