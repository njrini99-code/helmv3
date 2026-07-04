'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import type { PipelineStage } from '@/lib/types';
import { verifyWatchlistOwnership } from '@/lib/auth/ownership';
import { logSecurityEvent } from '@/lib/validation/server-action-validator';
import { notifyWatchlistAdd, notifyPipelineStageChange } from '@/lib/notifications';
import { WatchlistSchemas } from '@/lib/validation/action-schemas';
import { logServerError } from '@/lib/server-error-logger';
import { assertCoachCanRecruitPlayer } from '@/lib/baseball/recruitability';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import type { CoachType } from '@/app/baseball/actions/discover';
import { z } from 'zod';

const WATCHLIST_PATHS = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/watchlist',
  '/baseball/dashboard/pipeline',
] as const;

function revalidateWatchlistPaths() {
  for (const path of WATCHLIST_PATHS) {
    revalidatePath(path);
  }
}

function mapWatchlistActionError(error: unknown): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage recruiting' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the watchlist action. Please try again.' };
  }
  if (error instanceof z.ZodError) {
    const firstError = error.issues?.[0];
    return { success: false, error: firstError?.message || 'Invalid input data' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

function mapWatchlistAddError(error: unknown): { success: false; message: string } {
  const mapped = mapWatchlistActionError(error);
  return { success: false, message: mapped.error };
}

async function loadCoachProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
) {
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id, full_name')
    .eq('id', coachId)
    .single();
  return coach;
}

export async function addToWatchlist(coachId: string, playerId: string) {
  try {
    return await addToWatchlistAction(coachId, playerId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'watchlist.addToWatchlist', featureArea: 'baseball-watchlist' },
    );
    return mapWatchlistAddError(error);
  }
}

const addToWatchlistAction = withBaseballAction(
  'addToWatchlist',
  { featureArea: 'baseball-watchlist', requiredCapability: 'can_manage_stats' },
  async (ctx, coachId: string, playerId: string) => {
    const supabase = await createClient();
    const activeCoachId = ctx.activeCoachId;
    if (!activeCoachId) {
      return { success: false, message: 'Coach not found' };
    }
    if (coachId !== activeCoachId) {
      return { success: false, message: 'Unauthorized' };
    }

    const coach = await loadCoachProfile(supabase, activeCoachId);
    if (!coach) {
      return { success: false, message: 'Unauthorized' };
    }

    const recruitability = await assertCoachCanRecruitPlayer(
      supabase,
      activeCoachId,
      coach.coach_type as CoachType,
      playerId,
    );
    if (!recruitability.allowed) {
      return { success: false, message: 'This player is not available for recruiting' };
    }

    const { data: existing } = await supabase
      .from('baseball_watchlists')
      .select('id')
      .eq('coach_id', activeCoachId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing) {
      return { success: false, message: 'Player already in watchlist' };
    }

    const { error } = await supabase
      .from('baseball_watchlists')
      .insert({
        coach_id: activeCoachId,
        player_id: playerId,
        pipeline_stage: 'watchlist',
        priority: 0,
      });

    if (error) {
      throw new BaseballActionError();
    }

    await fromUntyped(supabase, 'baseball_player_engagement_events')
      .insert({
        player_id: playerId,
        coach_id: activeCoachId,
        engagement_type: 'watchlist_add',
        is_anonymous: false,
        metadata: { source: 'discover' },
      });

    revalidateWatchlistPaths();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: playerRow } = await supabase.from('baseball_players' as any)
        .select('user_id').eq('id', playerId).single() as { data: { user_id: string } | null };

      if (playerRow?.user_id) {
        const { data: userRow } = await supabase.from('users')
          .select('email').eq('id', playerRow.user_id).single();

        let schoolName = 'a program';
        if (coach.organization_id) {
          const { data: org } = await supabase.from('organizations')
            .select('name').eq('id', coach.organization_id).single();
          if (org?.name) schoolName = org.name;
        }

        if (userRow?.email) {
          await notifyWatchlistAdd(
            playerRow.user_id, userRow.email,
            coach.full_name?.trim() || 'A coach', schoolName,
          );
        }
      }
    } catch (notifErr) {
      await logServerError(`[addToWatchlist] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'watchlist.addToWatchlist' });
    }

    return { success: true };
  },
);

export async function removeFromWatchlist(coachId: string, playerId: string) {
  try {
    return await removeFromWatchlistAction(coachId, playerId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'watchlist.removeFromWatchlist', featureArea: 'baseball-watchlist' },
    );
    return mapWatchlistAddError(error);
  }
}

const removeFromWatchlistAction = withBaseballAction(
  'removeFromWatchlist',
  { featureArea: 'baseball-watchlist', requiredCapability: 'can_manage_stats' },
  async (ctx, coachId: string, playerId: string) => {
    const supabase = await createClient();
    const activeCoachId = ctx.activeCoachId;
    if (!activeCoachId) {
      return { success: false, message: 'Coach not found' };
    }
    if (coachId !== activeCoachId) {
      return { success: false, message: 'Unauthorized' };
    }

    const { error } = await supabase
      .from('baseball_watchlists')
      .delete()
      .eq('coach_id', activeCoachId)
      .eq('player_id', playerId);

    if (error) {
      throw new BaseballActionError();
    }

    revalidateWatchlistPaths();
    return { success: true };
  },
);

export async function updateWatchlistStatus(
  watchlistId: string,
  status: PipelineStage,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateWatchlistStatusAction(watchlistId, status);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'watchlist.updateWatchlistStatus', featureArea: 'baseball-watchlist' },
    );
    return mapWatchlistActionError(error);
  }
}

const updateWatchlistStatusAction = withBaseballAction(
  'updateWatchlistStatus',
  { featureArea: 'baseball-watchlist', requiredCapability: 'can_manage_stats' },
  async (ctx, watchlistId: string, status: PipelineStage): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const validatedData = WatchlistSchemas.updateStatus.parse({
      watchlist_id: watchlistId,
      status,
    });

    await verifyWatchlistOwnership(supabase, validatedData.watchlist_id, coachId);

    await logSecurityEvent({
      event: 'watchlist_update',
      action: 'watchlist_action',
      userId: ctx.user.id,
      metadata: { watchlistId: validatedData.watchlist_id, newStatus: validatedData.status },
    });

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('organization_id')
      .eq('id', coachId)
      .single();

    const { error } = await supabase
      .from('baseball_watchlists')
      .update({
        pipeline_stage: validatedData.status as PipelineStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coachId);

    if (error) {
      await logServerError(`[Security] Watchlist update failed: ${error.message}`, { action: 'watchlist.updateWatchlistStatus', metadata: { watchlistId, coachId } });
      return { success: false, error: 'Failed to update status' };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: watchlistRow } = await supabase.from('baseball_watchlists' as any)
        .select('player_id').eq('id', validatedData.watchlist_id).single() as
        { data: { player_id: string } | null };

      if (watchlistRow?.player_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: playerRow } = await supabase.from('baseball_players' as any)
          .select('user_id').eq('id', watchlistRow.player_id).single() as
          { data: { user_id: string } | null };

        if (playerRow?.user_id) {
          const { data: userRow } = await supabase.from('users')
            .select('email').eq('id', playerRow.user_id).single();

          let schoolName = 'a program';
          if (coach?.organization_id) {
            const { data: org } = await supabase.from('organizations')
              .select('name').eq('id', coach.organization_id).single();
            if (org?.name) schoolName = org.name;
          }

          if (userRow?.email) {
            await notifyPipelineStageChange(
              playerRow.user_id, userRow.email, schoolName, validatedData.status,
            );
          }
        }
      }
    } catch (notifErr) {
      await logServerError(`[updateWatchlistStatus] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'watchlist.updateWatchlistStatus' });
    }

    revalidatePath('/baseball/dashboard/watchlist');
    revalidatePath('/baseball/dashboard/pipeline');
    return { success: true };
  },
);

export async function updateWatchlistPriority(
  watchlistId: string,
  isHighPriority: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await updateWatchlistPriorityAction(watchlistId, isHighPriority);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'watchlist.updateWatchlistPriority', featureArea: 'baseball-watchlist' },
    );
    return mapWatchlistActionError(error);
  }
}

const updateWatchlistPriorityAction = withBaseballAction(
  'updateWatchlistPriority',
  { featureArea: 'baseball-watchlist', requiredCapability: 'can_manage_stats' },
  async (ctx, watchlistId: string, isHighPriority: boolean): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const validatedData = WatchlistSchemas.updatePriority.parse({
      watchlist_id: watchlistId,
      is_high_priority: isHighPriority,
    });

    await verifyWatchlistOwnership(supabase, validatedData.watchlist_id, coachId);

    await logSecurityEvent({
      event: 'watchlist_update',
      action: 'watchlist_action',
      userId: ctx.user.id,
      metadata: { watchlistId: validatedData.watchlist_id, isHighPriority: validatedData.is_high_priority },
    });

    const { error } = await supabase
      .from('baseball_watchlists')
      .update({
        priority: validatedData.is_high_priority ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coachId);

    if (error) {
      await logServerError(`[Security] Watchlist priority update failed: ${error.message}`, { action: 'watchlist.updateWatchlistPriority', metadata: { watchlistId, coachId } });
      return { success: false, error: 'Failed to update priority' };
    }

    revalidatePath('/baseball/dashboard/watchlist');
    return { success: true };
  },
);

export async function addWatchlistNote(
  watchlistId: string,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await addWatchlistNoteAction(watchlistId, note);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'watchlist.addWatchlistNote', featureArea: 'baseball-watchlist' },
    );
    return mapWatchlistActionError(error);
  }
}

const addWatchlistNoteAction = withBaseballAction(
  'addWatchlistNote',
  { featureArea: 'baseball-watchlist', requiredCapability: 'can_manage_stats' },
  async (ctx, watchlistId: string, note: string): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const validatedData = WatchlistSchemas.addNote.parse({
      watchlist_id: watchlistId,
      note,
    });

    await verifyWatchlistOwnership(supabase, validatedData.watchlist_id, coachId);

    await logSecurityEvent({
      event: 'watchlist_update',
      action: 'watchlist_action',
      userId: ctx.user.id,
      metadata: { watchlistId: validatedData.watchlist_id, noteLength: validatedData.note.length },
    });

    const { error } = await supabase
      .from('baseball_watchlists')
      .update({
        notes: validatedData.note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.watchlist_id)
      .eq('coach_id', coachId);

    if (error) {
      await logServerError(`[Security] Watchlist note update failed: ${error.message}`, { action: 'watchlist.addWatchlistNote', metadata: { watchlistId, coachId } });
      return { success: false, error: 'Failed to add note' };
    }

    revalidatePath('/baseball/dashboard/watchlist');
    return { success: true };
  },
);

export async function toggleWatchlistPlayer(playerId: string): Promise<{
  success: boolean;
  action?: 'added' | 'removed';
  error?: string;
}> {
  try {
    return await toggleWatchlistPlayerAction(playerId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'watchlist.toggleWatchlistPlayer', featureArea: 'baseball-watchlist' },
    );
    return mapWatchlistActionError(error);
  }
}

const toggleWatchlistPlayerAction = withBaseballAction(
  'toggleWatchlistPlayer',
  { featureArea: 'baseball-watchlist', requiredCapability: 'can_manage_stats' },
  async (ctx, playerId: string): Promise<{
    success: boolean;
    action?: 'added' | 'removed';
    error?: string;
  }> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Coach not found' };
    }

    const { data: existing } = await supabase
      .from('baseball_watchlists')
      .select('id')
      .eq('coach_id', coachId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('baseball_watchlists')
        .delete()
        .eq('coach_id', coachId)
        .eq('player_id', playerId);

      if (error) {
        return { success: false, error: 'Failed to remove from watchlist' };
      }

      await fromUntyped(supabase, 'baseball_player_engagement_events')
        .insert({
          player_id: playerId,
          coach_id: coachId,
          engagement_type: 'watchlist_remove',
          is_anonymous: false,
          metadata: { source: 'toggle_action' },
        });

      revalidateWatchlistPaths();
      return { success: true, action: 'removed' };
    }

    const coach = await loadCoachProfile(supabase, coachId);
    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    const recruitability = await assertCoachCanRecruitPlayer(
      supabase,
      coachId,
      coach.coach_type as CoachType,
      playerId,
    );
    if (!recruitability.allowed) {
      return { success: false, error: 'This player is not available for recruiting' };
    }

    const { error } = await supabase
      .from('baseball_watchlists')
      .insert({
        coach_id: coachId,
        player_id: playerId,
        pipeline_stage: 'watchlist',
        priority: 0,
      });

    if (error) {
      return { success: false, error: 'Failed to add to watchlist' };
    }

    await fromUntyped(supabase, 'baseball_player_engagement_events')
      .insert({
        player_id: playerId,
        coach_id: coachId,
        engagement_type: 'watchlist_add',
        is_anonymous: false,
        metadata: { source: 'player_profile' },
      });

    revalidateWatchlistPaths();
    return { success: true, action: 'added' };
  },
);

async function checkWatchlistStatusImpl(playerId: string): Promise<{
  isInWatchlist: boolean;
  watchlistId?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { isInWatchlist: false };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { isInWatchlist: false };
    }

    const { data } = await supabase
      .from('baseball_watchlists')
      .select('id')
      .eq('coach_id', coach.id)
      .eq('player_id', playerId)
      .maybeSingle();

    return {
      isInWatchlist: !!data,
      watchlistId: data?.id,
    };
  } catch {
    return { isInWatchlist: false };
  }
}

export const checkWatchlistStatus = withAdminObserved(
  'checkWatchlistStatus',
  { sport: 'baseball', feature: 'baseball_watchlist', featureArea: 'baseball-watchlist' },
  checkWatchlistStatusImpl,
);
