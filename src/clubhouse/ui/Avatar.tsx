import { initials as initialsOf } from '../lib/format';

const TONES = ['sand', 'stone', 'sage', 'mist', 'clay'] as const;

/** Stable tone per name, so a player's coin is the same colour everywhere. */
function toneOf(name: string): (typeof TONES)[number] {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] ?? 'sand';
}

/** CONS-33: the avatar steps. A number is the old way and is ratcheted (`__tests__/avatar-sizes.test.ts`). */
export const AVATAR_SIZES = { xs: 24, sm: 28, md: 36, lg: 40, xl: 64 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES;

/** Monogram coin. No photography in Clubhouse: initials on a calm neutral. */
export function Avatar({ name, size = 32, ring = false }: { name: string; size?: AvatarSize | number; ring?: boolean }) {
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size];
  return (
    <span
      className={'ch-avatar' + (ring ? ' ch-avatar--ring' : '')}
      data-tone={toneOf(name)}
      style={{ ['--ch-av-size' as string]: `${px}px` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
