import { describe, it, expect } from 'vitest';
import { restoreUIMessages } from '@/lib/coachhelm/v3/chat/restore';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';

function assistantRow(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'fallback text',
    tool_calls: null,
    tool_results: null,
    cost_usd: null,
    created_at: '2026-01-01T00:00:00.000Z',
    client_turn_id: 't1',
    status: 'failed',
    ui_parts: null,
    ...overrides,
  };
}

describe('restoreUIMessages', () => {
  /**
   * Review of PR #1975 (2026-09-22): the live grounding flag (route.ts's
   * `execute`, N15) is persisted into the assistant turn's `ui_parts` the
   * same way a chart or receipt is. Before `data-grounding-flag` was added
   * to REPLAYABLE, it was filtered out here on every reload — an ungrounded
   * answer looked flagged only during the original streaming session and
   * read as a normal, trustworthy one on every subsequent visit.
   */
  it('replays the grounding flag after a reload', () => {
    const row = assistantRow({
      ui_parts: [
        { type: 'text', text: "His make rate is 71%." },
        { type: 'data-grounding-flag', id: 'grounding-flag', data: { note: 'flagged' } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts.map((p) => p.type)).toContain('data-grounding-flag');
  });

  it('still drops a genuinely non-replayable part type', () => {
    const row = assistantRow({
      ui_parts: [
        { type: 'text', text: 'Reading 28 recorded rounds…' },
        { type: 'tool-progress', data: { note: 'in flight' } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts.map((p) => p.type)).not.toContain('tool-progress');
  });
});
