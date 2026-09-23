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

describe('restoreUIMessages — status: complete (or legacy null), unaffected', () => {
  it('still drops a genuinely non-replayable part type', () => {
    const row = assistantRow({
      status: null,
      ui_parts: [
        { type: 'text', text: 'Reading 28 recorded rounds…' },
        { type: 'tool-progress', data: { note: 'in flight' } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts.map((p) => p.type)).not.toContain('tool-progress');
  });

  it('replays text and evidence for an accepted turn, unchanged', () => {
    const row = assistantRow({
      status: 'complete',
      ui_parts: [
        { type: 'text', text: 'His make rate is 71%.' },
        { type: 'data-evidence', data: { envelope: { coverage: 'ok' } } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts.map((p) => p.type)).toEqual(['text', 'data-evidence']);
  });

  it('a legacy row (status null, no ui_parts) still renders from content as a completed answer', () => {
    const row = assistantRow({ status: null, ui_parts: null, content: 'Legacy answer text.' });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts).toEqual([{ type: 'text', text: 'Legacy answer text.' }]);
  });
});

describe('restoreUIMessages — status: failed (repair plan §14.10, chat publication)', () => {
  /**
   * Review of PR #1975 (2026-09-22): the live grounding flag (route.ts's
   * `execute`, N15) is persisted into the assistant turn's `ui_parts` the
   * same way a chart or receipt is. Before `data-grounding-flag` was added
   * to the replay list, it was filtered out here on every reload — an
   * ungrounded answer looked flagged only during the original streaming
   * session and read as a normal, trustworthy one on every subsequent visit.
   */
  it('replays the grounding flag after a reload, and drops the fabricated text alongside it', () => {
    const row = assistantRow({
      status: 'failed',
      content: "His make rate is 71%.",
      ui_parts: [
        { type: 'text', text: "His make rate is 71%." },
        { type: 'data-grounding-flag', id: 'grounding-flag', data: { note: 'flagged' } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts.map((p) => p.type)).toEqual(['data-grounding-flag']);
    expect(restored!.parts.map((p) => p.type)).not.toContain('text');
  });

  it('a stream-incomplete row (its own data-turn-incomplete part, partial text) replays only the note', () => {
    const row = assistantRow({
      status: 'failed',
      content: 'The last three rounds show',
      ui_parts: [
        { type: 'text', text: 'The last three rounds show' },
        { type: 'data-turn-incomplete', id: 'turn-verdict', data: { note: "This answer didn't finish." } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts).toEqual([
      { type: 'data-turn-incomplete', id: 'restored-verdict', data: { note: "This answer didn't finish." } },
    ]);
  });

  /**
   * `execute` never reached its own verdict — the client disconnected, or
   * the platform tore the function down, before the stream finished (see
   * `route.ts`'s `turnVerdict` doc comment). `onFinish` still marks the row
   * `'failed'`, but nothing was ever written to `ui_parts` to explain why:
   * whatever fragment made it into `assistant.parts` is plain `text`, with
   * no verdict part alongside it. This must NOT fall through to the
   * legacy content-fallback branch (which would render the fragment as a
   * normal completed answer) — it falls back to a generic failure note.
   */
  it('a disconnect row (status failed, only a text fragment, no verdict part) never falls back to showing the fragment as text', () => {
    const row = assistantRow({
      status: 'failed',
      content: 'He hit 6 of the last',
      ui_parts: [{ type: 'text', text: 'He hit 6 of the last' }],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts).toHaveLength(1);
    expect(restored!.parts[0]!.type).not.toBe('text');
    const data = (restored!.parts[0] as { data?: { note?: string } }).data;
    expect(data?.note).toBeTruthy();
  });

  /** Same disconnect case, but `ui_parts` itself is null/empty — the legacy
   *  content-only fallback path must not apply to a failed row either. */
  it('a disconnect row with no ui_parts at all (legacy-shaped) still collapses to a failure note, never row.content as text', () => {
    const row = assistantRow({ status: 'failed', content: 'He hit 6 of the last', ui_parts: null });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts).toHaveLength(1);
    expect(restored!.parts.map((p) => p.type)).not.toContain('text');
  });

  /**
   * #1997 review, MUST-1/MUST-2: a proposal or receipt is a fact about an
   * ACTION, not a claim the numeric/claim audit judges, so the rejection
   * collapse must drop text and evidence but keep it. A receipt in
   * particular is for a write that already ran (executeGated → action.run →
   * recordOutcome) — losing it on reload would make a completed mutation
   * look like it never happened.
   */
  it('drops evidence/text for a rejected turn but keeps action-proposal/receipt parts — no partial trust in prose, full trust in facts about actions', () => {
    const row = assistantRow({
      status: 'failed',
      ui_parts: [
        { type: 'text', text: 'Some claim.' },
        { type: 'data-evidence', data: { envelope: { coverage: 'ok' } } },
        { type: 'data-action-proposal', data: { summary: 'Create a focus area', idempotency_key: 'k1' } },
        { type: 'data-action-receipt', data: { summary: 'Created a focus area' } },
        { type: 'data-grounding-flag', id: 'grounding-flag', data: { note: 'flagged' } },
      ],
    });

    const [restored] = restoreUIMessages([row]);

    expect(restored!.parts).toEqual([
      { type: 'data-grounding-flag', id: 'restored-verdict', data: { note: 'flagged' } },
      { type: 'data-action-proposal', data: { summary: 'Create a focus area', idempotency_key: 'k1' } },
      { type: 'data-action-receipt', data: { summary: 'Created a focus area' } },
    ]);
  });
});
