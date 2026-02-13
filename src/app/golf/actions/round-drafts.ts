'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';

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

    // Look up team_id from active team membership (same pattern as getPlayerTeamId in golf.ts)
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();
    const teamId = membership?.team_id ?? null;

    const now = new Date().toISOString();

    // Calculate total holes for the draft
    const totalHoles = data.holes.length || 18;

    // Round data for the record
    // KNOWN WORKAROUND: Draft data is stored in the notes field as JSON.
    // This collides with user-entered notes. A dedicated draft_data column
    // should be added via migration. Until then, notes are overwritten for
    // in_progress rounds and restored to null when the draft is converted.
    const draftJsonString = JSON.stringify(data);

    // Extract setup data with defaults
    const setupData = data.setupData;
    const defaultDate = new Date().toISOString().split('T')[0];

    const roundRecord: {
      player_id: string;
      team_id: string | null;
      course_name: string;
      course_city: string | null;
      course_state: string | null;
      course_rating: number | null;
      course_slope: number | null;
      tees_played: string | null;
      round_type: string;
      round_date: string;
      status: string;
      current_hole: number | null;
      holes_played: number;
      notes: string;
      total_score: null;
      score_to_par: null;
      total_putts: null;
    } = {
      player_id: player.id,
      team_id: teamId,
      course_name: setupData?.courseName || 'Untitled Round',
      course_city: setupData?.courseCity || null,
      course_state: setupData?.courseState || null,
      course_rating: setupData?.courseRating ? parseFloat(setupData.courseRating) : null,
      course_slope: setupData?.courseSlope ? parseInt(setupData.courseSlope) : null,
      tees_played: setupData?.teesPlayed || null,
      round_type: setupData?.roundType || 'practice',
      round_date: (setupData?.roundDate ?? defaultDate) as string,
      status: 'in_progress',
      current_hole: data.currentHoleIndex !== undefined ? data.currentHoleIndex + 1 : null,
      holes_played: totalHoles,
      notes: draftJsonString, // WORKAROUND: collides with user notes - see comment above
      // Clear stats for drafts
      total_score: null,
      score_to_par: null,
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
      // Check for existing draft first (using status filter for in_progress rounds)
      const { data: existingDraft } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
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

    // Get most recent draft (using status='in_progress' to identify drafts)
    // Draft data is stored in the notes field as JSON
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
        holes_played,
        notes,
        created_at,
        updated_at
      `)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: 'Failed to load draft' };
    }

    if (!draft) {
      return { success: true, data: null };
    }

    // Parse draft_data from notes field
    let draftData: RoundDraftData | null = null;
    if (draft.notes) {
      try {
        draftData = JSON.parse(draft.notes) as RoundDraftData;
      } catch {
        // Expected: notes field may not contain valid JSON draft data
        draftData = null;
      }
    }
    const holesCompleted = draftData?.completedHoleStats?.filter(h => h && h.score > 0).length || 0;

    const draftInfo: DraftInfo = {
      roundId: draft.id,
      courseName: draft.course_name ?? null,
      courseCity: draft.course_city ?? null,
      courseState: draft.course_state ?? null,
      roundDate: draft.round_date,
      roundType: draft.round_type ?? null,
      currentHole: draft.current_hole ?? null,
      holesCompleted,
      totalHoles: draft.holes_played ?? 18,
      lastAutoSave: draft.updated_at ?? null,
      createdAt: draft.created_at ?? null,
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

    // Get most recent draft (using status='in_progress' to identify drafts)
    // Draft data is stored in the notes field as JSON
    const { data: draft } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        current_hole,
        holes_played,
        notes,
        updated_at
      `)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!draft) {
      return { success: true, data: { hasDraft: false, draftInfo: null } };
    }

    // Parse draft_data from notes field
    let draftData: RoundDraftData | null = null;
    if (draft.notes) {
      try {
        draftData = JSON.parse(draft.notes) as RoundDraftData;
      } catch {
        // Expected: notes field may not contain valid JSON draft data
        draftData = null;
      }
    }
    const holesCompleted = draftData?.completedHoleStats?.filter(h => h && h.score > 0).length || 0;

    return {
      success: true,
      data: {
        hasDraft: true,
        draftInfo: {
          roundId: draft.id,
          courseName: draft.course_name ?? null,
          holesCompleted,
          totalHoles: draft.holes_played ?? 18,
          lastAutoSave: draft.updated_at ?? null,
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

    // Delete the draft (using status filter since is_draft may not be in schema)
    const { error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress');

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

    // Convert draft to regular round (clear draft data from notes, update status)
    const { error } = await supabase
      .from('golf_rounds')
      .update({
        status: 'completed',
        notes: null, // Clear draft data from notes field
      })
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress');

    if (error) {
      return { success: false, error: 'Failed to convert draft' };
    }

    revalidatePath('/golf/dashboard/rounds');

    // Fire-and-forget: trigger CoachHelm insight generation
    triggerPlayerInsightsAfterRound(player.id).catch((err) => {
      console.error('[CoachHelm] Post-round insight trigger failed:', err);
    });

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

    // Delete old drafts (using status and updated_at)
    const { data: deleted, error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .lt('updated_at', sevenDaysAgo.toISOString())
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
