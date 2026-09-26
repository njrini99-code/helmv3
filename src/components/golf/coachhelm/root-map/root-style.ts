/**
 * Small shared visuals for a stored read's support style, used by the Why
 * view and the coach's carriers table (moved out of the retired RootMap
 * diagram, 2026-09-25).
 */

import type { CSSProperties } from 'react';
import type { RootStyle } from '@/lib/coachhelm/root-map/build-root-map';

const NEG = 'var(--fw-viz-div-neg)';
const SURFACE = 'var(--fw-color-surface)';
const mix = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, ${SURFACE})`;

/** Fill for a support style: solid seen in shots, hatched likely, dashed
 *  forming, plain tint for no stored read. */
export function rootStyleCss(style: RootStyle): CSSProperties {
  switch (style) {
    case 'observed':
      return { background: NEG };
    case 'likely':
      return {
        backgroundColor: mix(NEG, 18),
        backgroundImage: `repeating-linear-gradient(135deg, ${NEG} 0 2px, transparent 2px 7px)`,
        border: `1px solid ${NEG}`,
      };
    case 'forming':
      return { background: 'transparent', border: `1.5px dashed ${NEG}` };
    default:
      return { background: 'var(--fw-color-surface-sunken)', border: '1px solid var(--fw-color-border-strong)' };
  }
}

/** "3 players" / "1 player". */
export function playersText(n: number): string {
  return `${n} ${n === 1 ? 'player' : 'players'}`;
}
