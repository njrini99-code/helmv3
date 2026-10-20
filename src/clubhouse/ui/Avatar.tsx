import { initials as initialsOf } from '../lib/format';

const TONES = ['sand', 'stone', 'sage', 'mist', 'clay'] as const;

/** Stable tone per name, so a player's coin is the same colour everywhere. */
function toneOf(name: string): (typeof TONES)[number] {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] ?? 'sand';
}

/** Monogram coin. No photography in Clubhouse: initials on a calm neutral. */
export function Avatar({ name, size = 32, ring = false }: { name: string; size?: number; ring?: boolean }) {
  return (
    <span
      className={'ch-avatar' + (ring ? ' ch-avatar--ring' : '')}
      data-tone={toneOf(name)}
      style={{ ['--ch-av-size' as string]: `${size}px` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
