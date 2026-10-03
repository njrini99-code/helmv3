import { describe, it, expect } from 'vitest';
import * as oldHaptics from '@/lib/fairway/haptics';
import * as sharedHaptics from '@/lib/native-haptics';
import * as oldKind from '@/components/fairway/pages/messages/conversation-kind';
import * as sharedKind from '@/lib/golf/conversation-kind';

/**
 * C-26. The haptic layer and the conversation-kind rules are shared logic that lived under Fairway paths, so any
 * surface that is not Fairway had to import Fairway (or copy them) to use them. They now live in src/lib, and the old
 * paths re-export them: every existing importer, and every test mock of the old path, keeps working and gets the very
 * same functions.
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

  it('the Fairway conversation-kind path re-exports @/lib/golf/conversation-kind, binding for binding', () => {
    const names = Object.keys(sharedKind).sort();
    expect(names).toEqual(['conversationDisplayName', 'conversationRecipientName', 'isGroupConversation']);
    expect(Object.keys(oldKind).sort()).toEqual(names);
    for (const name of names) {
      expect((oldKind as Record<string, unknown>)[name]).toBe((sharedKind as Record<string, unknown>)[name]);
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
