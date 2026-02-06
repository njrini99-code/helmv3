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
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GolfAnnouncementMeta, GolfAnnouncementEnriched } from '@/lib/types/golf';

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
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().min(1, 'Message is required').max(10000),
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
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();
  return team?.id ?? null;
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

export async function createEnrichedAnnouncement(input: {
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

    const teamId = await getCoachTeamId(supabase, coach.organization_id);
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

    // 4. Create inline tasks, link them, and assign to players
    for (let i = 0; i < validated.inlineTasks.length; i++) {
      const task = validated.inlineTasks[i]!;

      // Create the task
      const taskResult = await (supabase
        .from('golf_tasks' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .insert({
          team_id: teamId,
          created_by: coach.id,
          title: task.title,
          description: task.description || null,
          due_date: task.dueDate || null,
          status: 'active',
        })
        .select()
        .single()) as unknown as { data: { id: string } | null; error: { message?: string } | null };

      if (taskResult.error || !taskResult.data) continue;

      const taskId = taskResult.data.id;

      // Link task to announcement
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('golf_announcement_tasks')
        .insert({
          announcement_id: announcementId,
          task_id: taskId,
          sort_order: i,
        });

      // Assign task to target players
      if (targetPlayerIds.length > 0) {
        const assignments = targetPlayerIds.map(pid => ({
          task_id: taskId,
          player_id: pid,
          status: 'pending',
          assigned_at: new Date().toISOString(),
        }));
        await (supabase
          .from('golf_task_assignments' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .insert(assignments)) as unknown as { error: { message?: string } | null };
      }
    }

    revalidatePath('/golf/dashboard/announcements');
    return { success: true, data: { announcementId } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input. Please check your entries.' };
    }
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET ANNOUNCEMENTS WITH META (list view)
// ============================================================================

export async function getAnnouncementsWithMeta(
  teamId: string,
  _userId: string,
  isCoach: boolean,
  playerId?: string | null,
): Promise<ActionResult<GolfAnnouncementMeta[]>> {
  try {
    const supabase = await createClient();

    // Fetch all announcements for this team
    const { data: announcements, error } = await supabase
      .from('golf_announcements')
      .select('*')
      .eq('team_id', teamId)
      .order('published_at', { ascending: false });

    if (error) return { success: false, error: 'Failed to load announcements' };
    if (!announcements || announcements.length === 0) {
      return { success: true, data: [] };
    }

    const announcementIds = announcements.map(a => a.id);

    // Fetch all recipients for these announcements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allRecipients } = await (supabase as any)
      .from('golf_announcement_recipients')
      .select('announcement_id, player_id')
      .in('announcement_id', announcementIds) as { data: Array<{ announcement_id: string; player_id: string }> | null };

    // Fetch all acknowledgements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAcks } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .select('announcement_id, player_id')
      .in('announcement_id', announcementIds) as { data: Array<{ announcement_id: string; player_id: string }> | null };

    // Fetch task counts via announcement_tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAnnTasks } = await (supabase as any)
      .from('golf_announcement_tasks')
      .select('announcement_id, task_id')
      .in('announcement_id', announcementIds) as { data: Array<{ announcement_id: string; task_id: string }> | null };

    // Fetch document counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAnnDocs } = await (supabase as any)
      .from('golf_announcement_documents')
      .select('announcement_id')
      .in('announcement_id', announcementIds) as { data: Array<{ announcement_id: string }> | null };

    // Fetch task assignment completions if we have linked tasks
    const taskIds = (allAnnTasks || []).map(at => at.task_id);
    let completedAssignments: Array<{ task_id: string; status: string }> = [];
    let totalAssignments: Array<{ task_id: string }> = [];
    if (taskIds.length > 0) {
      const { data: assignments } = await (supabase
        .from('golf_task_assignments' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .select('task_id, status')
        .in('task_id', taskIds)) as unknown as { data: Array<{ task_id: string; status: string }> | null };
      totalAssignments = assignments || [];
      completedAssignments = (assignments || []).filter(a => a.status === 'completed');
    }

    // Get total team member count for "all team" announcements
    const teamPlayerIds = await getTeamPlayerIds(supabase, teamId);
    const totalTeamCount = teamPlayerIds.length;

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

// ============================================================================
// GET ANNOUNCEMENT DETAIL (expanded view)
// ============================================================================

export async function getAnnouncementDetail(
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

// ============================================================================
// COMPLETE ANNOUNCEMENT TASK (player action)
// ============================================================================

export async function completeAnnouncementTask(
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
    return { success: true };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// DELETE ANNOUNCEMENT (coach action)
// ============================================================================

export async function deleteAnnouncement(
  announcementId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!coach) return { success: false, error: 'Coach not found' };

    // Verify ownership
    const { data: ann } = await supabase
      .from('golf_announcements')
      .select('id, created_by')
      .eq('id', announcementId)
      .single();

    if (!ann || ann.created_by !== coach.id) {
      return { success: false, error: 'Not authorized to delete this announcement' };
    }

    // CASCADE handles junction tables
    const { error } = await supabase
      .from('golf_announcements')
      .delete()
      .eq('id', announcementId);

    if (error) return { success: false, error: 'Failed to delete announcement' };

    revalidatePath('/golf/dashboard/announcements');
    return { success: true };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
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
