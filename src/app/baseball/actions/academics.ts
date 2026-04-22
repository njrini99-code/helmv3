'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface BaseballPlayerClass {
  id: string;
  player_id: string;
  team_id: string | null;
  class_name: string;
  instructor: string | null;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  semester: string | null;
  color: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BaseballAcademicEligibility {
  id: string;
  player_id: string;
  team_id: string | null;
  semester: string | null;
  gpa: number | null;
  credits_completed: number | null;
  credits_required: number | null;
  is_eligible: boolean;
  academic_standing: 'good' | 'warning' | 'probation' | null;
  notes: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const addClassSchema = z.object({
  player_id: z.string().uuid(),
  team_id: z.string().uuid().optional().nullable(),
  class_name: z.string().min(1, 'Class name is required').max(200),
  instructor: z.string().max(200).optional().nullable(),
  days: z.array(z.string()).optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  building: z.string().max(200).optional().nullable(),
  room: z.string().max(100).optional().nullable(),
  credits: z.number().min(0).max(12).optional().nullable(),
  semester: z.string().max(50).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const eligibilitySchema = z.object({
  player_id: z.string().uuid(),
  team_id: z.string().uuid().optional().nullable(),
  semester: z.string().max(50).optional().nullable(),
  gpa: z.number().min(0).max(4).optional().nullable(),
  credits_completed: z.number().min(0).optional().nullable(),
  credits_required: z.number().min(0).optional().nullable(),
  is_eligible: z.boolean(),
  academic_standing: z.enum(['good', 'warning', 'probation']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ============================================================================
// COACH: TEAM ACADEMICS
// ============================================================================

export async function getTeamAcademics(teamId: string) {
  const supabase = await createClient();

  // Get team members with player info
  const { data: members, error: membersError } = await supabase
    .from('baseball_team_members')
    .select(`
      id,
      player_id,
      baseball_players (
        id,
        first_name,
        last_name,
        avatar_url,
        primary_position,
        grad_year,
        gpa
      )
    `)
    .eq('team_id', teamId);

  if (membersError) {
    console.error('[Baseball Academics] Team members error:', membersError);
    return { success: false as const, error: 'Failed to load team data.' };
  }

  // Get eligibility records for all players
  const playerIds = (members || []).map(m => m.player_id).filter(Boolean);
  let eligibilityRecords: BaseballAcademicEligibility[] = [];

  if (playerIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eligData } = await (supabase as any)
      .from('baseball_academic_eligibility')
      .select('*')
      .in('player_id', playerIds);
    eligibilityRecords = (eligData || []) as BaseballAcademicEligibility[];
  }

  // Get class counts per player
  let classCounts: Record<string, number> = {};
  if (playerIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: classData } = await (supabase as any)
      .from('baseball_player_classes')
      .select('player_id')
      .in('player_id', playerIds);

    if (classData) {
      classCounts = (classData as { player_id: string }[]).reduce((acc, c) => {
        acc[c.player_id] = (acc[c.player_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }

  type PlayerData = {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
    primary_position?: string | null;
    grad_year?: number | null;
    gpa?: number | null;
  };

  const teamData = (members || []).map(m => {
    const player = m.baseball_players as PlayerData | null;
    const eligibility = eligibilityRecords.find(e => e.player_id === m.player_id);
    return {
      member_id: m.id,
      player_id: m.player_id,
      first_name: player?.first_name || null,
      last_name: player?.last_name || null,
      avatar_url: player?.avatar_url || null,
      primary_position: player?.primary_position || null,
      grad_year: player?.grad_year || null,
      gpa: eligibility?.gpa ?? player?.gpa ?? null,
      credits_completed: eligibility?.credits_completed ?? null,
      credits_required: eligibility?.credits_required ?? 60,
      is_eligible: eligibility?.is_eligible ?? true,
      academic_standing: eligibility?.academic_standing ?? 'good' as const,
      class_count: classCounts[m.player_id] || 0,
      eligibility_id: eligibility?.id ?? null,
    };
  });

  return { success: true as const, data: teamData };
}

// ============================================================================
// PLAYER: CLASSES
// ============================================================================

export async function getPlayerClasses(playerId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_player_classes')
    .select('*')
    .eq('player_id', playerId)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[Baseball Academics] Fetch classes error:', error);
    return { success: false as const, error: 'Failed to load classes.' };
  }

  return { success: true as const, data: (data || []) as BaseballPlayerClass[] };
}

export async function addPlayerClass(playerId: string, data: {
  class_name: string;
  instructor?: string;
  days?: string[];
  start_time?: string;
  end_time?: string;
  building?: string;
  room?: string;
  credits?: number;
  semester?: string;
  color?: string;
  team_id?: string;
  notes?: string;
}) {
  try {
    const validated = addClassSchema.parse({
      player_id: playerId,
      team_id: data.team_id || null,
      class_name: data.class_name,
      instructor: data.instructor || null,
      days: data.days || null,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      building: data.building || null,
      room: data.room || null,
      credits: data.credits ?? null,
      semester: data.semester || null,
      color: data.color || null,
      notes: data.notes || null,
    });

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from('baseball_player_classes')
      .insert(validated)
      .select()
      .single();

    if (error) {
      console.error('[Baseball Academics] Add class error:', error);
      return { success: false as const, error: 'Failed to add class.' };
    }

    revalidatePath('/baseball/dashboard/academics');
    return { success: true as const, data: created as BaseballPlayerClass };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    console.error('[Baseball Academics] Unexpected error:', err);
    return { success: false as const, error: 'An unexpected error occurred.' };
  }
}

export async function updatePlayerClass(classId: string, data: {
  class_name?: string;
  instructor?: string | null;
  days?: string[] | null;
  start_time?: string | null;
  end_time?: string | null;
  building?: string | null;
  room?: string | null;
  credits?: number | null;
  semester?: string | null;
  color?: string | null;
  notes?: string | null;
}) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (supabase as any)
    .from('baseball_player_classes')
    .update(data)
    .eq('id', classId)
    .select()
    .single();

  if (error) {
    console.error('[Baseball Academics] Update class error:', error);
    return { success: false as const, error: 'Failed to update class.' };
  }

  revalidatePath('/baseball/dashboard/academics');
  return { success: true as const, data: updated as BaseballPlayerClass };
}

export async function deletePlayerClass(classId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_player_classes')
    .delete()
    .eq('id', classId);

  if (error) {
    console.error('[Baseball Academics] Delete class error:', error);
    return { success: false as const, error: 'Failed to delete class.' };
  }

  revalidatePath('/baseball/dashboard/academics');
  return { success: true as const };
}

// ============================================================================
// COACH: ELIGIBILITY
// ============================================================================

export async function getTeamEligibility(teamId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_academic_eligibility')
    .select('*')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[Baseball Academics] Eligibility error:', error);
    return { success: false as const, error: 'Failed to load eligibility data.' };
  }

  return { success: true as const, data: (data || []) as BaseballAcademicEligibility[] };
}

export async function updateEligibility(id: string, data: {
  gpa?: number | null;
  credits_completed?: number | null;
  credits_required?: number | null;
  is_eligible?: boolean;
  academic_standing?: 'good' | 'warning' | 'probation' | null;
  notes?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'Unauthorized' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (supabase as any)
    .from('baseball_academic_eligibility')
    .update({ ...data, updated_by: user.id })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[Baseball Academics] Update eligibility error:', error);
    return { success: false as const, error: 'Failed to update eligibility.' };
  }

  revalidatePath('/baseball/dashboard/academics');
  return { success: true as const, data: updated as BaseballAcademicEligibility };
}

export async function createEligibilityRecord(playerId: string, data: {
  team_id?: string;
  semester?: string;
  gpa?: number;
  credits_completed?: number;
  credits_required?: number;
  is_eligible: boolean;
  academic_standing?: 'good' | 'warning' | 'probation';
  notes?: string;
}) {
  try {
    const validated = eligibilitySchema.parse({
      player_id: playerId,
      team_id: data.team_id || null,
      semester: data.semester || null,
      gpa: data.gpa ?? null,
      credits_completed: data.credits_completed ?? null,
      credits_required: data.credits_required ?? null,
      is_eligible: data.is_eligible,
      academic_standing: data.academic_standing || null,
      notes: data.notes || null,
    });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false as const, error: 'Unauthorized' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from('baseball_academic_eligibility')
      .insert({ ...validated, updated_by: user.id })
      .select()
      .single();

    if (error) {
      console.error('[Baseball Academics] Create eligibility error:', error);
      return { success: false as const, error: 'Failed to create eligibility record.' };
    }

    revalidatePath('/baseball/dashboard/academics');
    return { success: true as const, data: created as BaseballAcademicEligibility };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    console.error('[Baseball Academics] Unexpected error:', err);
    return { success: false as const, error: 'An unexpected error occurred.' };
  }
}
