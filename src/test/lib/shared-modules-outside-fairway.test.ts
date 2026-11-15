import { describe, it, expect } from 'vitest';
import * as oldHaptics from '@/lib/fairway/haptics';
import * as sharedHaptics from '@/lib/native-haptics';
import * as sharedKind from '@/lib/golf/conversation-kind';

/**
 * C-26. The haptic layer and the conversation-kind rules are shared logic that lived under Fairway paths, so any
 * surface that is not Fairway had to import Fairway (or copy them) to use them. They now live in src/lib. The haptics'
 * old path re-exports them; the conversation-kind one went with Fairway's pages (2026-11-14).
 */
describe('shared modules live outside Fairway (C-26)', () => {
  it('@/lib/fairway/haptics re-exports @/lib/native-haptics, binding for binding', () => {
    const names = Object.keys(sharedHaptics).sort();
    expect(names).toEqual(expect.arrayContaining(['fwHaptic', 'fwHapticSequence', 'areHapticsEnabled']));
    expect(Object.keys(oldHaptics).sort()).toEqual(names);
    for (const name of names) {
      expect((oldHaptics as Record<string, unknown>)[name]).toBe((sharedHaptics as Record<string, unknown>)[name]);
    }
  });

  it('isGroupConversation keeps its rule from the new location', () => {
    // More than two people is a group; exactly two is a direct message whatever the flag says; the flag only decides
    // when the count is unknown.
    expect(sharedKind.isGroupConversation({ participant_count: 2, is_group: true })).toBe(false);
    expect(sharedKind.isGroupConversation({ participant_count: 3, is_group: false })).toBe(true);
    expect(sharedKind.isGroupConversation({ participant_ids: ['a', 'b', 'c'] })).toBe(true);
    expect(sharedKind.isGroupConversation({ is_group: true })).toBe(true);
    expect(sharedKind.isGroupConversation(null)).toBe(false);
  });
});
