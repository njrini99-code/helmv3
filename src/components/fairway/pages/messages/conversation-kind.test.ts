import { describe, expect, it } from 'vitest';
import {
  conversationDisplayName,
  conversationRecipientName,
  isGroupConversation,
} from './conversation-kind';

describe('conversation display kind', () => {
  it('treats a flagged broadcast to one player as a direct conversation', () => {
    const conversation = {
      is_group: true,
      participant_count: 2,
      title: 'Team broadcast',
      other_participant: { name: 'Jordan Lee' },
    };

    expect(isGroupConversation(conversation)).toBe(false);
    expect(conversationDisplayName(conversation)).toBe('Jordan Lee');
    expect(conversationRecipientName(conversation)).toBe('Jordan');
  });

  it('keeps a real three-person conversation as a titled group', () => {
    const conversation = {
      is_group: true,
      participant_count: 3,
      title: 'Varsity staff',
      other_participant: { name: 'Should not win' },
    };

    expect(isGroupConversation(conversation)).toBe(true);
    expect(conversationDisplayName(conversation)).toBe('Varsity staff');
    expect(conversationRecipientName(conversation)).toBe('Varsity staff');
  });

  it('uses participant ids when a count was not returned', () => {
    expect(isGroupConversation({ is_group: true, participant_ids: ['me', 'u2'] })).toBe(false);
    expect(isGroupConversation({ is_group: true, participant_ids: ['me', 'u2', 'u3'] })).toBe(true);
  });

  it('does not imply an identity when the profile is unresolved', () => {
    const conversation = { is_group: true, participant_count: 2 };

    expect(conversationDisplayName(conversation)).toBe('Conversation member');
    expect(conversationRecipientName(conversation)).toBeUndefined();
    expect(conversationRecipientName({ ...conversation, other_participant: { name: 'Conversation member', type: 'member' } })).toBeUndefined();
  });
});
