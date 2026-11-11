/**
 * CoachHelm chat: one selection decision in a qualifier.
 *
 *   set_qualifier_coach_pick   give one of the coach's pick places to an entered player: `setQualifierCoachPick`.
 *
 * It changes no score and no standing. The action's own rules are all left to the action and its service
 * (`lib/coachhelm/v3/qualifying/service.ts`: picks open once the qualifier is closed, the player must be entered and
 * have a scored round, the pick places must not all be taken); `plan` reads the same facts first so the card is not
 * drawn for a pick the action would refuse, and makes the action's own access check (`verifyTeamAccess`).
 *
 * What players see is decided by the qualifier's state, and the card says which: the board shows who was selected only
 * once the selection is confirmed (`src/clubhouse/data/qualifiers.ts` reads selections only in state `selected`), and
 * the coach's reason is never in a player's payload. Nothing is sent by a pick.
 *
 * Confirming the selection, which tells the team, is not here: INVENTORY.md says why.
 */
import 'server-only';
import { z } from 'zod';
import { setQualifierCoachPick } from '@/app/golf/actions/v3/qualifying';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';
import { keyOf } from '../action-planners';
import type { ProposalFact } from '../action-types';
import { CoachContextError, type CoachChatContext } from '../context';
import type { ChatTool, TaskTool, ToolContext } from '../engine/tool';
import { coachOnly, done, failed, list, now, rosterPlayer, settle, type StoredProposal } from './kit';

const PickInput = z.strictObject({
  qualifier_id: z.string().uuid(),
  player_id: z.string().uuid(),
  reasoning: z.string().min(1).max(500),
});
type PickInput = z.infer<typeof PickInput>;
const PickStored = z.object({ qualifier_id: z.string().uuid(), player_id: z.string().uuid(), reasoning: z.string().min(1), qualifier: z.string(), player: z.string() });

async function picksOf(ctx: ToolContext, qualifierId: string): Promise<string[] | null> {
  const { data, error } = await ctx.sb.from('golf_qualifier_selections').select('player_id, selection_type').eq('qualifier_id', qualifierId).eq('selection_type', 'coach_pick');
  return error ? null : (data ?? []).map((r) => r.player_id);
}

export const setQualifierPick: TaskTool<PickInput, StoredProposal> = {
  kind: 'task',
  name: 'set_qualifier_coach_pick',
  description:
    'Give one of the coach’s pick places in a closed qualifier to an entered player. reasoning: required, the coach’s own words; ask if none was given. No score changes; it does not confirm the selection or tell the team.',
  input: PickInput,
  progress: () => 'Preparing the pick',
  plan: async (ctx, input) => {
    const who: CoachChatContext = coachOnly(ctx);
    const player = rosterPlayer(who, input.player_id);
    const reasoning = input.reasoning.replace(/\s+/g, ' ').trim();
    if (!reasoning) throw new Error('A coach’s pick needs a reason. Ask the coach why.');
    const { data: q, error } = await ctx.sb.from('golf_qualifiers').select('id, team_id, name, selection_state, selection_slots_coach_pick').eq('id', input.qualifier_id).eq('team_id', who.team_id).maybeSingle();
    if (error) throw new Error('The qualifier could not be read just now. Try again in a moment.');
    if (!q || q.team_id !== who.team_id) throw new Error('That qualifier is not one of your team’s. Read the qualifiers first.');
    const access = await verifyTeamAccess(q.team_id, who.user_id, ctx.sb as never);
    if (!access.allowed) {
      if (access.reason === 'unavailable') throw new Error('Your access to this qualifier could not be checked just now. Try again in a moment.');
      throw new CoachContextError('Only this team’s coaches can make a pick.', 403);
    }
    if (!['closed', 'selected'].includes(q.selection_state)) throw new Error('Coach’s picks open once the qualifier is closed. Close it on the Qualifiers screen first.');
    if (q.selection_slots_coach_pick < 1) throw new Error('This qualifier has no coach’s pick places.');
    const { data: entry, error: entryError } = await ctx.sb.from('golf_qualifier_entries').select('player_id').eq('qualifier_id', q.id).eq('player_id', player.id).maybeSingle();
    if (entryError) throw new Error('Whether the player is entered could not be checked just now. Try again in a moment.');
    if (!entry) throw new Error(`${player.name} is not entered in ${q.name}.`);
    const picks = await picksOf(ctx, q.id);
    if (!picks) throw new Error('The picks already made could not be read just now. Try again in a moment.');
    if (picks.includes(player.id)) throw new Error(`${player.name} is already a coach’s pick for ${q.name}.`);
    const names = picks.map((id) => who.roster.find((p) => p.id === id)?.name ?? 'a player');
    if (picks.length >= q.selection_slots_coach_pick) throw new Error(`All ${q.selection_slots_coach_pick} coach’s pick places for ${q.name} are taken (${list(names)}). Take one back on the Qualifiers screen first.`);
    const confirmed = q.selection_state === 'selected';
    const facts: ProposalFact[] = [
      { label: 'Qualifier', value: q.name },
      { label: 'Coach’s pick', value: player.name },
      { label: 'Pick places', value: `${picks.length + 1} of ${q.selection_slots_coach_pick} used after this${names.length ? ` (already: ${list(names)})` : ''}` },
      { label: 'Reason', value: reasoning },
      { label: 'Who can read the reason', value: 'Coaches only. It is never shown to players.' },
      { label: 'Players see', value: confirmed ? `The selection is already confirmed, so ${player.name} shows as selected on the qualifier’s board at once. No notification is sent.` : 'Nothing yet. The squad shows on the qualifier’s board only after you confirm the selection on the Qualifiers screen. No notification is sent.' },
      { label: 'Scores', value: 'No score or standing changes.' },
    ];
    return {
      action: 'Make a coach’s pick',
      summary: `Make ${player.name} a coach’s pick for ${q.name}.`,
      facts,
      affects: [{ kind: 'player', id: player.id, label: player.name }],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['set_qualifier_coach_pick', q.id, player.id]),
      tool: 'set_qualifier_coach_pick',
      input: { qualifier_id: q.id, player_id: player.id, reasoning, qualifier: q.name, player: player.name },
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'set_qualifier_coach_pick';
    const who = coachOnly(ctx);
    const parsed = PickStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    if (!who.roster.some((p) => p.id === s.player_id)) return failed(name, 'That player is no longer on your roster. Nothing was changed.', false);
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the qualifier on the Qualifiers screen',
      look: async () => {
        const picks = await picksOf(ctx, s.qualifier_id);
        return picks ? picks.includes(s.player_id) : null;
      },
      // The qualifying actions answer `{ ok }`.
      write: async () => {
        const r = await setQualifierCoachPick(s.qualifier_id, s.player_id, s.reasoning);
        return { success: r.ok === true, error: r.error };
      },
      receipt: () => done(name, `${s.player} is a coach’s pick for ${s.qualifier}. The selection is not confirmed by this.`, [{ kind: 'qualifier_pick', count: 1, href: `/golf/dashboard/qualifiers/${s.qualifier_id}/selection`, label: s.qualifier }]),
    });
  },
};

/** In a fixed order. Coach surfaces only. */
export function qualifierTools(): ChatTool[] {
  return [setQualifierPick] as ChatTool[];
}
