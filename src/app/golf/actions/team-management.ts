'use server';

import { randomInt } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
import {
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { gateUserAction } from '@/lib/auth/action-rate-limit';
import { isInviteEmail, MAX_INVITE_EMAILS, normalizeInviteEmail } from '@/lib/golf/invite-emails';
import { canEmailPlayerInvites, sendGolfPlayerInviteEmails } from '@/lib/golf/player-invite-email';
import { getCoachTeamId } from './golf-action-shared';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { ActionResult } from './golf-action-shared';

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']),
  requiresAcknowledgement: z.boolean(),
});
// ============================================================================
// ANNOUNCEMENT ACTIONS
// ============================================================================

async function createAnnouncementImpl(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}): Promise<ActionResult<{ announcementId: string }>> {
  try {
    // Validate input
    const validatedData = announcementSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create announcements' };
    }

    // Get coach and team
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    const { data: announcement, error } = await supabase
      .from('golf_announcements')
      .insert({
        team_id: teamId,
        title: validatedData.title,
        body: validatedData.body,
        urgency: validatedData.urgency,
        requires_acknowledgement: validatedData.requiresAcknowledgement,
        send_push: false,
        send_email: false,
        published_at: new Date().toISOString(),
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: 'Failed to create announcement. Please try again.' };
    }

    revalidatePath('/golf/dashboard/announcements');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: { announcementId: announcement.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid announcement data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}
const observedCreateAnnouncement = withAdminObserved(
  'createAnnouncement',
  { demoSafe: true, sport: 'golf', feature: 'announcements' },
  createAnnouncementImpl,
);
export async function createAnnouncement(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}): Promise<ActionResult<{ announcementId: string }>> {
  return observedCreateAnnouncement(data);
}
// ============================================================================
// PLAYER ACTIONS
// ============================================================================

async function invitePlayerToTeamImpl(

  _email: string // Email parameter reserved for future email invitations
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to invite players' };
    }

    // Get coach
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Get team - uses join_code column, not invite_code
    const { data: team } = await supabase
      .from('golf_teams')
      .select('name, join_code')
      .eq('id', teamId)
      .single();

    // Generate join code if not exists or is placeholder
    // Uses 8-char readable format (no confusing chars like 0/O, 1/I/L)
    let joinCode = team?.join_code;
    if (!joinCode || joinCode.length < 6) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      joinCode = '';
      for (let i = 0; i < 8; i++) {
        joinCode += chars.charAt(randomInt(chars.length));
      }
      const { error: updateError } = await supabase
        .from('golf_teams')
        .update({ join_code: joinCode })
        .eq('id', teamId);

      if (updateError) {
        return { success: false, error: 'Failed to generate invite code. Please try again.' };
      }
    }

    return {
      success: true,
      data: {
        inviteCode: joinCode,
        inviteLink: `/golf/join/${joinCode}`,
      },
    };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedInvitePlayerToTeam = withAdminObserved(
  'invitePlayerToTeam',
  { sport: 'golf', feature: 'roster_management' },
  invitePlayerToTeamImpl,
);
export async function invitePlayerToTeam(
  _email: string // Email parameter reserved for future email invitations
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  return observedInvitePlayerToTeam(_email);
}

const INVITE_EMAILS_RATE_LIMIT = { maxAttempts: 10, windowMs: 60 * 60 * 1000 } as const;
const inviteEmailsSchema = z.array(z.string().max(320)).min(1).max(MAX_INVITE_EMAILS);

/**
 * Emails the team's join link and code to players the coach names (Clubhouse › Roster › Invite players). The coach's own
 * team (the cookie-aware resolver, as the other roster actions), never one the client names. Nothing about the addresses
 * is revealed back: it does not say whether one already has an account. The send is the owner-gated customer email
 * (src/lib/golf/player-invite-email.ts), so with email paused it says so and sends nothing.
 */
async function emailPlayerInvitesImpl(
  emails: string[]
): Promise<ActionResult<{ sent: number; failed: string[] }>> {
  try {
    const parsed = inviteEmailsSchema.safeParse(emails);
    if (!parsed.success) {
      return { success: false, error: `Add between 1 and ${MAX_INVITE_EMAILS} email addresses.`, code: 'invalid_emails' };
    }
    const bad = parsed.data.filter((e) => !isInviteEmail(e));
    if (bad.length > 0) {
      return { success: false, error: 'Check the email addresses and try again.', code: 'invalid_emails' };
    }
    const addresses = [...new Set(parsed.data.map(normalizeInviteEmail))];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to invite players' };
    }

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (coachError) throw coachError;
    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }
    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    if (!canEmailPlayerInvites()) {
      return { success: false, error: 'Email invites are off right now. Share the team code or link instead.', code: 'email_off' };
    }

    const gate = await gateUserAction(
      'golf:player-invite-email',
      user.id,
      INVITE_EMAILS_RATE_LIMIT,
      'You have sent a lot of invites. Try again in a little while, or share the team code or link.',
    );
    if (!gate.allowed) {
      return { success: false, error: gate.error, code: 'rate_limited' };
    }

    const { data: team, error: teamError } = await supabase.from('golf_teams').select('name, join_code').eq('id', teamId).maybeSingle();
    if (teamError) throw teamError;
    if (!team?.join_code || team.join_code.length < 6) {
      return { success: false, error: 'This team has no code yet. Make one in Settings, then invite players.', code: 'no_code' };
    }

    const result = await sendGolfPlayerInviteEmails({
      emails: addresses,
      coachName: coach.full_name,
      teamId,
      teamName: team.name ?? 'your team',
      joinCode: team.join_code,
    });
    if (result.status !== 'done') {
      return { success: false, error: 'Email invites are off right now. Share the team code or link instead.', code: 'email_off' };
    }
    return { success: true, data: { sent: result.sent, failed: result.failed } };
  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedEmailPlayerInvites = withAdminObserved(
  'emailPlayerInvites',
  { sport: 'golf', feature: 'roster_management' },
  emailPlayerInvitesImpl,
);
export async function emailPlayerInvites(
  emails: string[]
): Promise<ActionResult<{ sent: number; failed: string[] }>> {
  return observedEmailPlayerInvites(emails);
}
async function updatePlayerStatusImpl(
  playerId: string,
  // The golf_team_members.status column allows active/inactive/removed; the
  // roster UI now offers active/inactive only (B4/F007). 'injured'/'redshirt'
  // remain in the param type as a no-op for any stale caller but can no longer
  // be selected from the UI.
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update player status' };
    }

    // F153/F154: resolve the coach's ACTIVE team via the cookie-aware resolver
    // (mirrors removePlayerFromTeam). The previous requireGolfCoach() path
    // resolved the team with an org-wide .maybeSingle() that ERRORS on a
    // two-team org (men's + women's) — the status picker silently failed for any
    // such program. resolveCoachTeamIdWithCookie never throws on multi-team orgs
    // and honours the active-team toggle.
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Only coaches can update player status' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify the player is on the coach's resolved team.
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!membership) {
      return { success: false, error: 'Player is not on your team' };
    }

    // Update status on golf_team_members. The status CHECK allows
    // active/inactive/removed; the UI only sends active/inactive.
    const { error } = await supabase
      .from('golf_team_members')
      .update({
        // Cast to bypass strict enum typing — the DB CHECK governs the value.
        status: status as unknown as 'active' | 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('player_id', playerId)
      .eq('team_id', teamId);

    if (error) {
      return { success: false, error: 'Failed to update player status' };
    }

    revalidatePath('/golf/dashboard/roster');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.ROSTER);
    return { success: true };

  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedUpdatePlayerStatus = withAdminObserved(
  'updatePlayerStatus',
  { demoSafe: true, sport: 'golf', feature: 'roster_management' },
  updatePlayerStatusImpl,
);
export async function updatePlayerStatus(
  playerId: string,
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  return observedUpdatePlayerStatus(playerId, status);
}

// ============================================================================
// AVAILABILITY (Clubhouse roster, P003)
// ============================================================================

/**
 * Whether a player can play right now: available, injured or away. Display only, on the coach's roster: it never changes
 * team access (that is `status`, Mark inactive). golf_team_members.availability is CHECKed to these three values; the
 * write policy is golf_team_members_update_coach (head or assistant coach of the team). Players have no UPDATE policy,
 * so there is no self-report.
 *
 * No note: golf_team_members_select_v5 lets every teammate read every column of their team's rows, so a free-text
 * reason (health-adjacent) cannot live in availability_note until a coach-only store exists (a held migration;
 * docs/clubhouse/held/data/roster-availability.md). This action never reads or writes that column, and refuses a note.
 */
export type PlayerAvailability = 'available' | 'injured' | 'away';
const AVAILABILITY_VALUES: readonly PlayerAvailability[] = ['available', 'injured', 'away'];

async function setPlayerAvailabilityImpl(input: {
  playerId: string;
  availability: PlayerAvailability;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // A server action takes whatever the caller sends. A note would be readable by teammates, so it is refused, not
    // dropped silently: nothing is written.
    if (input && typeof input === 'object' && 'note' in input) {
      return { success: false, error: 'Availability notes are not saved' };
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update player availability' };
    }

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coachError) {
      await logServerError(`setPlayerAvailability coach read failed: ${coachError.message}`, {
        action: 'roster.setPlayerAvailability',
        playerId: input.playerId,
      });
      return { success: false, error: 'Failed to update player availability' };
    }
    if (!coach) {
      return { success: false, error: 'Only coaches can update player availability' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    if (!AVAILABILITY_VALUES.includes(input.availability)) {
      return { success: false, error: 'Choose available, injured or away' };
    }

    const { data: membership, error: membershipError } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', input.playerId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (membershipError) {
      await logServerError(`setPlayerAvailability membership read failed: ${membershipError.message}`, {
        action: 'roster.setPlayerAvailability',
        playerId: input.playerId,
        teamId,
      });
      return { success: false, error: 'Failed to update player availability' };
    }
    if (!membership) {
      return { success: false, error: 'Player is not on your team' };
    }

    const now = new Date().toISOString();
    const { error, count } = await supabase
      .from('golf_team_members')
      .update(
        {
          availability: input.availability,
          availability_updated_at: now,
          updated_at: now,
        },
        { count: 'exact' },
      )
      .eq('player_id', input.playerId)
      .eq('team_id', teamId);

    if (error) {
      await logServerError(`setPlayerAvailability failed: ${error.message}`, {
        action: 'roster.setPlayerAvailability',
        playerId: input.playerId,
        teamId,
      });
      return { success: false, error: 'Failed to update player availability' };
    }
    // RLS hid the row (an assistant whose staff row lapsed, say): nothing was written, so it is not a save.
    if (!count) {
      return { success: false };
    }

    revalidatePath('/golf/dashboard/roster');
    updateTag(CACHE_TAGS.ROSTER);
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedSetPlayerAvailability = withAdminObserved(
  'setPlayerAvailability',
  {
    demoSafe: true,
    sport: 'golf',
    feature: 'roster_management',
    contextFrom: ([i]) => ({ playerId: i.playerId }),
  },
  setPlayerAvailabilityImpl,
);

/**
 * The coach-only reason beside Injured or Away (at most 280 characters, one per player per team). It lives in
 * golf_player_availability_coach_notes, whose policies admit only a coach of the team: golf_team_members.availability_note
 * stays unused because teammates can read it. That table arrives with a held migration
 * (supabase/migrations/20261022090000_golf_player_availability_coach_notes.sql); until it is applied the write answers
 * "not available yet" and the roster draws no note field. An empty note removes the row.
 */
const AVAILABILITY_NOTE_MAX = 280; // same as data/availability.ts; a 'use server' file exports only async functions
const NOTE_TABLE_MISSING = new Set(['42P01', 'PGRST205']);

async function setPlayerAvailabilityCoachNoteImpl(input: {
  playerId: string;
  note: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const action = 'roster.setPlayerAvailabilityCoachNote';
  try {
    const note = typeof input?.note === 'string' ? input.note.trim() : '';
    if (note.length > AVAILABILITY_NOTE_MAX) {
      return { success: false, error: `Keep the note to ${AVAILABILITY_NOTE_MAX} characters` };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to save a note' };
    }

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (coachError) {
      await logServerError(`setPlayerAvailabilityCoachNote coach read failed: ${coachError.message}`, { action, playerId: input.playerId });
      return { success: false, error: 'Failed to save the note' };
    }
    if (!coach) {
      return { success: false, error: 'Only coaches can save a note' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    const { data: membership, error: membershipError } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', input.playerId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (membershipError) {
      await logServerError(`setPlayerAvailabilityCoachNote membership read failed: ${membershipError.message}`, { action, playerId: input.playerId, teamId });
      return { success: false, error: 'Failed to save the note' };
    }
    if (!membership) {
      return { success: false, error: 'Player is not on your team' };
    }

    const table = fromUntyped(supabase, 'golf_player_availability_coach_notes');
    const { error } = note
      ? await table.upsert(
          { team_id: teamId, player_id: input.playerId, note, updated_by: user.id, updated_at: new Date().toISOString() },
          { onConflict: 'team_id,player_id' },
        )
      : await table.delete().eq('team_id', teamId).eq('player_id', input.playerId);
    if (error) {
      if (NOTE_TABLE_MISSING.has(String(error.code))) {
        return { success: false, error: 'Notes are not available yet' };
      }
      await logServerError(`setPlayerAvailabilityCoachNote failed: ${error.message}`, { action, playerId: input.playerId, teamId });
      return { success: false, error: 'Failed to save the note' };
    }

    revalidatePath('/golf/dashboard/roster');
    updateTag(CACHE_TAGS.ROSTER);
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedSetPlayerAvailabilityCoachNote = withAdminObserved(
  'setPlayerAvailabilityCoachNote',
  {
    demoSafe: true,
    sport: 'golf',
    feature: 'roster_management',
    contextFrom: ([i]) => ({ playerId: i.playerId }),
  },
  setPlayerAvailabilityCoachNoteImpl,
);
export async function setPlayerAvailabilityCoachNote(input: {
  playerId: string;
  note: string | null;
}): Promise<{ success: boolean; error?: string }> {
  return observedSetPlayerAvailabilityCoachNote(input);
}
export async function setPlayerAvailability(input: {
  playerId: string;
  availability: PlayerAvailability;
}): Promise<{ success: boolean; error?: string }> {
  return observedSetPlayerAvailability(input);
}
