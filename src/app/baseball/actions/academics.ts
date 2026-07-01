'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const ACADEMICS_PATH = '/baseball/dashboard/academics';

function mapAcademicsActionError<T = void>(
  error: unknown,
): { success: false; error: string; data?: T } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Unauthorized' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach profile not found.' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage academics.' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the academics action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred.' };
}

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
  try {
    return await getTeamAcademicsAction(teamId);
  } catch (error) {
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.getTeamAcademics', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError(error);
  }
}

const getTeamAcademicsAction = withBaseballAction(
  'getTeamAcademics',
  {
    featureArea: 'baseball-academics',
    requiredCapability: 'can_view_academics',
    teamFrom: (teamId: string) => teamId,
    demoSafe: true,
  },
  async (_ctx, teamId: string) => {
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
      await logServerError(`[Baseball Academics] Team members error: ${membersError instanceof Error ? membersError.message : String(membersError)}`, { action: 'academics.getTeamAcademics' });
      return { success: false as const, error: 'Failed to load team data.' };
    }

    // Get eligibility records for all players
    const playerIds = (members || []).map(m => m.player_id).filter(Boolean);
    let eligibilityRecords: BaseballAcademicEligibility[] = [];

    if (playerIds.length > 0) {
      // Scope to the active team so transfers / multi-team players don't leak
      // another team's record. Order latest-first so the per-player `.find`
      // below picks this team's most recent (latest semester) record.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: eligData } = await (supabase as any)
        .from('baseball_academic_eligibility')
        .select('*')
        .eq('team_id', teamId)
        .in('player_id', playerIds)
        .order('updated_at', { ascending: false });
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
        // No eligibility record => treat as unknown / ineligible-safe rather
        // than inflating "Eligible" / "Good Standing" summary cards.
        is_eligible: eligibility?.is_eligible ?? false,
        academic_standing: eligibility?.academic_standing ?? null,
        class_count: classCounts[m.player_id] || 0,
        eligibility_id: eligibility?.id ?? null,
      };
    });

    return { success: true as const, data: teamData };
  },
);

// ============================================================================
// PLAYER: CLASSES
// ============================================================================

async function assertPlayerClassAccess(
  ctx: { activeTeamId: string; activePlayerId: string | null },
  playerId: string,
): Promise<void> {
  if (ctx.activePlayerId === playerId) {
    return;
  }
  await requireBaseballCapability(ctx.activeTeamId, 'can_view_academics');
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', ctx.activeTeamId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!membership) {
    throw new BaseballUnauthorizedError('This player is not on your active team.');
  }
}

export async function getPlayerClasses(playerId: string) {
  try {
    return await getPlayerClassesAction(playerId);
  } catch (error) {
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.getPlayerClasses', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballPlayerClass[]>(error);
  }
}

const getPlayerClassesAction = withBaseballAction(
  'getPlayerClasses',
  { featureArea: 'baseball-academics', demoSafe: true },
  async (ctx, playerId: string) => {
    await assertPlayerClassAccess(ctx, playerId);

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('baseball_player_classes')
      .select('*')
      .eq('player_id', playerId)
      .order('start_time', { ascending: true });

    if (error) {
      await logServerError(`[Baseball Academics] Fetch classes error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.getPlayerClasses' });
      return { success: false as const, error: 'Failed to load classes.' };
    }

    return { success: true as const, data: (data || []) as BaseballPlayerClass[] };
  },
);

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
    return await addPlayerClassAction(playerId, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false as const, error: err.issues[0]?.message || 'Invalid data.' };
    }
    await logServerError(
      `[Baseball Academics] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'academics.addPlayerClass', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballPlayerClass>(err);
  }
}

const addPlayerClassAction = withBaseballAction(
  'addPlayerClass',
  { featureArea: 'baseball-academics' },
  async (ctx, playerId: string, data: {
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
  }) => {
    await assertPlayerClassAccess(ctx, playerId);

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
      await logServerError(`[Baseball Academics] Add class error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.addPlayerClass' });
      return { success: false as const, error: 'Failed to add class.' };
    }

    revalidatePath('/baseball/dashboard/academics');
    return { success: true as const, data: created as BaseballPlayerClass };
  },
);

async function assertOwnPlayerClass(
  ctx: { activePlayerId: string | null },
  classId: string,
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('baseball_player_classes')
    .select('player_id')
    .eq('id', classId)
    .maybeSingle();

  if (!existing || existing.player_id !== ctx.activePlayerId) {
    throw new BaseballUnauthorizedError('You can only edit your own classes.');
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
  try {
    return await updatePlayerClassAction(classId, data);
  } catch (error) {
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.updatePlayerClass', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballPlayerClass>(error);
  }
}

const updatePlayerClassAction = withBaseballAction(
  'updatePlayerClass',
  { featureArea: 'baseball-academics' },
  async (ctx, classId: string, data: {
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
  }) => {
    await assertOwnPlayerClass(ctx, classId);

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from('baseball_player_classes')
      .update(data)
      .eq('id', classId)
      .select()
      .single();

    if (error) {
      await logServerError(`[Baseball Academics] Update class error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.updatePlayerClass' });
      return { success: false as const, error: 'Failed to update class.' };
    }

    revalidatePath('/baseball/dashboard/academics');
    return { success: true as const, data: updated as BaseballPlayerClass };
  },
);

export async function deletePlayerClass(classId: string) {
  try {
    return await deletePlayerClassAction(classId);
  } catch (error) {
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.deletePlayerClass', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError(error);
  }
}

const deletePlayerClassAction = withBaseballAction(
  'deletePlayerClass',
  { featureArea: 'baseball-academics' },
  async (ctx, classId: string) => {
    await assertOwnPlayerClass(ctx, classId);

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_player_classes')
      .delete()
      .eq('id', classId);

    if (error) {
      await logServerError(`[Baseball Academics] Delete class error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.deletePlayerClass' });
      return { success: false as const, error: 'Failed to delete class.' };
    }

    revalidatePath('/baseball/dashboard/academics');
    return { success: true as const };
  },
);

// ============================================================================
// COACH: ELIGIBILITY
// ============================================================================

export async function getTeamEligibility(teamId: string) {
  try {
    return await getTeamEligibilityAction(teamId);
  } catch (error) {
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.getTeamEligibility', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballAcademicEligibility[]>(error);
  }
}

const getTeamEligibilityAction = withBaseballAction(
  'getTeamEligibility',
  {
    featureArea: 'baseball-academics',
    requiredCapability: 'can_view_academics',
    teamFrom: (teamId: string) => teamId,
    demoSafe: true,
  },
  async (_ctx, teamId: string) => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('baseball_academic_eligibility')
      .select('*')
      .eq('team_id', teamId)
      .order('updated_at', { ascending: false });

    if (error) {
      await logServerError(`[Baseball Academics] Eligibility error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.getTeamEligibility' });
      return { success: false as const, error: 'Failed to load eligibility data.' };
    }

    return { success: true as const, data: (data || []) as BaseballAcademicEligibility[] };
  },
);

export async function updateEligibility(id: string, data: {
  gpa?: number | null;
  credits_completed?: number | null;
  credits_required?: number | null;
  is_eligible?: boolean;
  academic_standing?: 'good' | 'warning' | 'probation' | null;
  notes?: string | null;
}) {
  try {
    return await updateEligibilityAction(id, data);
  } catch (error) {
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.updateEligibility', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballAcademicEligibility>(error);
  }
}

const updateEligibilityAction = withBaseballAction(
  'updateEligibility',
  { featureArea: 'baseball-academics' },
  async (ctx, id: string, data: {
    gpa?: number | null;
    credits_completed?: number | null;
    credits_required?: number | null;
    is_eligible?: boolean;
    academic_standing?: 'good' | 'warning' | 'probation' | null;
    notes?: string | null;
  }) => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('baseball_academic_eligibility')
      .select('team_id')
      .eq('id', id)
      .single();

    const teamId = existing?.team_id ? String(existing.team_id) : ctx.activeTeamId;
    await requireBaseballCapability(teamId, 'can_view_academics');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from('baseball_academic_eligibility')
      .update({ ...data, updated_by: ctx.user.id })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      await logServerError(`[Baseball Academics] Update eligibility error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.updateEligibility' });
      return { success: false as const, error: 'Failed to update eligibility.' };
    }

    revalidatePath(ACADEMICS_PATH);
    return { success: true as const, data: updated as BaseballAcademicEligibility };
  },
);

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
    return await createEligibilityRecordAction(playerId, data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false as const, error: error.issues[0]?.message || 'Invalid data.' };
    }
    await logServerError(
      `[Baseball Academics] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.createEligibilityRecord', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballAcademicEligibility>(error);
  }
}

const createEligibilityRecordAction = withBaseballAction(
  'createEligibilityRecord',
  { featureArea: 'baseball-academics' },
  async (ctx, playerId: string, data: {
    team_id?: string;
    semester?: string;
    gpa?: number;
    credits_completed?: number;
    credits_required?: number;
    is_eligible: boolean;
    academic_standing?: 'good' | 'warning' | 'probation';
    notes?: string;
  }) => {
    const teamId = data.team_id ?? ctx.activeTeamId;
    await requireBaseballCapability(teamId, 'can_view_academics');

    const validated = eligibilitySchema.parse({
      player_id: playerId,
      team_id: teamId,
      semester: data.semester || null,
      gpa: data.gpa ?? null,
      credits_completed: data.credits_completed ?? null,
      credits_required: data.credits_required ?? null,
      is_eligible: data.is_eligible,
      academic_standing: data.academic_standing || null,
      notes: data.notes || null,
    });

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from('baseball_academic_eligibility')
      .insert({ ...validated, updated_by: ctx.user.id })
      .select()
      .single();

    if (error) {
      await logServerError(`[Baseball Academics] Create eligibility error: ${error instanceof Error ? error.message : String(error)}`, { action: 'academics.createEligibilityRecord' });
      return { success: false as const, error: 'Failed to create eligibility record.' };
    }

    revalidatePath(ACADEMICS_PATH);
    return { success: true as const, data: created as BaseballAcademicEligibility };
  },
);

// ============================================================================
// COACH: UPSERT PLAYER ACADEMIC DATA (used by academics page edit flow)
// ============================================================================

const upsertAcademicsSchema = z.object({
  player_id: z.string().uuid(),
  team_id: z.string().uuid(),
  gpa: z.number().min(0).max(4).nullable().optional(),
  credits_completed: z.number().int().min(0).nullable().optional(),
  credits_required: z.number().int().min(0).nullable().optional(),
  is_eligible: z.boolean().optional(),
  academic_standing: z.enum(['good', 'warning', 'probation']).nullable().optional(),
  eligibility_id: z.string().uuid().nullable().optional(),
});

export type UpsertAcademicsInput = z.infer<typeof upsertAcademicsSchema>;

export async function upsertPlayerAcademics(input: UpsertAcademicsInput): Promise<
  { success: true; data: BaseballAcademicEligibility } | { success: false; error: string }
> {
  try {
    return await upsertPlayerAcademicsAction(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || 'Invalid data.' };
    }
    await logServerError(
      `[Baseball Academics] Upsert unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'academics.upsertPlayerAcademics', featureArea: 'baseball-academics' },
    );
    return mapAcademicsActionError<BaseballAcademicEligibility>(error);
  }
}

const upsertPlayerAcademicsAction = withBaseballAction(
  'upsertPlayerAcademics',
  {
    featureArea: 'baseball-academics',
    requiredCapability: 'can_view_academics',
    teamFrom: (input: UpsertAcademicsInput) => input.team_id,
  },
  async (ctx, input: UpsertAcademicsInput): Promise<
    { success: true; data: BaseballAcademicEligibility } | { success: false; error: string }
  > => {
    const validated = upsertAcademicsSchema.parse(input);
    const supabase = await createClient();

    const payload = {
      player_id: validated.player_id,
      team_id: validated.team_id,
      gpa: validated.gpa ?? null,
      credits_completed: validated.credits_completed ?? null,
      credits_required: validated.credits_required ?? null,
      is_eligible: validated.is_eligible ?? true,
      academic_standing: validated.academic_standing ?? null,
      updated_by: ctx.user.id,
    };

    let result: BaseballAcademicEligibility | null = null;

    if (validated.eligibility_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated, error: updateError } = await (supabase as any)
        .from('baseball_academic_eligibility')
        .update(payload)
        .eq('id', validated.eligibility_id)
        .select()
        .single();

      if (updateError) {
        await logServerError(
          `[Baseball Academics] Upsert update error: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
          { action: 'academics.upsertPlayerAcademics' },
        );
        return { success: false, error: 'Failed to save academic data.' };
      }
      result = updated as BaseballAcademicEligibility;
    } else {
      const now = new Date();
      const semester = `${now.getFullYear()} ${now.getMonth() < 6 ? 'Spring' : 'Fall'}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error: insertError } = await (supabase as any)
        .from('baseball_academic_eligibility')
        .insert({ ...payload, semester })
        .select()
        .single();

      if (insertError) {
        await logServerError(
          `[Baseball Academics] Upsert insert error: ${insertError instanceof Error ? insertError.message : String(insertError)}`,
          { action: 'academics.upsertPlayerAcademics' },
        );
        return { success: false, error: 'Failed to create academic record.' };
      }
      result = created as BaseballAcademicEligibility;
    }

    revalidatePath(ACADEMICS_PATH);
    return { success: true, data: result! };
  },
);
