import 'server-only';
import { tool, type ToolSet, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { CoachChatContext } from './context';
import { buildPollPayload } from '@/lib/golf/message-polls';
import { DraftBoardInput, DraftMessageInput, DraftPollInput } from './create-tools';

/** Which chat is asking: Quick chat's card is the coach's Send, the Ask tab hands words to Messages. */
export type AskSurface = 'ask' | 'quick_chat';

const POLL_PROBLEM: Record<string, string> = {
  question: 'A poll needs a question.',
  options: 'A poll needs 2 to 6 choices.',
  duplicate: 'Two choices say the same thing.',
  closes: 'The end time has to be in the future.',
  closes_far: 'The end time has to be within 30 days.',
};

const BriefInput = z.object({
  title: z.string().min(1).max(120),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        title: z.string().min(1).max(160),
        why: z.string().max(200).optional(),
        multi: z.boolean().optional(),
        options: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(80), hint: z.string().max(120).optional() })).min(2).max(6),
        pick: z.array(z.string()).max(6).optional(),
      }),
    )
    .min(1)
    .max(4),
});

/**
 * Tools that write nothing: the practice brief asks, and the board hands a draft to Messages. Neither is confirm-gated because neither has a write to gate (02 §14.3). `draft_poll` is not registered: it stays off until held `20261028140800` is applied.
 */
export function askDraftTools({ sb, ctx, writer, practicePlans = false, surface = 'ask' }: { practicePlans?: boolean; surface?: AskSurface; sb: SupabaseClient<Database>; ctx: CoachChatContext; writer: UIMessageStreamWriter }): ToolSet {
  let n = 0;
  return {
    find_thread: tool({
      description: 'Find a thread the coach is in by its title. Exactly one match: write to that thread with its id. Zero or several: ask the coach, never pick.',
      inputSchema: z.object({ title: z.string().min(1).max(120) }),
      execute: async ({ title }) => {
        const { data, error } = await sb.from('golf_conversations').select('id, title, golf_conversation_participants(user_id)').eq('team_id', ctx.team_id).ilike('title', title.replace(/[%_]/g, '')).limit(5);
        if (error) return { status: 'failed', message: 'Could not read your threads.' };
        return { status: 'ok', matches: (data ?? []).map((c) => ({ id: c.id, title: c.title, members: Math.max(0, (c.golf_conversation_participants?.length ?? 1) - 1) })) };
      },
    }),
    ...(practicePlans
      ? {
          ask_practice_brief: tool({
            description: 'Ask the coach up to four questions before building a practice plan. Never ask what a read already answered; give each option\'s source in `hint` and put the read\'s default in `pick`. Their answers come back as the next user turn. Writes nothing.',
            inputSchema: BriefInput,
            execute: async (input) => {
              writer.write({ type: 'data-brief', id: `brief-${(n += 1)}`, data: input });
              return { status: 'shown', message: 'The questions are on screen. Stop here and wait for the coach to answer.' };
            },
          }),
        }
      : {}),
    // TASK_FIELDS 5.14: until the bank exists the flow says so, and offers the plan block instead of a card it can't keep.
    ...(practicePlans
      ? {}
      : {
          drill_bank_status: tool({
            description: 'The coach asked to save a new drill. Call this, and say what it returns, instead of offering to save it.',
            inputSchema: z.object({}),
            execute: async () => ({ status: 'unavailable', message: 'Drill bank comes with the practice builder. Offer to put this drill into a practice plan block instead.' }),
          }),
        }),
    draft_board: tool({
      description: 'Make a board for one player from the visuals you drew this turn with show_visual: draw them first. It goes in a message to them in Messages as an image, under your short note. Sends nothing: the coach taps Send there.',
      inputSchema: DraftBoardInput,
      execute: async ({ player_id, note }) => {
        const player = ctx.roster.find((p) => p.id === player_id);
        if (!player) return { status: 'refused', message: 'That player is not on your active roster.' };
        writer.write({ type: 'data-handoff', id: `handoff-${(n += 1)}`, data: { kind: 'board', players: [player_id], title: `Draft for ${player.name}`, draft: note ?? '' } });
        return { status: 'shown', message: 'The draft is ready to open in Messages. Nothing was sent.' };
      },
    }),
    // TASK_FIELDS 3 and 5.4: only Quick chat's card is the coach's Send. In the Ask tab a message is words handed to the composer.
    ...(surface === 'quick_chat'
      ? {}
      : {
          draft_poll: tool({
            description: 'Open a poll in a group thread found with find_thread, in the poll sheet in Messages. Posts nothing: the coach taps Send there. Votes always show names.',
            inputSchema: DraftPollInput,
            execute: async ({ conversation_id, question, options, multi, closes_at }) => {
              const built = buildPollPayload({ question, options, multi: !!multi, closesAt: closes_at ?? null });
              if (!built.ok) return { status: 'refused', message: POLL_PROBLEM[built.problem] };
              const { data, error } = await sb.from('golf_conversations').select('id, title, golf_conversation_participants(user_id)').eq('team_id', ctx.team_id).eq('id', conversation_id).maybeSingle();
              if (error) return { status: 'failed', message: 'Could not read that thread.' };
              if (!data) return { status: 'refused', message: 'That thread is not on your team.' };
              if ((data.golf_conversation_participants?.length ?? 0) < 3) return { status: 'refused', message: 'A poll goes in a group thread.' };
              const thread = data.title ?? 'this thread';
              writer.write({ type: 'data-handoff', id: `handoff-${(n += 1)}`, data: { kind: 'poll', players: [], conversationId: data.id, title: `Poll for ${thread}`, thread, draft: '', poll: { question, options, ...(multi ? { multi: true } : {}), ...(closes_at ? { closes: closes_at } : {}) } } });
              return { status: 'shown', message: 'The poll is ready to open in Messages. Nothing was posted.' };
            },
          }),
          draft_message: tool({
            description: 'Open a message in Messages with the words already in the composer, for one thread found with find_thread or for named players. Sends nothing: the coach taps Send there.',
            inputSchema: DraftMessageInput,
            execute: async ({ conversation_id, player_ids, content }) => {
              if (conversation_id) {
                const { data, error } = await sb.from('golf_conversations').select('id, title').eq('team_id', ctx.team_id).eq('id', conversation_id).maybeSingle();
                if (error) return { status: 'failed', message: 'Could not read that thread.' };
                if (!data) return { status: 'refused', message: 'That thread is not on your team.' };
                writer.write({ type: 'data-handoff', id: `handoff-${(n += 1)}`, data: { kind: 'message', players: [], conversationId: data.id, title: data.title ? `Draft for ${data.title}` : 'Draft for this thread', draft: content } });
                return { status: 'shown', message: 'The draft is ready to open in Messages. Nothing was sent.' };
              }
              const people = (player_ids ?? []).map((id) => ctx.roster.find((p) => p.id === id));
              if (!people.length || people.some((p) => !p)) return { status: 'refused', message: 'Every player must be on your active roster.' };
              const only = people.length === 1 ? people[0] : null;
              writer.write({ type: 'data-handoff', id: `handoff-${(n += 1)}`, data: { kind: 'message', players: people.map((p) => p!.id), title: only ? `Draft for ${only.name}` : `Draft for ${people.length} players`, draft: content } });
              return { status: 'shown', message: 'The draft is ready to open in Messages. Nothing was sent.' };
            },
          }),
        }),
  };
}
