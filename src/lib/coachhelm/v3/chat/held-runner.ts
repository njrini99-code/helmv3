import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { CoachChatContext } from './context';
import { executeAnnouncement, executeFocusArea, executeTask } from './action-planners';
import type { ActionReceipt } from './action-types';
import { CREATE_FLOWS, LINEUP_FLOWS, flowCommit, type FlowDef } from './create-tools';
import { publishFlow } from './practice-draft';
import type { HeldCommit, HeldRow } from './undo-hold';

const FLOWS: ReadonlyArray<FlowDef<never>> = [...CREATE_FLOWS, ...LINEUP_FLOWS, publishFlow as unknown as FlowDef<never>];

const unwritable = (tool: string): HeldCommit => ({
  run: async () => ({ status: 'failed', action: tool, summary: 'That didn’t go through. Nothing was saved.', created: [], notifications: [], partial_failures: [], error: 'The held action could not be rebuilt.', retryable: false, at: new Date().toISOString() } satisfies ActionReceipt),
});

/**
 * A held ledger row rebuilt into its write, for the sweep and Open: the request that held it may be gone, so all this has is `tool_name` and `proposed_input`.
 * The writes read the coach from the session, so this only ever runs inside the coach's own request. Another team's row is not this request's to write (TASK_FIELDS 5.3): null, and it stays held.
 * A row nothing can rebuild is recorded failed, with nothing written, so it never comes round again.
 */
export function heldCommitFor(sb: SupabaseClient<Database>, ctx: CoachChatContext, row: HeldRow): HeldCommit | null {
  if (row.team_id !== ctx.team_id) return null;
  const flow = FLOWS.find((f) => f.name === row.tool_name);
  if (flow) {
    const parsed = flow.input.safeParse(row.proposed_input);
    return parsed.success ? flowCommit(flow, sb, ctx, parsed.data) : unwritable(row.tool_name);
  }
  if (row.tool_name === 'create_focus_area') return { run: () => executeFocusArea(row.proposed_input as never) };
  if (row.tool_name === 'create_task') return { run: () => executeTask(row.proposed_input as never) };
  if (row.tool_name === 'create_team_announcement') return { run: () => executeAnnouncement(row.proposed_input as never) };
  return unwritable(row.tool_name);
}
