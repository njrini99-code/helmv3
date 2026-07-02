/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: this file uses `as any` casts on the supabase client because
// `golf_recruits` was added in 20260429010000_golf_recruits.sql and the
// regenerated TS types don't include it yet. Once db:types is rerun, the
// casts can come out.

'use server';

/**
 * Server actions for the Recruiting HQ tab. golf_recruits stores coach-only
 * prospect records (high-school golfers a coach is tracking through the
 * recruiting funnel). RLS limits all access to the team's coach staff —
 * players can't see this table.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';

export type RecruitStatus = 'recruiting' | 'watched' | 'offered' | 'committed';

export interface Recruit {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string | null;
  hs_class: number | null;
  email: string | null;
  phone: string | null;
  hometown: string | null;
  state: string | null;
  notes: string | null;
  status: RecruitStatus;
  created_at: string;
  updated_at: string;
}

export interface RecruitInput {
  first_name: string;
  last_name?: string | null;
  hs_class?: number | null;
  email?: string | null;
  phone?: string | null;
  hometown?: string | null;
  state?: string | null;
  notes?: string | null;
  status?: RecruitStatus;
}

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

const FIELD_LIMITS = {
  first_name: 120,
  last_name: 120,
  email: 254,
  phone: 40,
  hometown: 120,
  state: 2,
  notes: 5000,
} as const;
const MIN_HS_CLASS = 2020;
const MAX_HS_CLASS = 2040;

function validateRecruitInput(input: Partial<RecruitInput>): string | null {
  if (input.first_name !== undefined) {
    const trimmed = input.first_name.trim();
    if (!trimmed) return 'First name cannot be empty';
    if (trimmed.length > FIELD_LIMITS.first_name) return 'First name is too long';
  }
  if (input.last_name && input.last_name.trim().length > FIELD_LIMITS.last_name) {
    return 'Last name is too long';
  }
  if (input.email && input.email.trim().length > FIELD_LIMITS.email) {
    return 'Email is too long';
  }
  if (input.phone && input.phone.trim().length > FIELD_LIMITS.phone) {
    return 'Phone is too long';
  }
  if (input.hometown && input.hometown.trim().length > FIELD_LIMITS.hometown) {
    return 'Hometown is too long';
  }
  if (input.state && input.state.trim().length > FIELD_LIMITS.state) {
    return 'State should be a 2-letter abbreviation';
  }
  if (input.notes && input.notes.length > FIELD_LIMITS.notes) {
    return `Notes are too long (max ${FIELD_LIMITS.notes} characters)`;
  }
  if (input.hs_class !== undefined && input.hs_class !== null) {
    if (input.hs_class < MIN_HS_CLASS || input.hs_class > MAX_HS_CLASS) {
      return `Class year must be between ${MIN_HS_CLASS} and ${MAX_HS_CLASS}`;
    }
  }
  return null;
}

async function resolveCoachAndTeam(): Promise<
  | { ok: true; coachId: string; teamId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach || !coach.organization_id) {
    return { ok: false, error: 'Coach profile required' };
  }

  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) return { ok: false, error: 'No team found for coach' };

  return { ok: true, coachId: coach.id, teamId, supabase };
}

async function getRecruitsImpl(): Promise<ActionResult<Recruit[]>> {
  try {
    const ctx = await resolveCoachAndTeam();
    if (!ctx.ok) return { success: false, error: ctx.error };

    const { data, error } = await (ctx.supabase as any)
      .from('golf_recruits')
      .select('*')
      .eq('team_id', ctx.teamId)
      .order('updated_at', { ascending: false });

    if (error) {
      await logServerError(`getRecruits failed: ${error.message}`, {
        action: 'recruiting.getRecruits',
        featureArea: 'recruiting',
        extra: { code: error.code },
      });
      return { success: false, error: 'Failed to load recruits' };
    }

    return { success: true, data: (data ?? []) as Recruit[] };
  } catch (err) {
    await logServerError(`getRecruits error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'recruiting.getRecruits',
      featureArea: 'recruiting',
    });
    return { success: false, error: 'Failed to load recruits' };
  }
}

const observedGetRecruits = withAdminObserved(
  'getRecruits',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  getRecruitsImpl,
);

export async function getRecruits(): Promise<ActionResult<Recruit[]>> {
  return observedGetRecruits();
}

async function createRecruitImpl(input: RecruitInput): Promise<ActionResult<{ id: string }>> {
  if (!input.first_name?.trim()) {
    return { success: false, error: 'First name is required' };
  }
  const validationError = validateRecruitInput(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const ctx = await resolveCoachAndTeam();
    if (!ctx.ok) return { success: false, error: ctx.error };

    const row = {
      team_id: ctx.teamId,
      created_by: ctx.coachId,
      first_name: input.first_name.trim(),
      last_name: input.last_name?.trim() || null,
      hs_class: input.hs_class ?? null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      hometown: input.hometown?.trim() || null,
      state: input.state?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status ?? 'recruiting',
    };

    const { data, error } = await (ctx.supabase as any)
      .from('golf_recruits')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      await logServerError(`createRecruit failed: ${error.message}`, {
        action: 'recruiting.createRecruit',
        featureArea: 'recruiting',
        extra: { code: error.code },
      });
      return { success: false, error: 'Failed to add recruit' };
    }

    revalidatePath('/golf/dashboard/recruiting');
    return { success: true, data: { id: data.id } };
  } catch (err) {
    await logServerError(`createRecruit error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'recruiting.createRecruit',
      featureArea: 'recruiting',
    });
    return { success: false, error: 'Failed to add recruit' };
  }
}

const observedCreateRecruit = withAdminObserved(
  'createRecruit',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  createRecruitImpl,
);

export async function createRecruit(input: RecruitInput): Promise<ActionResult<{ id: string }>> {
  return observedCreateRecruit(input);
}

async function updateRecruitImpl(
  id: string,
  updates: Partial<RecruitInput>,
): Promise<ActionResult> {
  if (!id) return { success: false, error: 'Recruit id required' };
  const validationError = validateRecruitInput(updates);
  if (validationError) return { success: false, error: validationError };

  try {
    const ctx = await resolveCoachAndTeam();
    if (!ctx.ok) return { success: false, error: ctx.error };

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.first_name !== undefined) patch.first_name = updates.first_name.trim();
    if (updates.last_name !== undefined) patch.last_name = updates.last_name?.trim() || null;
    if (updates.hs_class !== undefined) patch.hs_class = updates.hs_class ?? null;
    if (updates.email !== undefined) patch.email = updates.email?.trim() || null;
    if (updates.phone !== undefined) patch.phone = updates.phone?.trim() || null;
    if (updates.hometown !== undefined) patch.hometown = updates.hometown?.trim() || null;
    if (updates.state !== undefined) patch.state = updates.state?.trim() || null;
    if (updates.notes !== undefined) patch.notes = updates.notes?.trim() || null;
    if (updates.status !== undefined) patch.status = updates.status;

    const { error } = await (ctx.supabase as any)
      .from('golf_recruits')
      .update(patch)
      .eq('id', id)
      .eq('team_id', ctx.teamId);

    if (error) {
      await logServerError(`updateRecruit failed: ${error.message}`, {
        action: 'recruiting.updateRecruit',
        featureArea: 'recruiting',
        extra: { code: error.code, id },
      });
      return { success: false, error: 'Failed to update recruit' };
    }

    revalidatePath('/golf/dashboard/recruiting');
    return { success: true };
  } catch (err) {
    await logServerError(`updateRecruit error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'recruiting.updateRecruit',
      featureArea: 'recruiting',
      extra: { id },
    });
    return { success: false, error: 'Failed to update recruit' };
  }
}

const observedUpdateRecruit = withAdminObserved(
  'updateRecruit',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  updateRecruitImpl,
);

export async function updateRecruit(
  id: string,
  updates: Partial<RecruitInput>,
): Promise<ActionResult> {
  return observedUpdateRecruit(id, updates);
}

async function deleteRecruitImpl(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: 'Recruit id required' };

  try {
    const ctx = await resolveCoachAndTeam();
    if (!ctx.ok) return { success: false, error: ctx.error };

    // Collect the recruit's document storage paths BEFORE deleting. The FK
    // cascade removes golf_recruit_documents rows, but storage objects are not
    // cascaded — without this they'd orphan in the private recruit-documents
    // bucket.
    const { data: docRows } = await (ctx.supabase as any)
      .from('golf_recruit_documents')
      .select('storage_path')
      .eq('recruit_id', id);

    const { error } = await (ctx.supabase as any)
      .from('golf_recruits')
      .delete()
      .eq('id', id)
      .eq('team_id', ctx.teamId);

    if (error) {
      await logServerError(`deleteRecruit failed: ${error.message}`, {
        action: 'recruiting.deleteRecruit',
        featureArea: 'recruiting',
        extra: { code: error.code, id },
      });
      return { success: false, error: 'Failed to remove recruit' };
    }

    // Recruit (and its document rows) gone — now purge the storage objects.
    const paths = ((docRows ?? []) as { storage_path: string | null }[])
      .map((d) => d.storage_path)
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { error: rmError } = await ctx.supabase.storage.from('recruit-documents').remove(paths);
      if (rmError) {
        await logServerError(
          `deleteRecruit storage purge failed (${paths.length} orphaned objects): ${rmError.message}`,
          { action: 'recruiting.deleteRecruit', featureArea: 'recruiting', extra: { id } },
        );
      }
    }

    revalidatePath('/golf/dashboard/recruiting');
    return { success: true };
  } catch (err) {
    await logServerError(`deleteRecruit error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'recruiting.deleteRecruit',
      featureArea: 'recruiting',
      extra: { id },
    });
    return { success: false, error: 'Failed to remove recruit' };
  }
}

const observedDeleteRecruit = withAdminObserved(
  'deleteRecruit',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  deleteRecruitImpl,
);

export async function deleteRecruit(id: string): Promise<ActionResult> {
  return observedDeleteRecruit(id);
}
