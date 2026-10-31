import { initials as initialsOf } from '../lib/format';

/** B19: the six coin tones (ui.css `.ch-avatar[data-tone]`); `sand` is the calm neutral itself. */
export const AVATAR_TONES = ['sand', 'stone', 'sage', 'mist', 'clay', 'heather'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/**
 * B19: one tint rule. A person's coin takes its tone from their id, so two people who share a name are told apart and
 * a rename keeps the colour; a coin with no id (an invite, a team, a name read from text) falls back to the name.
 */
export function avatarTone(key: string): AvatarTone {
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length] ?? 'sand';
}

/** CONS-33: the avatar steps. A number is the old way and is ratcheted (`__tests__/avatar-sizes.test.ts`). */
export const AVATAR_SIZES = { xs: 24, sm: 28, md: 36, lg: 40, xl: 64 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES;
/** F-0073: each step's initials, on the type scale (px; the coin is a fixed size, so its initials are too). */
export const AVATAR_TYPE: Record<AvatarSize, number> = { xs: 11, sm: 12, md: 13, lg: 14, xl: 22 };

/** A numeric size takes the initials of the nearest step (the smaller on a tie). */
function typeOf(px: number): number {
  let best: AvatarSize = 'xs';
  for (const k of Object.keys(AVATAR_SIZES) as AvatarSize[]) {
    if (Math.abs(AVATAR_SIZES[k] - px) < Math.abs(AVATAR_SIZES[best] - px)) best = k;
  }
  return AVATAR_TYPE[best];
}

/**
 * Monogram coin. No photography in Clubhouse: initials on a calm neutral.
 * `id`: the person's stable id, the same one wherever they are drawn: a player's player id, else (a coach) their user id.
 */
export function Avatar({ name, id, size = 'md', ring = false }: { name: string; id?: string | null; size?: AvatarSize | number; ring?: boolean }) {
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size];
  const type = typeof size === 'number' ? typeOf(size) : AVATAR_TYPE[size];
  return (
    <span
      className={'ch-avatar' + (ring ? ' ch-avatar--ring' : '')}
      data-tone={avatarTone(id || name)}
      style={{ ['--ch-av-size' as string]: `${px}px`, ['--ch-av-type' as string]: `${type}px` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
