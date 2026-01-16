'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

interface RoundSetupForm {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

export interface RoundDraftData {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  selectedQualifierId?: string | null;
  selectedRoundNumber?: number | null;
  inProgressShots?: Record<number, ShotRecord[]>;
}

export interface DraftInfo {
  roundId: string;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  roundDate: string;
  roundType: string | null;
  currentHole: number | null;
  holesCompleted: number;
  totalHoles: number;
  lastAutoSave: string | null;
  createdAt: string | null;
  draftData: RoundDraftData | null;
}

// ============================================================================
// SAVE ROUND DRAFT
// ============================================================================

/**
 * Save or update a round draft with auto-save data.
 * Creates a new draft if no roundId provided, updates existing if provided.
 */
export async function saveRoundDraft(
  data: RoundDraftData,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; lastAutoSave: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    const now = new Date().toISOString();

    // Calculate holes completed from completedHoleStats
    const holesCompleted = data.completedHoleStats.filter(h => h && h.score > 0).length;
    const totalHoles = data.holes.length || 18;

    // Round data for the record
    const roundRecord = {
      player_id: player.id,
      course_name: data.setupData.courseName || 'Untitled Round',
      course_city: data.setupData.courseCity || null,
      course_state: data.setupData.courseState || null,
      course_rating: data.setupData.courseRating ? parseFloat(data.setupData.courseRating) : null,
      course_slope: data.setupData.courseSlope ? parseInt(data.setupData.courseSlope) : null,
      tees_played: data.setupData.teesPlayed || null,
      round_type: data.setupData.roundType || 'practice',
      round_date: data.setupData.roundDate || new Date().toISOString().split('T')[0],
      is_draft: true,
      draft_data: data as unknown as Record<string, unknown>,
      last_auto_save: now,
      status: 'in_progress',
      current_hole: data.currentHoleIndex !== undefined ? data.currentHoleIndex + 1 : null,
      holes_to_play: totalHoles,
      // Clear stats for drafts
      total_score: null,
      total_to_par: null,
      total_putts: null,
    };

    let roundId: string;

    if (existingRoundId) {
      // Update existing draft
      const { data: updated, error: updateError } = await supabase
        .from('golf_rounds')
        .update(roundRecord)
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .eq('is_draft', true)
        .select('id')
        .single();

      if (updateError) {
        // If update fails (round might not exist or not be a draft), create new
        const { data: created, error: createError } = await supabase
          .from('golf_rounds')
          .insert(roundRecord)
          .select('id')
          .single();

        if (createError) {
          return { success: false, error: 'Failed to save draft' };
        }
        roundId = created.id;
      } else {
        roundId = updated.id;
      }
    } else {
      // Check for existing draft first
      const { data: existingDraft } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('player_id', player.id)
        .eq('is_draft', true)
        .order('last_auto_save', { ascending: false })
        .limit(1)
        .single();

      if (existingDraft) {
        // Update existing draft
        const { error: updateError } = await supabase
          .from('golf_rounds')
          .update(roundRecord)
          .eq('id', existingDraft.id);

        if (updateError) {
          return { success: false, error: 'Failed to update existing draft' };
        }
        roundId = existingDraft.id;
      } else {
        // Create new draft
        const { data: created, error: createError } = await supabase
          .from('golf_rounds')
          .insert(roundRecord)
          .select('id')
          .single();

        if (createError) {
          return { success: false, error: 'Failed to create draft' };
        }
        roundId = created.id;
      }
    }

    return {
      success: true,
      data: { roundId, lastAutoSave: now },
    };

  } catch (error) {
    console.error('saveRoundDraft error:', error);
    return {
      success: false,
      error: 'Failed to save draft. Please try again.',
    };
  }
}

// ============================================================================
// LOAD ROUND DRAFT
// ============================================================================

/**
 * Load the most recent draft for the current player.
 * Returns null if no draft exists.
 */
export async function loadRoundDraft(): Promise<ActionResult<DraftInfo | null>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Get most recent draft
    const { data: draft, error } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        course_city,
        course_state,
        round_date,
        round_type,
        current_hole,
        holes_to_play,
        last_auto_save,
        created_at,
        draft_data
      `)
      .eq('player_id', player.id)
      .eq('is_draft', true)
      .order('last_auto_save', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: 'Failed to load draft' };
    }

    if (!draft) {
      return { success: true, data: null };
    }

    // Parse draft_data
    const draftData = draft.draft_data as RoundDraftData | null;
    const holesCompleted = draftData?.completedHoleStats?.filter(h => h && h.score > 0).length || 0;

    const draftInfo: DraftInfo = {
      roundId: draft.id,
      courseName: draft.course_name,
      courseCity: draft.course_city,
      courseState: draft.course_state,
      roundDate: draft.round_date,
      roundType: draft.round_type,
      currentHole: draft.current_hole,
      holesCompleted,
      totalHoles: draft.holes_to_play || 18,
      lastAutoSave: draft.last_auto_save,
      createdAt: draft.created_at,
      draftData,
    };

    return { success: true, data: draftInfo };

  } catch (error) {
    console.error('loadRoundDraft error:', error);
    return {
      success: false,
      error: 'Failed to load draft. Please try again.',
    };
  }
}

// ============================================================================
// CHECK FOR EXISTING DRAFT
// ============================================================================

/**
 * Quick check if the player has any existing drafts.
 * Returns basic info for the resume modal.
 */
export async function checkForDraft(): Promise<ActionResult<{
  hasDraft: boolean;
  draftInfo: {
    roundId: string;
    courseName: string | null;
    holesCompleted: number;
    totalHoles: number;
    lastAutoSave: string | null;
    roundDate: string;
  } | null;
}>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: true, data: { hasDraft: false, draftInfo: null } };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: true, data: { hasDraft: false, draftInfo: null } };
    }

    // Get most recent draft
    const { data: draft } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        current_hole,
        holes_to_play,
        last_auto_save,
        draft_data
      `)
      .eq('player_id', player.id)
      .eq('is_draft', true)
      .order('last_auto_save', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!draft) {
      return { success: true, data: { hasDraft: false, draftInfo: null } };
    }

    const draftData = draft.draft_data as RoundDraftData | null;
    const holesCompleted = draftData?.completedHoleStats?.filter(h => h && h.score > 0).length || 0;

    return {
      success: true,
      data: {
        hasDraft: true,
        draftInfo: {
          roundId: draft.id,
          courseName: draft.course_name,
          holesCompleted,
          totalHoles: draft.holes_to_play || 18,
          lastAutoSave: draft.last_auto_save,
          roundDate: draft.round_date,
        },
      },
    };

  } catch (error) {
    console.error('checkForDraft error:', error);
    return { success: true, data: { hasDraft: false, draftInfo: null } };
  }
}

// ============================================================================
// CLEAR ROUND DRAFT
// ============================================================================

/**
 * Delete a draft round completely.
 */
export async function clearRoundDraft(roundId: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Delete the draft
    const { error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('is_draft', true);

    if (error) {
      return { success: false, error: 'Failed to delete draft' };
    }

    revalidatePath('/golf/dashboard/rounds');
    return { success: true, data: undefined };

  } catch (error) {
    console.error('clearRoundDraft error:', error);
    return {
      success: false,
      error: 'Failed to delete draft. Please try again.',
    };
  }
}

// ============================================================================
// CONVERT DRAFT TO ROUND
// ============================================================================

/**
 * Convert a draft to a regular in-progress round.
 * This removes the is_draft flag so it's treated as a manually saved round.
 */
export async function convertDraftToRound(roundId: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Convert draft to regular round
    const { error } = await supabase
      .from('golf_rounds')
      .update({
        is_draft: false,
        draft_data: null,
        last_auto_save: null,
      })
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('is_draft', true);

    if (error) {
      return { success: false, error: 'Failed to convert draft' };
    }

    revalidatePath('/golf/dashboard/rounds');
    return { success: true, data: undefined };

  } catch (error) {
    console.error('convertDraftToRound error:', error);
    return {
      success: false,
      error: 'Failed to convert draft. Please try again.',
    };
  }
}

// ============================================================================
// CLEANUP OLD DRAFTS
// ============================================================================

/**
 * Clean up drafts older than 7 days for the current player.
 * Can be called periodically or on page load.
 */
export async function cleanupOldDrafts(): Promise<ActionResult<{ deletedCount: number }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: true, data: { deletedCount: 0 } };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: true, data: { deletedCount: 0 } };
    }

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Delete old drafts
    const { data: deleted, error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('player_id', player.id)
      .eq('is_draft', true)
      .lt('last_auto_save', sevenDaysAgo.toISOString())
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to cleanup drafts' };
    }

    return { success: true, data: { deletedCount: deleted?.length || 0 } };

  } catch (error) {
    console.error('cleanupOldDrafts error:', error);
    return { success: true, data: { deletedCount: 0 } };
  }
}
