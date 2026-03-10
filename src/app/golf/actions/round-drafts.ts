'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';

// UUID format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Maximum size for draft data (500KB)
const MAX_DRAFT_SIZE_BYTES = 500 * 1024;

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

type Hole = RoundHole;

export interface RoundDraftData {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  selectedQualifierId?: string | null;
  selectedRoundNumber?: number | null;
  inProgressShots?: Record<number, ShotRecord[]>;
  holesPerRound?: 9 | 18;
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

    // Bug #45: Validate draft data size to prevent abuse
    const draftJsonSize = new TextEncoder().encode(JSON.stringify(data)).length;
    if (draftJsonSize > MAX_DRAFT_SIZE_BYTES) {
      return { success: false, error: `Draft data too large (${Math.round(draftJsonSize / 1024)}KB). Maximum allowed is ${MAX_DRAFT_SIZE_BYTES / 1024}KB.` };
    }

    // Bug #43: Validate existingRoundId UUID format if provided
    if (existingRoundId && !isValidUuid(existingRoundId)) {
      return { success: false, error: 'Invalid round ID format' };
    }

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
    const totalHoles = data.holesPerRound ?? (data.holes.length > 0 ? data.holes.length : 18);

    // Draft data is stored in the dedicated draft_data JSONB column

    // Extract setup data with defaults
    const setupData = data.setupData;
    const defaultDate = new Date().toISOString().split('T')[0];

    const roundRecord = {
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
      draft_data: data as unknown as Record<string, unknown>, // JSONB column for draft state
      // Clear stats for drafts
      total_score: null as null,
      score_to_par: null as null,
      total_putts: null as null,
    };

    let roundId: string;
    // Use fromUntyped because draft_data column isn't in generated types yet
    const roundsTable = fromUntyped(supabase, 'golf_rounds');

    if (existingRoundId) {
      // Update existing draft — ONLY if still in_progress (never revert a completed round)
      const { data: updated, error: updateError } = await roundsTable
        .update(roundRecord)
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .select('id')
        .maybeSingle();

      if (updateError) {
        // If update fails, do NOT create a new round — this prevents orphan creation
        // when the original round was completed by submit
        return { success: false, error: 'Failed to save draft' };
      }
      if (!updated) {
        // Round was already completed or deleted — silently succeed to avoid error spam
        return { success: true, data: { roundId: existingRoundId, lastAutoSave: now } };
      }
      roundId = updated.id;
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
        // Update existing draft — ONLY if still in_progress
        const { error: updateError } = await fromUntyped(supabase, 'golf_rounds')
          .update(roundRecord)
          .eq('id', existingDraft.id)
          .eq('status', 'in_progress');

        if (updateError) {
          return { success: false, error: 'Failed to update existing draft' };
        }
        roundId = existingDraft.id;
      } else {
        // Create new draft
        const { data: created, error: createError } = await fromUntyped(supabase, 'golf_rounds')
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
    // Use fromUntyped because draft_data column isn't in generated types yet
    const { data: draft, error } = await fromUntyped(supabase, 'golf_rounds')
      .select(`
        id,
        course_name,
        course_city,
        course_state,
        round_date,
        round_type,
        current_hole,
        holes_played,
        draft_data,
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

    // Read draft data from dedicated column, fallback to notes for legacy data
    let draftData: RoundDraftData | null = null;
    if (draft.draft_data) {
      draftData = draft.draft_data as RoundDraftData;
    } else if (draft.notes) {
      try {
        draftData = JSON.parse(draft.notes) as RoundDraftData;
      } catch {
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
// CLEAR ROUND DRAFT
// ============================================================================

/**
 * Delete a draft round completely.
 */
export async function clearRoundDraft(roundId: string): Promise<ActionResult<void>> {
  try {
    // Bug #43: Validate UUID format before passing to Supabase query
    if (!isValidUuid(roundId)) {
      return { success: false, error: 'Invalid round ID format' };
    }

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

