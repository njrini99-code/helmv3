/**
 * Messaging-only initials treatments.
 *
 * Missing photos should still provide useful visual identity without inventing
 * a face or assigning semantic status colours. These four recipes use only the
 * shipped Fairway surface/accent tokens, and the stable identity hash keeps a
 * person or conversation on the same tone everywhere messaging renders it.
 */
export const MESSAGE_AVATAR_FALLBACK_TONES = [
  'bg-accent-100 text-accent-800',
  'bg-surface-tint text-text-primary',
  'bg-accent-50 text-accent-700',
  'bg-accent-200 text-accent-900',
] as const;

export type MessageAvatarFallbackTone = (typeof MESSAGE_AVATAR_FALLBACK_TONES)[number];

export function messageAvatarFallbackClass(identity: string | null | undefined): MessageAvatarFallbackTone {
  const normalized = identity?.trim().toLocaleLowerCase('en-US') || 'message-participant';
  let hash = 2_166_136_261;

  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return MESSAGE_AVATAR_FALLBACK_TONES[(hash >>> 0) % MESSAGE_AVATAR_FALLBACK_TONES.length]!;
}

export function hasMessageAvatarPhoto(
  members: readonly { avatar?: string | null }[] | null | undefined,
): boolean {
  return members?.some((member) => Boolean(member.avatar?.trim())) ?? false;
}
