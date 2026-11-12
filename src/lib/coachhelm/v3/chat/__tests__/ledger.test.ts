import { beforeEach, describe, expect, it } from 'vitest';
import { buildChatLlmCallRow } from '@/lib/coachhelm/v3/llm/chat-call-row';
import { resetLedgerTasks, writeChatLedgerRow } from '../ledger';

/**
 * The chat's own task keys in the model-call ledger, on a database with and without the held migration that lets the
 * `task` CHECK take them (20261111090000).
 */
const KNOWN_BEFORE = ['round_review', 'hero_narrative', 'coach_chat', 'round_review_narrative'];
function ledger(opts: { takes?: string[]; broken?: boolean } = {}) {
  const takes = opts.takes ?? [...KNOWN_BEFORE, 'player_chat', 'chat_suggestions'];
  const rows: Array<{ task: string }> = [];
  const tried: string[] = [];
  const admin = {
    from: (table: string) => ({
      insert: async (row: { task: string }) => {
        expect(table).toBe('golf_coachhelm_llm_calls');
        tried.push(row.task);
        if (opts.broken) return { error: { code: '57014', message: 'canceling statement due to statement timeout' } };
        if (!takes.includes(row.task)) return { error: { code: '23514', message: 'violates check constraint "golf_coachhelm_llm_calls_task_check"' } };
        rows.push(row);
        return { error: null };
      },
    }),
  };
  return { admin: admin as never, rows, tried };
}
const row = buildChatLlmCallRow({ coachId: null, playerId: 'p', conversationId: 'turn-0123456789abcdef', modelId: 'anthropic/claude-haiku-5-5', promptTokens: 10, completionTokens: 2, costUsd: 0.00001, grounded: true });

beforeEach(() => resetLedgerTasks());

describe('writing a chat row to the model-call ledger', () => {
  it('under its own key where the database takes it', async () => {
    const db = ledger();
    expect(await writeChatLedgerRow(db.admin, row, 'player_chat', 'coach_chat')).toBe('written');
    expect(await writeChatLedgerRow(db.admin, row, 'chat_suggestions', null)).toBe('written');
    expect(db.rows.map((r) => r.task)).toEqual(['player_chat', 'chat_suggestions']);
    // Everything else on the row is as built.
    expect(db.rows[0]).toMatchObject({ player_id: 'p', coach_id: null, prompt_hash: 'turn-0123456789a', verified: true });
  });

  it('where the database refuses the key: under the fallback key, or not at all when there is none, and the key is not tried again', async () => {
    const db = ledger({ takes: KNOWN_BEFORE });
    expect(await writeChatLedgerRow(db.admin, row, 'player_chat', 'coach_chat')).toBe('written_as_fallback');
    expect(await writeChatLedgerRow(db.admin, row, 'player_chat', 'coach_chat')).toBe('written_as_fallback');
    expect(await writeChatLedgerRow(db.admin, row, 'chat_suggestions', null)).toBe('not_written');
    expect(await writeChatLedgerRow(db.admin, row, 'chat_suggestions', null)).toBe('not_written');
    expect(db.rows.map((r) => r.task)).toEqual(['coach_chat', 'coach_chat']);
    // Each refused key was tried once; a refusal of one key says nothing about the other.
    expect(db.tried).toEqual(['player_chat', 'coach_chat', 'coach_chat', 'chat_suggestions']);
    // A new process (or the migration applied and the instance replaced) tries again.
    resetLedgerTasks();
    const after = ledger();
    expect(await writeChatLedgerRow(after.admin, row, 'player_chat', 'coach_chat')).toBe('written');
  });

  it('any other failure is the caller’s: it throws, and the key is not written off', async () => {
    const down = ledger({ broken: true });
    await expect(writeChatLedgerRow(down.admin, row, 'player_chat', 'coach_chat')).rejects.toThrow('statement timeout');
    expect(down.tried).toEqual(['player_chat']);
    const up = ledger();
    expect(await writeChatLedgerRow(up.admin, row, 'player_chat', 'coach_chat')).toBe('written');
    // The fallback failing is a failure too.
    const half = ledger({ takes: [] });
    await expect(writeChatLedgerRow(half.admin, row, 'chat_suggestions', 'coach_chat')).rejects.toThrow('check constraint');
  });
});
