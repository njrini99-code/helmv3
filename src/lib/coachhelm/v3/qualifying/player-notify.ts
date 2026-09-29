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
 *
 * Three outcomes, not two: an entrant who never posted a score was never
 * ranked, so telling them 'not_selected' claims a comparison that did not
 * happen (8 of 14 entrants on the two live qualifiers with selections). They
 * get a distinct 'not_scored' notice. When nobody was selected at all there is
 * no result to announce and nobody is notified. Every notice also writes an
 * in-app `notifications` row carrying the outcome — the bell entry and the
 * receipt that lets a send be audited.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { sendEmailNotification } from '@/lib/notifications/email';
import { sendPushNotification } from '@/lib/notifications/push';
import { recordInAppNotification } from '@/lib/notifications/in-app';
import type { QualifyingWorkspace, SelectionCandidate } from './types';
import { allSettledReported } from '@/lib/settled-failures';

type Sb = SupabaseClient<Database>;

export type SelectionOutcome = 'selected' | 'not_selected' | 'not_scored';

/** An entrant with no posted score was never ranked against anyone. */
export function selectionOutcomeFor(
  candidate: Pick<SelectionCandidate, 'total_score' | 'rounds_completed'>,
  selected: boolean,
): SelectionOutcome {
  if (selected) return 'selected';
  if (candidate.total_score === null || candidate.rounds_completed === 0) return 'not_scored';
  return 'not_selected';
}

export function selectionOutcomeCopy(
  outcome: SelectionOutcome,
  qualifierName: string,
): { title: string; body: string } {
  switch (outcome) {
    case 'selected':
      return { title: 'You made the travel squad', body: `${qualifierName}: you were selected.` };
    case 'not_selected':
      return { title: 'Qualifier results posted', body: `${qualifierName}: you were not selected this time.` };
    case 'not_scored':
      return {
        title: 'No qualifier score recorded',
        body: `${qualifierName}: no score was recorded for you, so you were not ranked. Check with your coach.`,
      };
  }
}

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

  // Re-read the committed rows so "selected" reflects what confirmSelection
  // just wrote, not the pre-confirm workspace snapshot this function was
  // handed (coach-pick rows can predate confirmation; top_score rows do not).
  const { data: finalSelections } = await supabase
    .from('golf_qualifier_selections')
    .select('player_id')
    .eq('qualifier_id', workspace.qualifier_id);
  const selectedPlayerIds = new Set((finalSelections ?? []).map((s) => s.player_id));
  // Nobody selected means there is no result to announce; telling every
  // entrant 'not_selected' would be false for all of them.
  if (selectedPlayerIds.size === 0) return;

  const { data: playerRows } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .in('id', playerIds);
  if (!playerRows?.length) return;

  const userIdByPlayer = new Map(playerRows.map((p) => [p.id, p.user_id]));

  const { data: userRows } = await supabase
    .from('users')
    .select('id, email')
    // `user_id` is nullable once an account is deleted and the player's history
    // is preserved (20260819200000). A null is not a recipient — drop it so the
    // rest of the batch still gets notified, matching the three fan-outs in
    // golf.ts that already do this. NOT NULL in production today, so this
    // removes nothing yet: that is what lets it ship before the migration.
    .in('id', playerRows.map((p) => p.user_id).filter((id): id is string => Boolean(id)));
  if (!userRows?.length) return;

  const emailByUser = new Map(userRows.map((u) => [u.id, u.email]));


  await Promise.allSettled(
    workspace.candidates.map(async (c) => {
      const userId = userIdByPlayer.get(c.player_id);
      if (!userId) return;
      const email = emailByUser.get(userId);
      const outcome = selectionOutcomeFor(c, selectedPlayerIds.has(c.player_id));
      const copy = selectionOutcomeCopy(outcome, workspace.name);
      const data = {
        qualifierName: workspace.name,
        qualifierId: workspace.qualifier_id,
        outcome,
        title: copy.title,
        body: copy.body,
      };

      // Reasons reported, not swallowed — see INC-2026-08-27. A failed send
      // here previously left no trace anywhere the Bridge could see.
      await allSettledReported(
        [
          email
            ? sendEmailNotification('qualifier_updated', userId, email, data)
            : Promise.resolve({ success: true }),
          sendPushNotification('qualifier_updated', userId, data),
          recordInAppNotification({
            userIds: [userId],
            type: 'event_reminder',
            title: copy.title,
            body: copy.body,
            actionUrl: `/golf/dashboard/qualifiers/${workspace.qualifier_id}`,
            data: {
              kind: 'qualifier_selection',
              qualifier_id: workspace.qualifier_id,
              qualifier_outcome: outcome,
            },
            context: 'coachhelm.qualifying.notifyPlayers',
          }),
        ],
        { action: 'coachhelm.qualifying.notifyPlayers', featureArea: 'qualifiers', label: outcome },
      );
    }),
  );
}
