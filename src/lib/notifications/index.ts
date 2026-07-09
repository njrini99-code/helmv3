/**
 * Notification System
 *
 * Exports all notification-related functionality.
 */

export * from './types';
export * from './email';
export * from './push';

// Convenience functions for common notifications

import { sendEmailNotification } from './email';

/**
 * Notify player when a coach adds them to watchlist
 */
export async function notifyWatchlistAdd(
  playerId: string,
  playerEmail: string,
  coachName: string,
  schoolName: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('watchlist_add', playerId, playerEmail, {
    coachName,
    schoolName,
    profileUrl: `${baseUrl}/baseball/dashboard/profile`,
  });
}

/**
 * Notify player of a new message
 */
export async function notifyNewMessage(
  recipientId: string,
  recipientEmail: string,
  senderName: string,
  preview: string,
  conversationId: string,
  sport: 'baseball' | 'golf' = 'baseball'
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  // Golf has no /messages/[id] route — deep-link via the ?conversation= query
  // param instead, matching the in-app notification (messages.ts) and push
  // payload (push.ts) forms. Baseball keeps the path-segment route.
  const messageUrl = sport === 'golf'
    ? `${baseUrl}/golf/dashboard/messages?conversation=${conversationId}`
    : `${baseUrl}/baseball/dashboard/messages/${conversationId}`;

  return sendEmailNotification('new_message', recipientId, recipientEmail, {
    senderName,
    preview,
    messageUrl,
  });
}

/**
 * Notify player when their pipeline stage changes
 */
export async function notifyPipelineStageChange(
  playerId: string,
  playerEmail: string,
  schoolName: string,
  newStage: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('pipeline_stage_change', playerId, playerEmail, {
    schoolName,
    newStage,
    journeyUrl: `${baseUrl}/baseball/dashboard/journey`,
  });
}

/**
 * Notify player of a profile view
 */
export async function notifyProfileView(
  playerId: string,
  playerEmail: string,
  viewerInfo: string // "A coach from Texas" or "Coach Mike from Texas A&M"
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('profile_view', playerId, playerEmail, {
    viewerInfo,
    profileUrl: `${baseUrl}/baseball/dashboard/profile`,
  });
}

/**
 * Notify golf team members of a new announcement
 */
export async function notifyTeamAnnouncement(
  recipientId: string,
  recipientEmail: string,
  title: string,
  content: string,
  coachName: string,
  // No /golf/dashboard/announcements/[id] route exists (deleted in W1) — kept
  // for call-site compatibility but unused; link goes to the static list page.
  _announcementId: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('team_announcement', recipientId, recipientEmail, {
    title,
    content,
    coachName,
    announcementUrl: `${baseUrl}/golf/dashboard/announcements`,
  });
}

/**
 * Notify golf players of a new qualifier
 */
export async function notifyQualifierCreated(
  recipientId: string,
  recipientEmail: string,
  qualifierName: string,
  startDate: string,
  numRounds: number,
  qualifierId: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('qualifier_created', recipientId, recipientEmail, {
    qualifierName,
    startDate,
    numRounds,
    qualifierUrl: `${baseUrl}/golf/dashboard/qualifiers/${qualifierId}`,
  });
}

/**
 * Notify golf player when a task is assigned to them
 */
export async function notifyTaskAssigned(
  recipientId: string,
  recipientEmail: string,
  taskTitle: string,
  taskDescription: string | null,
  dueDate: string | null,
  coachName: string,
  taskId: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('task_assigned', recipientId, recipientEmail, {
    taskTitle,
    taskDescription: taskDescription || '',
    dueDate: dueDate || '',
    coachName,
    taskUrl: `${baseUrl}/golf/dashboard/tasks?task=${taskId}`,
  });
}

/**
 * Notify golf player when a development plan / focus area is assigned
 */
export async function notifyDevPlanAssigned(
  recipientId: string,
  recipientEmail: string,
  planTitle: string,
  areaType: string,
  coachName: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return sendEmailNotification('dev_plan_assigned', recipientId, recipientEmail, {
    planTitle,
    areaType,
    coachName,
    planUrl: `${baseUrl}/golf/dashboard/my-development`,
  });
}

