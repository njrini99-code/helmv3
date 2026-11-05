import 'server-only';
import { tool, type ToolSet, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { CoachChatContext } from './context';
import { DraftBoardInput } from './create-tools';

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
export function askDraftTools({ sb, ctx, writer, practicePlans = false }: { practicePlans?: boolean; sb: SupabaseClient<Database>; ctx: CoachChatContext; writer: UIMessageStreamWriter }): ToolSet {
  let n = 0;
  return {
    find_thread: tool({
      description: 'Find a thread the coach is in by its title. Exactly one match: use its id with send_message. Zero or several: ask the coach, never pick.',
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
    draft_board: tool({
      description: 'Open a message to one player in Messages with a short note about the board you just drew. Sends nothing: the coach taps Send there.',
      inputSchema: DraftBoardInput,
      execute: async ({ player_id, note }) => {
        const player = ctx.roster.find((p) => p.id === player_id);
        if (!player) return { status: 'refused', message: 'That player is not on your active roster.' };
        writer.write({ type: 'data-handoff', id: `handoff-${(n += 1)}`, data: { kind: 'board', players: [player_id], title: `Draft for ${player.name}`, draft: note ?? '' } });
        return { status: 'shown', message: 'The draft is ready to open in Messages. Nothing was sent.' };
      },
    }),
  };
}
