/**
 * Chat's LLM-call ledger row hardcodes `verified: false`, so the grounding
 * outcome never reaches `golf_coachhelm_llm_calls`.
 *
 * Measured against production 2026-08-18:
 *
 *     task              calls   verified=true   fallback_to_template
 *     hero_narrative      186        141                 39
 *     round_review        121         29                 82
 *     coach_chat           37          0                  0
 *
 * Zero of 37 on both columns, while the other two tasks populate them. The
 * value is not unknown — `chat/stream/route.ts:425` computes
 * `const grounded = unsupported.length === 0` and uses it twenty lines later to
 * store the message as 'complete' or 'failed'. It simply never reaches
 * `recordTurnCost`, which inserts a literal `false`.
 *
 * WHY THIS IS NOT COSMETIC. #1474 tracks citation discards by reading
 * `error_logs` and `llm_calls.verified`. Measured the same day,
 * `golf_coachhelm_chat_messages.status` shows 22 of 47 status-bearing chat
 * replies flagged ungrounded — a ~47% discard rate, the worst of the three
 * tasks. Anyone measuring from the ledger sees 0 and concludes chat is clean.
 * The one surface with the biggest problem is the one the instrument cannot
 * see.
 *
 * `fallback_to_template` stays FALSE and that is correct, not an oversight:
 * chat never swaps in a deterministic template. When grounding fails it
 * appends UNGROUNDED_NOTE to the model's own text and stores it as 'failed'.
 * Writing `true` there would claim a template fallback that did not happen.
 */
import { describe, it, expect } from 'vitest';
import { buildChatLlmCallRow } from '@/lib/coachhelm/v3/llm/chat-call-row';

const BASE = {
  coachId: 'coach-1',
  conversationId: '11111111-2222-3333-4444-555555555555',
  modelId: 'claude-sonnet-5',
  promptTokens: 1200,
  completionTokens: 300,
  costUsd: 0.068,
};

describe('buildChatLlmCallRow', () => {
  it('records verified=true when the answer was grounded', () => {
    expect(buildChatLlmCallRow({ ...BASE, grounded: true }).verified).toBe(true);
  });

  it('records verified=false when grounding failed', () => {
    expect(buildChatLlmCallRow({ ...BASE, grounded: false }).verified).toBe(false);
  });

  it('never claims a template fallback — chat does not have one', () => {
    // Grounding failure appends UNGROUNDED_NOTE to the model's own text; no
    // deterministic template is ever substituted.
    for (const grounded of [true, false]) {
      expect(buildChatLlmCallRow({ ...BASE, grounded }).fallback_to_template).toBe(false);
    }
  });

  it('hashes the conversation id and never carries prompt text', () => {
    const row = buildChatLlmCallRow({ ...BASE, grounded: true });
    expect(row.prompt_hash).toBe('11111111-2222-33');
    expect(row.prompt_hash.length).toBeLessThanOrEqual(16);
  });

  it('carries no player scope — a chat turn is coach-scoped', () => {
    expect(buildChatLlmCallRow({ ...BASE, grounded: true }).player_id).toBeNull();
  });

  it('passes token counts and cost through unchanged', () => {
    const row = buildChatLlmCallRow({ ...BASE, grounded: true });
    expect(row.prompt_tokens).toBe(1200);
    expect(row.completion_tokens).toBe(300);
    expect(row.cost_usd).toBe(0.068);
    expect(row.task).toBe('coach_chat');
    expect(row.model_id).toBe('claude-sonnet-5');
  });
});
