/**
 * The painted course's sky: ten keyframes by local hour, interpolated with a
 * smoothstep, and the tint that pulls every colour in the landscape toward the
 * ambient light at dusk and night. Pure, so the hydration-safe time of day and
 * the greeting can be tested without drawing anything.
 * Source: design/handoff/auth/src/scene.jsx (KEYS, skyAt, mixc).
 */

export interface SkyKey {
  h: number;
  top: string;
  mid: string;
  low: string;
  glow: string;
  glowA: number;
  sunX: number;
  sunY: number;
  sunR: number;
  sun: string;
  sunA: number;
  far: string;
  haze: string;
  cloud: string;
  cloudA: number;
  amb: string;
  ambA: number;
  stars: number;
  win: number;
  moon: number;
}

export interface Sky extends Omit<SkyKey, 'h'> {
  moonX: number;
  moonY: number;
}

/** Sky keyframes by local hour. Everything in the scene reads from the interpolated set. */
export const SKY_KEYS: readonly SkyKey[] = [
  { h: 0, top: '#070D1C', mid: '#111B33', low: '#1E2B48', glow: '#6F86B8', glowA: 0.18, sunX: 360, sunY: 150, sunR: 20, sun: '#EEF0E6', sunA: 0, far: '#1E2C33', haze: '#27344E', cloud: '#3A4764', cloudA: 0.25, amb: '#0C1428', ambA: 0.62, stars: 1, win: 1, moon: 1 },
  { h: 5.2, top: '#0E1630', mid: '#2A3452', low: '#5E5468', glow: '#C98E86', glowA: 0.25, sunX: 160, sunY: 640, sunR: 30, sun: '#F2A071', sunA: 0, far: '#34404A', haze: '#6E6070', cloud: '#6E6480', cloudA: 0.35, amb: '#1C2140', ambA: 0.5, stars: 0.7, win: 0.9, moon: 0.6 },
  { h: 6.4, top: '#56698C', mid: '#D3A99E', low: '#F4BD86', glow: '#FFC48A', glowA: 0.8, sunX: 600, sunY: 392, sunR: 34, sun: '#FFD7A0', sunA: 0.95, far: '#8C9296', haze: '#EDC4A4', cloud: '#F6C8B0', cloudA: 0.7, amb: '#5A4A70', ambA: 0.24, stars: 0, win: 0.35, moon: 0 },
  { h: 8.5, top: '#C7DCE2', mid: '#F1EDDD', low: '#F6DDB2', glow: '#FFEBC4', glowA: 0.9, sunX: 660, sunY: 300, sunR: 30, sun: '#FFF4DA', sunA: 0.9, far: '#A7BAA5', haze: '#E7E5D3', cloud: '#FFFDF6', cloudA: 0.7, amb: '#000000', ambA: 0, stars: 0, win: 0, moon: 0 },
  { h: 12.5, top: '#9EC3DC', mid: '#D8E8EE', low: '#EEF2E6', glow: '#FFFFFF', glowA: 0.7, sunX: 820, sunY: 90, sunR: 28, sun: '#FFFFFF', sunA: 0.85, far: '#9DB6A6', haze: '#E2ECE6', cloud: '#FFFFFF', cloudA: 0.8, amb: '#000000', ambA: 0, stars: 0, win: 0, moon: 0 },
  { h: 16, top: '#B6D2DE', mid: '#ECEBDA', low: '#F4DEB2', glow: '#FFF3D6', glowA: 0.85, sunX: 1160, sunY: 250, sunR: 30, sun: '#FFF6DE', sunA: 0.9, far: '#A2B5A0', haze: '#EEE6CC', cloud: '#FFFBEF', cloudA: 0.7, amb: '#6A4A10', ambA: 0.03, stars: 0, win: 0, moon: 0 },
  { h: 18.6, top: '#D9C3A6', mid: '#F2B274', low: '#E4834A', glow: '#FFB866', glowA: 1, sunX: 1300, sunY: 455, sunR: 40, sun: '#FFC878', sunA: 1, far: '#8E8A6E', haze: '#F2BE86', cloud: '#F7B98A', cloudA: 0.75, amb: '#B8641E', ambA: 0.16, stars: 0, win: 0.5, moon: 0 },
  { h: 19.8, top: '#2A3558', mid: '#8C667A', low: '#E0845E', glow: '#F09060', glowA: 0.6, sunX: 1420, sunY: 640, sunR: 40, sun: '#F4885A', sunA: 0, far: '#3E4046', haze: '#A26A6A', cloud: '#9A6A7E', cloudA: 0.5, amb: '#2C2244', ambA: 0.4, stars: 0.35, win: 0.95, moon: 0.2 },
  { h: 21, top: '#0A1226', mid: '#16213C', low: '#2A3654', glow: '#6F86B8', glowA: 0.2, sunX: 1240, sunY: 150, sunR: 20, sun: '#EEF0E6', sunA: 0, far: '#1E2C33', haze: '#27344E', cloud: '#3A4764', cloudA: 0.25, amb: '#0C1428', ambA: 0.6, stars: 1, win: 1, moon: 1 },
  { h: 24, top: '#070D1C', mid: '#111B33', low: '#1E2B48', glow: '#6F86B8', glowA: 0.18, sunX: 360, sunY: 150, sunR: 20, sun: '#EEF0E6', sunA: 0, far: '#1E2C33', haze: '#27344E', cloud: '#3A4764', cloudA: 0.25, amb: '#0C1428', ambA: 0.62, stars: 1, win: 1, moon: 1 },
];

const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Blends two #rrggbb colours: t = 0 is `a`, t = 1 is `b`. */
export function mixColor(a: string, b: string, t: number): string {
  const from = rgb(a);
  const to = rgb(b);
  return '#' + from.map((v, i) => Math.round(v + (to[i]! - v) * t).toString(16).padStart(2, '0')).join('');
}

/** The interpolated sky at a local decimal hour (any real number; it wraps at 24). */
export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (SKY_KEYS[i + 1]!.h < h) i += 1;
  const a = SKY_KEYS[i]!;
  const b = SKY_KEYS[i + 1]!;
  const t0 = (h - a.h) / (b.h - a.h);
  const t = t0 * t0 * (3 - 2 * t0);
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(a) as (keyof SkyKey)[]) {
    if (k === 'h') continue;
    const av = a[k];
    const bv = b[k];
    out[k] = typeof av === 'string' ? mixColor(av, bv as string, t) : av + ((bv as number) - av) * t;
  }
  // The moon rides its own arc through the night.
  const nightHour = h < 12 ? h + 24 : h;
  const mt = Math.min(1, Math.max(0, (nightHour - 19.5) / 10.5));
  out.moonX = 1450 - mt * 1200;
  out.moonY = 420 - Math.sin(mt * Math.PI) * 300;
  return out as unknown as Sky;
}

/** Tints a landscape colour toward the ambient light (identity by day). */
export function tintFor(sky: Sky): (colour: string) => string {
  return (colour) => (sky.ambA > 0.01 ? mixColor(colour, sky.amb, sky.ambA) : colour);
}

/** Dusk and night: the welcome's type flips to ivory over the dark sky. */
export function isDarkSky(hour: number): boolean {
  return skyAt(hour).ambA > 0.3;
}

/** The greeting word by hour: morning 4:30 to 12, afternoon 12 to 17, evening otherwise. */
export function greetingWord(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 4.5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Minutes past midnight to the decimal hour the sky and the greeting read. */
export const hourOfMinutes = (minutes: number): number => minutes / 60;

/** The scene redraws on this grid (every two minutes), not on every clock tick. */
export const SCENE_HOUR_STEP = 1 / 30;
export const quantizeHour = (hour: number): number => Math.round(hour / SCENE_HOUR_STEP) * SCENE_HOUR_STEP;
