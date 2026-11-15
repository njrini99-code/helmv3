import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * The motion check in the gate (production audit 2026-11-15, Batch 4 item 7, S3.1). Three rules over every Clubhouse
 * stylesheet and script:
 *
 * - Nothing overshoots on a curve: no `cubic-bezier()` whose y leaves 0..1 and no `linear()` past 1 or below 0, in CSS or
 *   in a script's easing string. A hard zero. (Springs are pinned in motion-physics.test.tsx: bounce 0 on every
 *   tap-opened surface; a sent or launched bubble keeps at most 0.08.)
 * - Keyframes animate the compositor only: transform, translate, scale, rotate, opacity, and path length for a drawn
 *   line (stroke-dashoffset, stroke-dasharray). A keyframe of filter, background-position, colour, clip-path, a mask or a
 *   shadow repaints every frame.
 * - Durations come from the tokens: a transition or animation names `--ch-dur-*` (or a calc of one), never a literal.
 * - The vocabulary is twelve tokens (MOTION-AND-VISUAL 3.2): six durations, two curves, two loading beats. A use of a
 *   retiring motion token (RETIRED below) counts against its file, in stylesheets and scripts alike.
 * - The delete list (3.12): first paint is still and the working dots are the one loop, so each file's `@keyframes`
 *   and `infinite` animations are counted too.
 *
 * All but the first are ratchets: `config/clubhouse/motion-ratchet.json` records what each file still holds, and a file
 * may only go down. To lower the record after a fix: `CH_MOTION_RATCHET=write npx vitest run src/clubhouse/__tests__/motion-gate.test.ts`
 * (it refuses to write while any file has gone up).
 */
const ROOT = process.cwd();
const RATCHET = join(ROOT, 'config/clubhouse/motion-ratchet.json');
/** The one stylesheet that holds the keyframes Clubhouse keeps (MOTION-AND-VISUAL 3.12). */
const MOTION_CSS = 'src/clubhouse/styles/motion.css';
const COMPOSITOR = /^(?:transform|translate|scale|rotate|opacity|offset|animation-timing-function|stroke-dashoffset|stroke-dasharray|visibility)$/;
const TIMED = /^(?:transition|animation|transition-duration|animation-duration|transition-delay|animation-delay)$/;
/** Motion tokens outside the 3.2 vocabulary. The working dots' own beat (--ch-dur-typing, its step and curve) and a story's dwell are not motion vocabulary and stay. */
export const RETIRED =
  /var\(\s*--ch-(?:ease|ease-io|ease-sheet|ease-spring-[a-z]+|dur-spring-[a-z]+|dur-(?:shimmer|skeleton|live|sweep|keyboard|msg-[a-z-]+|word|crossfade-rm|story-body|station-pulse|press-delay)|reveal-(?:offset|step|rise))\s*[,)]/g;
const RULES = ['paint-keyframes', 'off-token-duration', 'retired-token', 'keyframes', 'infinite'] as const;
type Counts = Record<(typeof RULES)[number], number>;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), ext) : ext.test(e.name) ? [join(dir, e.name)] : []));
}

/** Overshooting easings in a value or a script: a cubic-bezier with y outside 0..1, a linear() point past it. */
export function overshoots(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/cubic-bezier\(\s*([^)]+)\)/g)) {
    const [, y1, , y2] = m[1]!.split(',').map(Number);
    if ((y1 ?? 0) < 0 || (y1 ?? 0) > 1 || (y2 ?? 0) < 0 || (y2 ?? 0) > 1) found.push(m[0]);
  }
  for (const m of text.matchAll(/(?<![\w-])linear\(([^)]+)\)/g)) {
    if (m[1]!.split(',').some((p) => parseFloat(p) > 1 || parseFloat(p) < 0)) found.push(`${m[0].slice(0, 40)}…`);
  }
  return found;
}

/** What one stylesheet still holds against the ratchet rules. */
export function motionCounts(css: string): Counts {
  const counts: Counts = { 'paint-keyframes': 0, 'off-token-duration': 0, 'retired-token': retiredUses(css), keyframes: 0, infinite: 0 };
  const root = postcss.parse(css);
  root.walkAtRules(/keyframes$/i, () => {
    counts.keyframes += 1;
  });
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    let inKeyframes = false;
    for (let p: postcss.Node | undefined = decl.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test((p as postcss.AtRule).name)) inKeyframes = true;
    if (inKeyframes && !COMPOSITOR.test(prop)) counts['paint-keyframes'] += 1;
    if (TIMED.test(prop)) {
      // A token, or a fallback inside one, is on the scale; a bare number of ms or s is not (0 is no motion).
      const bare = decl.value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'V');
      for (const m of bare.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) if (parseFloat(m[1]!) !== 0) counts['off-token-duration'] += 1;
    }
    if (/^animation(?:-iteration-count)?$/.test(prop) && /\binfinite\b/.test(decl.value)) counts.infinite += 1;
  });
  return counts;
}

/** Uses of a retiring motion token in any text, a stylesheet or a script. */
export function retiredUses(text: string): number {
  return [...text.matchAll(RETIRED)].length;
}

const sheets = files(join(ROOT, 'src/clubhouse'), /\.css$/).map((path) => ({ file: relative(ROOT, path), css: readFileSync(path, 'utf8') }));

describe('motion gate (production audit 2026-11-15, Batch 4 item 7)', () => {
  it('reads an overshoot, a paint keyframe and a literal duration', () => {
    expect(overshoots('transition: transform 1s cubic-bezier(0.34, 1.3, 0.64, 1)')).toHaveLength(1);
    expect(overshoots('cubic-bezier(0.32, 0.72, 0, 1) linear(0, 0.5, 1)')).toHaveLength(0);
    expect(overshoots('linear(0, 0.9, 1.04, 1)')).toHaveLength(1);
    expect(motionCounts('@keyframes a { to { filter: blur(2px); transform: none; opacity: 1 } }')['paint-keyframes']).toBe(1);
    expect(motionCounts('.a { transition: opacity 180ms, transform var(--ch-dur-base) var(--ch-ease-ios), color var(--x, 200ms) }')['off-token-duration']).toBe(1);
    expect(motionCounts('.a { animation: b calc(var(--ch-dur-reveal) * 2) var(--ch-ease) 0s both }')['off-token-duration']).toBe(0);
    expect(retiredUses('a: var(--ch-ease); b: var(--ch-ease-ios); c: var(--ch-ease-out); d: var(--ch-dur-spring-smooth, 1s); e: var(--ch-dur-typing)')).toBe(2);
    const loops = motionCounts('@keyframes a { to { opacity: 1 } } @keyframes b { to { opacity: 0 } } .x { animation: a 1s infinite } .y { animation-iteration-count: infinite }');
    expect([loops.keyframes, loops.infinite]).toEqual([2, 2]);
  });

  it('nothing overshoots on a curve, in CSS or in a script', () => {
    const scripts = files(join(ROOT, 'src/clubhouse'), /\.(?:ts|tsx)$/)
      .filter((p) => !p.includes('__tests__'))
      .map((path) => ({ file: relative(ROOT, path), css: readFileSync(path, 'utf8') }));
    const found = [...sheets, ...scripts].flatMap(({ file, css }) => overshoots(css).map((o) => `${file}: ${o}`));
    expect(found).toEqual([]);
  });

  it('paint keyframes, literal durations, retiring tokens, keyframes and loops only go down, file by file', () => {
    const current: Record<string, Partial<Counts>> = {};
    const keep = (file: string, counts: Partial<Counts>) => {
      const held = Object.fromEntries(Object.entries(counts).filter(([, n]) => n));
      if (Object.keys(held).length) current[file] = held;
    };
    for (const { file, css } of sheets) {
      const counts = motionCounts(css);
      // styles/motion.css is where a kept keyframe lives (3.12), so its keyframes are the collection, not a leftover.
      if (file === MOTION_CSS) counts.keyframes = 0;
      keep(file, counts);
    }
    for (const path of files(join(ROOT, 'src/clubhouse'), /\.(?:ts|tsx)$/).filter((p) => !p.includes('__tests__'))) {
      keep(relative(ROOT, path), { 'retired-token': retiredUses(readFileSync(path, 'utf8')) });
    }
    const recorded = JSON.parse(readFileSync(RATCHET, 'utf8')) as Record<string, Partial<Counts>>;
    const raised: string[] = [];
    const why: Record<(typeof RULES)[number], string> = {
      'paint-keyframes': 'keyframe transform and opacity only',
      'off-token-duration': 'use a --ch-dur-* token',
      'retired-token': 'use the 3.2 vocabulary: --ch-dur-press/quick/base/release/marks/reveal, --ch-ease-ios or --ch-ease-out',
      keyframes: 'first paint is still; a kept keyframe lives in styles/motion.css',
      infinite: 'the working dots are the one loop',
    };
    for (const [file, counts] of Object.entries(current)) {
      for (const rule of RULES) {
        const now = counts[rule] ?? 0;
        const was = recorded[file]?.[rule] ?? 0;
        if (now > was) raised.push(`${file} ${rule}: ${now} here, ${was} recorded (${why[rule]})`);
      }
    }
    if (!raised.length && process.env.CH_MOTION_RATCHET === 'write') {
      writeFileSync(RATCHET, `${JSON.stringify(Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
    }
    expect(raised).toEqual([]);
  });
});
