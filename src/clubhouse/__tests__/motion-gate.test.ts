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
 *
 * The last two are ratchets: `config/clubhouse/motion-ratchet.json` records what each file still holds, and a file may
 * only go down. To lower the record after a fix: `CH_MOTION_RATCHET=write npx vitest run src/clubhouse/__tests__/motion-gate.test.ts`
 * (it refuses to write while any file has gone up).
 */
const ROOT = process.cwd();
const RATCHET = join(ROOT, 'config/clubhouse/motion-ratchet.json');
const COMPOSITOR = /^(?:transform|translate|scale|rotate|opacity|offset|animation-timing-function|stroke-dashoffset|stroke-dasharray|visibility)$/;
const TIMED = /^(?:transition|animation|transition-duration|animation-duration|transition-delay|animation-delay)$/;

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

/** What one stylesheet still holds against the two ratchet rules. */
export function motionCounts(css: string): { 'paint-keyframes': number; 'off-token-duration': number } {
  const counts = { 'paint-keyframes': 0, 'off-token-duration': 0 };
  postcss.parse(css).walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    let inKeyframes = false;
    for (let p: postcss.Node | undefined = decl.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test((p as postcss.AtRule).name)) inKeyframes = true;
    if (inKeyframes && !COMPOSITOR.test(prop)) counts['paint-keyframes'] += 1;
    if (TIMED.test(prop)) {
      // A token, or a fallback inside one, is on the scale; a bare number of ms or s is not (0 is no motion).
      const bare = decl.value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'V');
      for (const m of bare.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) if (parseFloat(m[1]!) !== 0) counts['off-token-duration'] += 1;
    }
  });
  return counts;
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
  });

  it('nothing overshoots on a curve, in CSS or in a script', () => {
    const scripts = files(join(ROOT, 'src/clubhouse'), /\.(?:ts|tsx)$/)
      .filter((p) => !p.includes('__tests__'))
      .map((path) => ({ file: relative(ROOT, path), css: readFileSync(path, 'utf8') }));
    const found = [...sheets, ...scripts].flatMap(({ file, css }) => overshoots(css).map((o) => `${file}: ${o}`));
    expect(found).toEqual([]);
  });

  it('paint keyframes and literal durations only go down, file by file', () => {
    const current: Record<string, ReturnType<typeof motionCounts>> = {};
    for (const { file, css } of sheets) {
      const counts = motionCounts(css);
      if (counts['paint-keyframes'] || counts['off-token-duration']) current[file] = counts;
    }
    const recorded = JSON.parse(readFileSync(RATCHET, 'utf8')) as Record<string, ReturnType<typeof motionCounts>>;
    const raised: string[] = [];
    for (const [file, counts] of Object.entries(current)) {
      for (const rule of ['paint-keyframes', 'off-token-duration'] as const) {
        const was = recorded[file]?.[rule] ?? 0;
        if (counts[rule] > was) raised.push(`${file} ${rule}: ${counts[rule]} here, ${was} recorded (use a --ch-dur-* token; keyframe transform and opacity only)`);
      }
    }
    if (!raised.length && process.env.CH_MOTION_RATCHET === 'write') {
      writeFileSync(RATCHET, `${JSON.stringify(Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
    }
    expect(raised).toEqual([]);
  });
});
