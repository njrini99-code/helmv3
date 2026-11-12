/**
 * CoachHelm chat: writing a model call to the ledger (`golf_coachhelm_llm_calls`) under the chat's own task keys.
 *
 * The ledger's `task` column has a CHECK that lists the tasks. `player_chat` (a player's Ask turn) and `chat_suggestions`
 * (the small call after a coach's answer) are added by the held migration 20261111090000. This is what makes the code
 * run with or without it: the row is tried under its own key; if the database refuses the key (23514), that is
 * remembered for the life of the process and the row is written under the fallback key, or not at all when there is
 * none. Any other failure is the caller's to handle.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { ChatLlmCallRow } from '@/lib/coachhelm/v3/llm/chat-call-row';
import type { ChatLedgerTask } from '@/lib/coachhelm/v3/llm/types';

/** The task keys this process has seen the database refuse. */
const refused = new Set<ChatLedgerTask>();
/** For tests: forget what was refused. */
export const resetLedgerTasks = (): void => refused.clear();

/** Postgres: a row violates a CHECK constraint. */
const CHECK_VIOLATION = '23514';

export type LedgerWrite =
  /** Written under its own key. */
  | 'written'
  /** The database does not take the key yet: written under the fallback key. */
  | 'written_as_fallback'
  /** The database does not take the key yet and there is no fallback: no row. */
  | 'not_written';

/**
 * Write one row. `task`: the key it should carry. `fallback`: the key to use where the database refuses that one, or
 * null to write nothing there. Throws on any failure that is not the key being refused.
 */
export async function writeChatLedgerRow(admin: SupabaseClient<Database>, row: ChatLlmCallRow, task: ChatLedgerTask, fallback: ChatLedgerTask | null): Promise<LedgerWrite> {
  if (!refused.has(task)) {
    const { error } = await admin.from('golf_coachhelm_llm_calls').insert({ ...row, task });
    if (!error) return 'written';
    if (error.code !== CHECK_VIOLATION) throw new Error(error.message);
    refused.add(task);
  }
  if (!fallback) return 'not_written';
  const { error } = await admin.from('golf_coachhelm_llm_calls').insert({ ...row, task: fallback });
  if (error) throw new Error(error.message);
  return 'written_as_fallback';
}
