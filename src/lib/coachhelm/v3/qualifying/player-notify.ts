/**
 * v3 Qualifying — player-facing selection-outcome notify (W32 follow-up).
 *
 * confirmSelection's only effects used to be silent from a player's point of
 * view: it upserts golf_qualifier_selections rows a player CAN read (RLS
 * grants qualifier_selections_player_read) but nothing ever surfaced them,
 * and it pushes a travel-brief chat message into the COACH's own private
 * CoachHelm conversation only (chat-push.ts). No player was ever told
 * whether they made the travel squad.
 *
 * This fans out email + push to every candidate once the roster commits,
 * reusing the existing notify helpers (sendEmailNotification /
 * sendPushNotification) — never a raw insert — so stored notification
 * preferences are respected exactly like every other golf notification.
 * Best-effort: a failure here must never fail confirmSelection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { sendEmailNotification } from '@/lib/notifications/email';
import { sendPushNotification } from '@/lib/notifications/push';
import type { QualifyingWorkspace } from './types';

type Sb = SupabaseClient<Database>;

/**
 * Notify every candidate in the workspace of the just-committed selection
 * outcome. Call this AFTER confirmSelection's top_score upsert + state flip
 * have both succeeded, so the re-read below reflects what was actually
 * written (the `workspace` argument is the PRE-confirm snapshot and does not
 * yet carry the freshly-inserted top_score rows).
 */
export async function notifyPlayersOfSelectionOutcome(
  supabase: Sb,
  workspace: QualifyingWorkspace,
): Promise<void> {
  const playerIds = workspace.candidates.map((c) => c.player_id);
  if (playerIds.length === 0) return;

  const { data: playerRows } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .in('id', playerIds);
  if (!playerRows?.length) return;

  const userIdByPlayer = new Map(playerRows.map((p) => [p.id, p.user_id]));

  const { data: userRows } = await supabase
    .from('users')
    .select('id, email')
    .in('id', playerRows.map((p) => p.user_id));
  if (!userRows?.length) return;

  const emailByUser = new Map(userRows.map((u) => [u.id, u.email]));

  // Re-read the committed rows so "selected" reflects what confirmSelection
  // just wrote, not the pre-confirm workspace snapshot this function was
  // handed (coach-pick rows can predate confirmation; top_score rows do not).
  const { data: finalSelections } = await supabase
    .from('golf_qualifier_selections')
    .select('player_id')
    .eq('qualifier_id', workspace.qualifier_id);
  const selectedPlayerIds = new Set((finalSelections ?? []).map((s) => s.player_id));

  await Promise.allSettled(
    workspace.candidates.map(async (c) => {
      const userId = userIdByPlayer.get(c.player_id);
      if (!userId) return;
      const email = emailByUser.get(userId);
      const outcome = selectedPlayerIds.has(c.player_id) ? 'selected' : 'not_selected';
      const data = { qualifierName: workspace.name, outcome };

      await Promise.allSettled([
        email
          ? sendEmailNotification('qualifier_updated', userId, email, data)
          : Promise.resolve({ success: true }),
        sendPushNotification('qualifier_updated', userId, data),
      ]);
    }),
  );
}
