import { describe, expect, it } from 'vitest';
import {
  MESSAGE_AVATAR_FALLBACK_TONES,
  hasMessageAvatarPhoto,
  messageAvatarFallbackClass,
} from './message-avatar';

describe('messaging avatar fallbacks', () => {
  it('assigns stable, varied Fairway-token tones from identity', () => {
    const identities = ['player-alex', 'player-jordan', 'player-taylor', 'coach-rini'];
    const firstPass = identities.map(messageAvatarFallbackClass);
    const secondPass = identities.map(messageAvatarFallbackClass);

    expect(secondPass).toEqual(firstPass);
    expect(new Set(firstPass).size).toBeGreaterThan(1);
    expect(firstPass.every((tone) => MESSAGE_AVATAR_FALLBACK_TONES.includes(tone))).toBe(true);
    expect(MESSAGE_AVATAR_FALLBACK_TONES.join(' ')).not.toMatch(/#|rgb|oklch|\[/);
    expect(MESSAGE_AVATAR_FALLBACK_TONES.join(' ')).not.toContain('shadow');
  });

  it('recognizes a group as photo-bearing when even one member has a real source', () => {
    expect(hasMessageAvatarPhoto([
      { avatar: null },
      { avatar: 'data:image/svg+xml,%3Csvg/%3E' },
    ])).toBe(true);
    expect(hasMessageAvatarPhoto([
      { avatar: null },
      { avatar: '' },
    ])).toBe(false);
  });
});
