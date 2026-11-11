import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { isStoredProposal } from './action-runs';
import type { ActionProposal, ActionReceipt } from './action-types';
import type { CoachChatContext } from './context';
import type { ChatTool, TaskTool, ToolContext } from './engine/tool';
import type { HeldCommit, HeldRow } from './undo-hold';

const unwritable = (tool: string): HeldCommit => ({
  run: async () => ({ status: 'failed', action: tool, summary: 'That didn’t go through. Nothing was saved.', created: [], notifications: [], partial_failures: [], error: 'The held action could not be rebuilt.', retryable: false, at: new Date().toISOString() } satisfies ActionReceipt),
});

/**
 * A held ledger row rebuilt into its write, for the sweep and Open: the request that held it may be gone.
 * The row holds the plan the coach confirmed (`proposed_input.proposal`), so the write is that plan and nothing is
 * planned again. The writes read the coach from the session, so this only ever runs inside the coach's own request.
 * Another team's row is not this request's to write: null, and it stays held. A row nothing can rebuild (a tool that no
 * longer exists, a row of the previous stack) is recorded failed with nothing written, so it never comes round again.
 */
export function heldCommitFor(sb: SupabaseClient<Database>, ctx: CoachChatContext, row: HeldRow, tools: readonly ChatTool[]): HeldCommit | null {
  if (row.team_id !== ctx.team_id) return null;
  const tool = tools.find((t): t is TaskTool<unknown> => t.kind === 'task' && t.name === row.tool_name);
  if (!tool || !isStoredProposal(row.proposed_input)) return unwritable(row.tool_name);
  const proposal = row.proposed_input.proposal as ActionProposal;
  const toolContext: ToolContext = { sb, who: ctx, conversationId: row.conversation_id ?? '', surface: 'ask', loaders: {}, signal: new AbortController().signal, reads: new Map() };
  return { run: () => tool.commit(toolContext, proposal) };
}
