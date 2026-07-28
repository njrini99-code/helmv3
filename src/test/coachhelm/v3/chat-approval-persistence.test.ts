import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { hasPersistableAssistantContent } from '@/lib/coachhelm/v3/chat/ui-parts';

function assistantWith(parts: unknown[]): UIMessage {
  return { id: 'assistant-1', role: 'assistant', parts } as unknown as UIMessage;
}

describe('CoachHelm chat — approval-only assistant persistence', () => {
  it('keeps a no-text approval request so the pending Confirm card survives reload', () => {
    const message = assistantWith([
      { type: 'step-start' },
      {
        type: 'tool-create_focus_area',
        toolCallId: 'call-1',
        state: 'approval-requested',
        approval: { id: 'approval-1' },
        input: { player_id: 'player-1' },
      },
    ]);

    expect(hasPersistableAssistantContent(message, '')).toBe(true);
  });

  it('still rejects a metadata-only blank assistant turn', () => {
    expect(hasPersistableAssistantContent(assistantWith([{ type: 'step-start' }]), '')).toBe(false);
  });
});
