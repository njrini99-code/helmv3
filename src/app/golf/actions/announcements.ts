'use server';

/**
 * Server Actions for Enhanced Announcements
 *
 * Handles:
 * - Creating announcements with recipients, documents, and tasks
 * - Fetching enriched announcement data for coach and player views
 * - Task completion by players
 * - Acknowledgement (delegates to communication.ts)
 * - Deleting announcements
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { notifyTeamAnnouncement } from '@/lib/notifications';
import { sendBulkPushNotification } from '@/lib/notifications/push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { validateCoachTeamAccess } from '@/lib/golf/resolve-team';
import type { GolfAnnouncementMeta, GolfAnnouncementEnriched } from '@/lib/types/golf';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Hard bound on the announcements feed (P275). PostgREST hard-caps any query at
 * 1000 rows, so an unbounded `.select()` on a long-lived team would silently
 * truncate at row 1000 in driver-order — corrupting recentCount / totals. We
 * cap the feed at the 200 most-recent (newest-first) so the result is bounded
 * AND deterministic: the rows shown are always the freshest, and "this week"
 * recency is unaffected (recent rows always sort to the top).
 */
const ANNOUNCEMENTS_FEED_LIMIT = 200;

/**
 * Defensive cap on the per-announcement junction fan-out reads (recipients /
 * acks / tasks / docs / assignments). With the feed bounded to 200 rows these
 * `.in()` reads are already small for realistic teams, but an explicit limit
 * keeps us honestly inside the 1000-row PostgREST cap at 10x data instead of
 * silently truncating mid-set.
 */
const ANNOUNCEMENTS_FANOUT_LIMIT = 1000;

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  body: z.string().min(1, 'Message is required').max(10000, 'Message must be 10,000 characters or fewer'),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']),
  requiresAcknowledgement: z.boolean(),
  recipientPlayerIds: z.array(z.string().uuid()).nullable(), // null = all team
  documentIds: z.array(z.string().uuid()),
  inlineTasks: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    dueDate: z.string().optional(),
  })),
});

// ============================================================================
// HELPERS
// ============================================================================

async function getCoachTeamId(
  supabase: SupabaseClient,
  organizationId: string | null,
  coachId: string | null
): Promise<string | null> {
  // Cookie-aware: honours the program head's golf_active_team selection
  // (validated server-side) so coach WRITES target the toggled team.
  return resolveCoachTeamIdWithCookie(supabase, organizationId, coachId);
}

async function getTeamPlayerIds(
  supabase: SupabaseClient,
  teamId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');
  return (data || []).map(m => m.player_id);
}

// ============================================================================
// CREATE ENRICHED ANNOUNCEMENT
// ============================================================================

async function createEnrichedAnnouncementImpl(input: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
  recipientPlayerIds: string[] | null;
  documentIds: string[];
  inlineTasks: Array<{ title: string; description?: string; dueDate?: string }>;
}): Promise<ActionResult<{ announcementId: string }>> {
  try {
    const validated = createAnnouncementSchema.parse(input);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();
    if (!coach) return { success: false, error: 'Coach profile not found' };

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) return { success: false, error: 'Coach not assigned to a team' };

    // 1. Create the announcement
    const { data: announcement, error: annError } = await supabase
      .from('golf_announcements')
      .insert({
        team_id: teamId,
        title: validated.title,
        body: validated.body,
        urgency: validated.urgency,
        requires_acknowledgement: validated.requiresAcknowledgement,
        send_push: false,
        send_email: false,
        published_at: new Date().toISOString(),
        created_by: coach.id,
      })
      .select()
      .single();

    if (annError || !announcement) {
      return { success: false, error: 'Failed to create announcement' };
    }

    const announcementId = announcement.id;

    // Determine target players for task assignments
    const targetPlayerIds = validated.recipientPlayerIds
      ? validated.recipientPlayerIds
      : await getTeamPlayerIds(supabase, teamId);

    // 2. Insert recipients (only if specific players selected)
    if (validated.recipientPlayerIds && validated.recipientPlayerIds.length > 0) {
      const recipientRows = validated.recipientPlayerIds.map(pid => ({
        announcement_id: announcementId,
        player_id: pid,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('golf_announcement_recipients')
        .insert(recipientRows);
    }

    // 3. Link documents
    if (validated.documentIds.length > 0) {
      const docRows = validated.documentIds.map((docId, i) => ({
        announcement_id: announcementId,
        document_id: docId,
        sort_order: i,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('golf_announcement_documents')
        .insert(docRows);
    }

    // 4. Create inline tasks, link them, and assign to players.
    // F097: batched. The previous loop did, per task, a serial round-trip set
    // (insert task → insert link → insert assignments). For T tasks on a P-player
    // team that was up to T×(2 + …) sequential queries. We now insert ALL tasks
    // in one call, ALL announcement links in one call, and ALL assignments in
    // one call — keeping the same data shape and the same sort_order semantics.
    if (validated.inlineTasks.length > 0) {
      const taskRows = validated.inlineTasks.map(task => ({
        team_id: teamId,
        created_by: coach.id,
        title: task.title,
        description: task.description || null,
        due_date: task.dueDate || null,
        status: 'active',
      }));

      // Bulk insert tasks, returning ids in insertion order so we can map them
      // back to their sort_order index.
      const insertedTasksResult = await (supabase
        .from('golf_tasks' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .insert(taskRows)
        .select('id')) as unknown as { data: Array<{ id: string }> | null; error: { message?: string } | null };

      const insertedTaskIds = (insertedTasksResult.data || []).map(t => t.id);

      if (insertedTaskIds.length > 0) {
        // Link every task to the announcement in one insert (index = sort_order).
        const linkRows = insertedTaskIds.map((taskId, i) => ({
          announcement_id: announcementId,
          task_id: taskId,
          sort_order: i,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('golf_announcement_tasks')
          .insert(linkRows);

        // Assign every task to every target player in one insert.
        if (targetPlayerIds.length > 0) {
          const assignedAt = new Date().toISOString();
          const assignmentRows = insertedTaskIds.flatMap(taskId =>
            targetPlayerIds.map(pid => ({
              task_id: taskId,
              player_id: pid,
              status: 'pending',
              assigned_at: assignedAt,
            }))
          );
          await (supabase
            .from('golf_task_assignments' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
            .insert(assignmentRows)) as unknown as { error: { message?: string } | null };
        }
      }
    }

    // 5. Send email + push notifications to target players (fire-and-forget).
    // F096: the row is inserted with send_email/send_push = false, but this
    // block actually DOES dispatch both — so the persisted flags lied about
    // delivery. Track what really fired and reconcile the flags below.
    let emailSent = false;
    let pushSent = false;
    try {
      const { data: coachProfile } = await supabase
        .from('golf_coaches')
        .select('full_name')
        .eq('id', coach.id)
        .single();

      const coachName = coachProfile?.full_name?.trim() || 'Your Coach';

      if (targetPlayerIds.length > 0) {
        // Get user_ids for target players
        const { data: playerRows } = await supabase
          .from('golf_players')
          .select('user_id')
          .in('id', targetPlayerIds);

        if (playerRows && playerRows.length > 0) {
          const userIds = playerRows.map(p => p.user_id);

          // Get emails for those users
          const { data: userRows } = await supabase
            .from('users')
            .select('id, email')
            .in('id', userIds);

          if (userRows) {
            // Non-blocking: notify all players in parallel. send_email reflects
            // whether at least one addressable recipient was emailed.
            const emailResults = await Promise.allSettled(
              userRows.map(u =>
                u.email
                  ? notifyTeamAnnouncement(u.id, u.email, validated.title, validated.body, coachName, announcementId)
                  : Promise.resolve()
              )
            );
            emailSent = userRows.some(u => !!u.email) &&
              emailResults.some(r => r.status === 'fulfilled');

            // Send push notifications
            const recipientUserIdsForPush = userRows.map(u => u.id);
            if (recipientUserIdsForPush.length > 0) {
              await sendBulkPushNotification('team_announcement', recipientUserIdsForPush, {
                title: validated.title,
                content: validated.body,
              });
              pushSent = true;
            }
          }
        }
      }
    } catch (notifErr) {
      // Never block announcement creation on notification failure
      await logServerError(`[createAnnouncement] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'announcements.createEnrichedAnnouncement' });
    }

    // Reconcile the persisted delivery flags with what actually dispatched
    // (F096). Best-effort: a failure here must not fail the create.
    if (emailSent || pushSent) {
      await supabase
        .from('golf_announcements')
        .update({ send_email: emailSent, send_push: pushSent })
        .eq('id', announcementId);
    }

    revalidatePath('/golf/dashboard/announcements');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true, data: { announcementId } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      // Surface the specific offending field + its constraint (Nielsen #9 —
      // help users recover from errors) instead of a generic catch-all toast.
      const issue = error.issues[0];
      return {
        success: false,
        error: issue?.message
          ? issue.message
          : 'Invalid input. Please check your entries.',
      };
    }
    return formatSafeErrorResponse(error);
  }
}

const observedCreateEnrichedAnnouncement = withAdminObserved(
  'createEnrichedAnnouncement',
  { sport: 'golf', feature: 'announcements' },
  createEnrichedAnnouncementImpl,
);

export async function createEnrichedAnnouncement(input: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
  recipientPlayerIds: string[] | null;
  documentIds: string[];
  inlineTasks: Array<{ title: string; description?: string; dueDate?: string }>;
}): Promise<ActionResult<{ announcementId: string }>> {
  return observedCreateEnrichedAnnouncement(input);
}

// ============================================================================
// GET ANNOUNCEMENTS WITH META (list view)
// ============================================================================

async function getAnnouncementsWithMetaImpl(
  teamId: string,
  _userId: string,
  isCoach: boolean,
  playerId?: string | null,
): Promise<ActionResult<GolfAnnouncementMeta[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Verify team membership - check coach or player association
    const { data: coachCheck } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: playerCheck } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coachCheck) {
      // Staff-strict: authorize the coach iff staffed on the requested team
      // (a program head on both men's & women's can read either), instead of
      // authorizing ANY same-org team. Not tied to the active-team toggle.
      const coachAuthorized = await validateCoachTeamAccess(supabase, coachCheck.id, teamId, coachCheck.organization_id);
      if (!coachAuthorized && !playerCheck) {
        return { success: false, error: 'Not authorized for this team' };
      }
    } else if (playerCheck) {
      const { data: memberCheck } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('player_id', playerCheck.id)
        .eq('team_id', teamId)
        .eq('status', 'active')
        .maybeSingle();
      if (!memberCheck) {
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Not authorized for this team' };
    }

    // Fetch the most-recent announcements for this team. Bounded (P275): an
    // unbounded select silently truncates at PostgREST's 1000-row cap in
    // driver-order; the .limit() makes the cut deterministic (freshest first).
    const { data: announcements, error } = await supabase
      .from('golf_announcements')
      .select('*')
      .eq('team_id', teamId)
      .order('published_at', { ascending: false })
      .limit(ANNOUNCEMENTS_FEED_LIMIT);

    if (error) return { success: false, error: 'Failed to load announcements' };
    if (!announcements || announcements.length === 0) {
      return { success: true, data: [] };
    }

    const announcementIds = announcements.map(a => a.id);

    // Fetch all recipients for these announcements (P275: bounded fan-out)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allRecipients } = await (supabase as any)
      .from('golf_announcement_recipients')
      .select('announcement_id, player_id')
      .in('announcement_id', announcementIds)
      .limit(ANNOUNCEMENTS_FANOUT_LIMIT) as { data: Array<{ announcement_id: string; player_id: string }> | null };

    // Fetch all acknowledgements (P275: bounded fan-out)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAcks } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .select('announcement_id, player_id')
      .in('announcement_id', announcementIds)
      .limit(ANNOUNCEMENTS_FANOUT_LIMIT) as { data: Array<{ announcement_id: string; player_id: string }> | null };

    // Fetch task counts via announcement_tasks (P275: bounded fan-out)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAnnTasks } = await (supabase as any)
      .from('golf_announcement_tasks')
      .select('announcement_id, task_id')
      .in('announcement_id', announcementIds)
      .limit(ANNOUNCEMENTS_FANOUT_LIMIT) as { data: Array<{ announcement_id: string; task_id: string }> | null };

    // Fetch document counts (P275: bounded fan-out)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAnnDocs } = await (supabase as any)
      .from('golf_announcement_documents')
      .select('announcement_id')
      .in('announcement_id', announcementIds)
      .limit(ANNOUNCEMENTS_FANOUT_LIMIT) as { data: Array<{ announcement_id: string }> | null };

    // Fetch task assignment completions if we have linked tasks.
    // F098: scope the read EXPLICITLY by player_id for the player view. A coach
    // sees the whole team's progress (task_count / completed_task_count are team
    // aggregates), but a player must see only THEIR own assignment status —
    // otherwise their announcement card showed teammates' task counts/completions.
    const taskIds = (allAnnTasks || []).map(at => at.task_id);
    let completedAssignments: Array<{ task_id: string; status: string }> = [];
    let totalAssignments: Array<{ task_id: string }> = [];
    if (taskIds.length > 0) {
      let assignmentsQuery = (supabase
        .from('golf_task_assignments' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .select('task_id, status')
        .in('task_id', taskIds)
        .limit(ANNOUNCEMENTS_FANOUT_LIMIT)); // P275: bounded fan-out
      if (!isCoach && playerId) {
        assignmentsQuery = assignmentsQuery.eq('player_id', playerId);
      }
      const { data: assignments } = await assignmentsQuery as unknown as { data: Array<{ task_id: string; status: string }> | null };
      totalAssignments = assignments || [];
      completedAssignments = (assignments || []).filter(a => a.status === 'completed');
    }

    // Get total team member count for "all team" announcements
    const teamPlayerIds = await getTeamPlayerIds(supabase, teamId);
    const totalTeamCount = teamPlayerIds.length;

    // Fetch player info for acknowledged players (for avatar display)
    const allAckPlayerIds = [...new Set((allAcks || []).map(a => a.player_id))];
    const ackPlayerMap: Record<string, { player_id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }> = {};
    if (isCoach && allAckPlayerIds.length > 0) {
      const { data: ackPlayers } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url')
        .in('id', allAckPlayerIds);
      if (ackPlayers) {
        for (const p of ackPlayers) {
          ackPlayerMap[p.id] = { player_id: p.id, first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url };
        }
      }
    }

    // Build meta for each announcement
    const recipientsByAnn = groupBy(allRecipients || [], 'announcement_id');
    const acksByAnn = groupBy(allAcks || [], 'announcement_id');
    const tasksByAnn = groupBy(allAnnTasks || [], 'announcement_id');
    const docsByAnn = groupBy(allAnnDocs || [], 'announcement_id');

    const enriched: GolfAnnouncementMeta[] = announcements.map(ann => {
      const recipients = recipientsByAnn[ann.id] || [];
      const acks = acksByAnn[ann.id] || [];
      const annTaskLinks = tasksByAnn[ann.id] || [];
      const annDocs = docsByAnn[ann.id] || [];

      const isAllTeam = recipients.length === 0;
      const totalRecipients = isAllTeam ? totalTeamCount : recipients.length;

      // Count tasks and completions for this announcement's tasks
      const annTaskIds = annTaskLinks.map(t => t.task_id);
      const annAssignments = totalAssignments.filter(a => annTaskIds.includes(a.task_id));
      const annCompleted = completedAssignments.filter(a => annTaskIds.includes(a.task_id));

      // Get acknowledged player info (first 5 for avatar stack)
      const acknowledgedPlayers = isCoach
        ? acks.slice(0, 5).map(a => ackPlayerMap[a.player_id]).filter((p): p is NonNullable<typeof p> => !!p)
        : undefined;

      return {
        ...ann,
        recipient_count: recipients.length,
        acknowledged_count: acks.length,
        total_recipients: totalRecipients,
        task_count: annAssignments.length,
        completed_task_count: annCompleted.length,
        document_count: annDocs.length,
        has_player_acknowledged: !isCoach && playerId
          ? acks.some(a => a.player_id === playerId)
          : undefined,
        acknowledged_players: acknowledgedPlayers,
      };
    });

    // For players, filter to only show announcements they're a recipient of (or all-team)
    if (!isCoach && playerId) {
      const filtered = enriched.filter(ann => {
        const recipients = recipientsByAnn[ann.id] || [];
        if (recipients.length === 0) return true; // all team
        return recipients.some(r => r.player_id === playerId);
      });
      return { success: true, data: filtered };
    }

    return { success: true, data: enriched };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

const observedGetAnnouncementsWithMeta = withAdminObserved(
  'getAnnouncementsWithMeta',
  { sport: 'golf', feature: 'announcements' },
  getAnnouncementsWithMetaImpl,
);

export async function getAnnouncementsWithMeta(
  teamId: string,
  _userId: string,
  isCoach: boolean,
  playerId?: string | null,
): Promise<ActionResult<GolfAnnouncementMeta[]>> {
  return observedGetAnnouncementsWithMeta(teamId, _userId, isCoach, playerId);
}

// ============================================================================
// GET ANNOUNCEMENT DETAIL (expanded view)
// ============================================================================

async function getAnnouncementDetailImpl(
  announcementId: string
): Promise<ActionResult<GolfAnnouncementEnriched>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Fetch announcement
    const { data: ann, error } = await supabase
      .from('golf_announcements')
      .select('*')
      .eq('id', announcementId)
      .single();

    if (error || !ann) return { success: false, error: 'Announcement not found' };

    // Verify team membership - check coach or player association
    const { data: coachCheck } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: playerCheck } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coachCheck) {
      // Staff-strict: authorize the coach iff staffed on the announcement's team.
      const coachAuthorized = await validateCoachTeamAccess(supabase, coachCheck.id, ann.team_id, coachCheck.organization_id);
      if (!coachAuthorized && !playerCheck) {
        return { success: false, error: 'Not authorized for this team' };
      }
    } else if (playerCheck) {
      const { data: memberCheck } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('player_id', playerCheck.id)
        .eq('team_id', ann.team_id)
        .eq('status', 'active')
        .maybeSingle();
      if (!memberCheck) {
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Not authorized for this team' };
    }

    // Fetch recipients with player info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recipients } = await (supabase as any)
      .from('golf_announcement_recipients')
      .select('player_id')
      .eq('announcement_id', announcementId) as { data: Array<{ player_id: string }> | null };

    const recipientPlayerIds = (recipients || []).map(r => r.player_id);
    let recipientPlayers: Array<{ id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }> = [];
    if (recipientPlayerIds.length > 0) {
      const { data: players } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url')
        .in('id', recipientPlayerIds);
      recipientPlayers = players || [];
    }

    const enrichedRecipients = (recipients || []).map(r => ({
      player_id: r.player_id,
      player: recipientPlayers.find(p => p.id === r.player_id) || null,
    }));

    // Fetch documents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: annDocs } = await (supabase as any)
      .from('golf_announcement_documents')
      .select('id, document_id, sort_order')
      .eq('announcement_id', announcementId)
      .order('sort_order', { ascending: true }) as { data: Array<{ id: string; document_id: string; sort_order: number }> | null };

    const docIds = (annDocs || []).map(d => d.document_id);
    let docDetails: Array<{ id: string; title: string; file_url: string; file_type: string; file_size: number }> = [];
    if (docIds.length > 0) {
      const { data } = await supabase
        .from('golf_documents')
        .select('id, title, file_url, file_type, file_size')
        .in('id', docIds);
      docDetails = (data || []) as Array<{ id: string; title: string; file_url: string; file_type: string; file_size: number }>;
    }

    const enrichedDocs = (annDocs || []).map(d => ({
      ...d,
      document: docDetails.find(doc => doc.id === d.document_id) || null,
    }));

    // Fetch tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: annTasks } = await (supabase as any)
      .from('golf_announcement_tasks')
      .select('id, task_id, sort_order')
      .eq('announcement_id', announcementId)
      .order('sort_order', { ascending: true }) as { data: Array<{ id: string; task_id: string; sort_order: number }> | null };

    const taskIds = (annTasks || []).map(t => t.task_id);
    interface TaskDetail { id: string; title: string; description: string | null; due_date: string | null }
    let taskDetails: TaskDetail[] = [];
    if (taskIds.length > 0) {
      const { data } = await (supabase
        .from('golf_tasks' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .select('id, title, description, due_date')
        .in('id', taskIds)) as unknown as { data: TaskDetail[] | null };
      taskDetails = data || [];
    }

    // Fetch task assignments with player info
    interface TaskAssignment { id: string; task_id: string; player_id: string; status: string; completed_at: string | null }
    let allAssignments: TaskAssignment[] = [];
    if (taskIds.length > 0) {
      const { data } = await (supabase
        .from('golf_task_assignments' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .select('id, task_id, player_id, status, completed_at')
        .in('task_id', taskIds)) as unknown as { data: TaskAssignment[] | null };
      allAssignments = data || [];
    }

    // Get player info for assignments
    const assignmentPlayerIds = [...new Set(allAssignments.map(a => a.player_id))];
    let assignmentPlayers: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
    if (assignmentPlayerIds.length > 0) {
      const { data } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .in('id', assignmentPlayerIds);
      assignmentPlayers = data || [];
    }

    const enrichedTasks = (annTasks || []).map(at => ({
      ...at,
      task: taskDetails.find(t => t.id === at.task_id) || null,
      assignments: allAssignments
        .filter(a => a.task_id === at.task_id)
        .map(a => ({
          ...a,
          player: assignmentPlayers.find(p => p.id === a.player_id) || null,
        })),
    }));

    // Fetch acknowledgements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: acks } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .select('id, announcement_id, player_id, acknowledged_at')
      .eq('announcement_id', announcementId)
      .order('acknowledged_at', { ascending: false }) as { data: Array<{ id: string; announcement_id: string; player_id: string; acknowledged_at: string }> | null };

    // Fetch player info for acknowledgements (names + avatars)
    const ackPlayerIds = [...new Set((acks || []).map(a => a.player_id))];
    const ackPlayerInfoMap: Record<string, { first_name: string | null; last_name: string | null; avatar_url: string | null }> = {};
    if (ackPlayerIds.length > 0) {
      const { data: ackPlayers } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url')
        .in('id', ackPlayerIds);
      if (ackPlayers) {
        for (const p of ackPlayers) {
          ackPlayerInfoMap[p.id] = { first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url };
        }
      }
    }

    // Get total recipients for progress tracking
    const isAllTeam = (recipients || []).length === 0;
    let totalRecipients = 0;
    if (isAllTeam) {
      const teamPlayerIds = await getTeamPlayerIds(supabase, ann.team_id);
      totalRecipients = teamPlayerIds.length;
    } else {
      totalRecipients = (recipients || []).length;
    }

    // Calculate task stats
    const taskCount = allAssignments.length;
    const completedTaskCount = allAssignments.filter(a => a.status === 'completed').length;

    const enriched: GolfAnnouncementEnriched = {
      ...ann,
      recipients: enrichedRecipients,
      documents: enrichedDocs,
      tasks: enrichedTasks,
      acknowledgements: (acks || []).map(a => ({
        id: a.id,
        announcement_id: a.announcement_id,
        player_id: a.player_id,
        acknowledged_at: a.acknowledged_at,
        player: ackPlayerInfoMap[a.player_id] || null,
      })),
      total_recipients: totalRecipients,
      acknowledged_count: (acks || []).length,
      task_count: taskCount,
      completed_task_count: completedTaskCount,
    };

    return { success: true, data: enriched };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

const observedGetAnnouncementDetail = withAdminObserved(
  'getAnnouncementDetail',
  { sport: 'golf', feature: 'announcements' },
  getAnnouncementDetailImpl,
);

export async function getAnnouncementDetail(
  announcementId: string
): Promise<ActionResult<GolfAnnouncementEnriched>> {
  return observedGetAnnouncementDetail(announcementId);
}

// ============================================================================
// COMPLETE ANNOUNCEMENT TASK (player action)
// ============================================================================

async function completeAnnouncementTaskImpl(
  taskId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!player) return { success: false, error: 'Player not found' };

    // Update the assignment status
    const { error } = await (supabase
      .from('golf_task_assignments' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('task_id', taskId)
      .eq('player_id', player.id)) as unknown as { error: { message?: string } | null };

    if (error) return { success: false, error: 'Failed to complete task' };

    revalidatePath('/golf/dashboard/announcements');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

const observedCompleteAnnouncementTask = withAdminObserved(
  'completeAnnouncementTask',
  { sport: 'golf', feature: 'announcements' },
  completeAnnouncementTaskImpl,
);

export async function completeAnnouncementTask(
  taskId: string
): Promise<ActionResult> {
  return observedCompleteAnnouncementTask(taskId);
}

// ============================================================================
// DELETE ANNOUNCEMENT (coach action)
// ============================================================================

async function deleteAnnouncementImpl(
  announcementId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();
    if (!coach) return { success: false, error: 'Coach not found' };

    // Load the announcement's team so we can authorize by team access.
    const { data: ann } = await supabase
      .from('golf_announcements')
      .select('id, team_id')
      .eq('id', announcementId)
      .single();

    if (!ann) {
      return { success: false, error: 'Announcement not found' };
    }

    // F036/F037: authorize ANY coach staffed on the announcement's team, not
    // only the original author. Co-coaches (e.g. an assistant, or a program
    // head over both men's & women's) could previously never delete an
    // announcement a colleague posted, since the check was created_by === coach.id.
    const authorized = await validateCoachTeamAccess(supabase, coach.id, ann.team_id, coach.organization_id);
    if (!authorized) {
      return { success: false, error: 'Not authorized to delete this announcement' };
    }

    // CASCADE handles junction tables
    const { error } = await supabase
      .from('golf_announcements')
      .delete()
      .eq('id', announcementId);

    if (error) return { success: false, error: 'Failed to delete announcement' };

    revalidatePath('/golf/dashboard/announcements');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

const observedDeleteAnnouncement = withAdminObserved(
  'deleteAnnouncement',
  { sport: 'golf', feature: 'announcements' },
  deleteAnnouncementImpl,
);

export async function deleteAnnouncement(
  announcementId: string
): Promise<ActionResult> {
  return observedDeleteAnnouncement(announcementId);
}

// ============================================================================
// HELPER: Group array by key
// ============================================================================

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
