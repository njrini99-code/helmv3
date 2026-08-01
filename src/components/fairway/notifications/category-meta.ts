/**
 * ============================================================================
 * category-meta — presentation lookup for the notifications feed's category
 * taxonomy (NOTIFICATION_CATEGORY_IDS, derived from DELIVERY_NOTIFICATION_
 * GROUPS). Pure data, no components — icons are Lucide component references
 * (safe to import in either a server or client module).
 * ========================================================================== */

import {
  MessageSquare,
  CalendarClock,
  Megaphone,
  ListChecks,
  Sparkles,
  UserPlus,
  Eye,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationCategoryId } from '@/app/golf/actions/unified-notifications-model';

/** Icon per category. `coachhelm` is the one accent-tinted category (the
 *  flagship AI signal) — every other icon renders in the restrained neutral
 *  chip, matching FairwayWhatsNew's "no rainbow of brand colors" rule. */
export const CATEGORY_ICON: Record<NotificationCategoryId, LucideIcon> = {
  messages: MessageSquare,
  events: CalendarClock,
  announcements: Megaphone,
  tasks: ListChecks,
  coachhelm: Sparkles,
  pipeline: UserPlus,
  profile_views: Eye,
};

/** Compact filter-chip labels (the settings-panel DELIVERY_NOTIFICATION_GROUPS
 *  labels are full sentences like "Events & reminders" — too long for a
 *  Segmented pill). Semantics stay identical to the taxonomy; only the copy
 *  is shortened for this denser surface. */
export const CATEGORY_SHORT_LABEL: Record<NotificationCategoryId, string> = {
  messages: 'Messages',
  events: 'Events',
  announcements: 'Announcements',
  tasks: 'Tasks',
  coachhelm: 'CoachHelm',
  pipeline: 'Recruiting',
  profile_views: 'Profile',
};

/** Fallback icon for anything unexpected — never used in practice since
 *  `category` is always one of the 7 taxonomy ids, but keeps row rendering
 *  defensive against a future category id this map hasn't caught up to. */
const CATEGORY_FALLBACK_ICON: LucideIcon = Bell;

export function categoryIcon(id: NotificationCategoryId): LucideIcon {
  return CATEGORY_ICON[id] ?? CATEGORY_FALLBACK_ICON;
}

export function categoryShortLabel(id: NotificationCategoryId): string {
  return CATEGORY_SHORT_LABEL[id] ?? 'Updates';
}
