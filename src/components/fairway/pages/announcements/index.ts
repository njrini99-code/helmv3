/**
 * ============================================================================
 * Fairway · pages · announcements — barrel  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The redesigned /golf/dashboard/announcements surfaces:
 *
 *   FairwayAnnouncements             — the role-forked announcements feed page
 *   FairwayCoachAnnouncementCard     — one expandable coach card (detail + delete)
 *   FairwayPlayerAnnouncementCard    — one expandable player card (ack + tasks)
 *   FairwayCreateAnnouncement        — the coach create-announcement trigger + Sheet
 *
 * ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork in
 * announcements/page.tsx. Renders inside the `.fairway-ds` scope on a bg-canvas
 * page.
 * ========================================================================== */

export { FairwayAnnouncements } from './FairwayAnnouncements';
export type { FairwayAnnouncementsProps } from './FairwayAnnouncements';

export { FairwayCoachAnnouncementCard } from './FairwayCoachAnnouncementCard';

export {
  FairwayPlayerAnnouncementCard,
  isUnreadForPlayer,
} from './FairwayPlayerAnnouncementCard';

export { FairwayCreateAnnouncement } from './FairwayCreateAnnouncement';
export type { FairwayCreateAnnouncementProps } from './FairwayCreateAnnouncement';
