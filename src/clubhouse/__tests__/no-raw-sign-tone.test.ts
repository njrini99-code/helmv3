import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A2 (Clubhouse A+ handoff): a gain or loss tone comes from `changeTone` (`lib/format.ts`), which leaves a value that rounds
 * to zero untoned. A screen that tests the sign itself (`v >= 0 ? 'ch-gain' : 'ch-loss'`) paints "+0.0" green. Bar geometry
 * may still test the sign (which side of zero a bar grows from); only the tone may not.
 */
const root = join(__dirname, '..');
const scanned = ['screens', 'shell', 'ui', 'data'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Files whose one sign test is safe, each with why: the value is a whole number, or the line rules out a shown zero first.
 * Each file may hold that one hit only.
 */
const ALLOWED: Record<string, string> = {
  // A place gained or lost on the board is a whole number of places; zero draws no mark.
  'screens/qualifiers/parts.tsx': 'move > 0',
  // `Math.abs(v) < 0.05` before the sign: a leg that prints 0.0 has no tone.
  'screens/rounds/card/RoundCard.tsx': 'Math.abs(v) < 0.05',
  // `Number(m.delta.toFixed(1)) === 0 ? 'level'` before the sign.
  'data/coachhelm-ladder-shape.ts': "=== 0 ? 'level'",
};

/** A sign test whose answer is a tone: a gain or loss class, a good or bad word, or a chart gain or loss colour. */
const RAW_TONE = /[<>]=?\s*0\s*\?\s*['"`]\s*(?:is-|ch-|var\(--ch-chart-)?(?:gain|good|loss|bad)\b/;

describe('Gain and loss tones', () => {
  it('never come from a raw sign test', () => {
    const hits = scanned
      .flatMap((dir) => sources(join(root, dir)))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => (RAW_TONE.test(line) && !(ALLOWED[relative(root, file)] && line.includes(ALLOWED[relative(root, file)]!)) ? `${relative(root, file)}:${i + 1}` : null))
          .filter((hit): hit is string => hit !== null),
      );
    expect(hits).toEqual([]);
  });

  it('catches the pattern it guards against', () => {
    expect(RAW_TONE.test("className={v >= 0 ? 'ch-gain' : 'ch-loss'}")).toBe(true);
    expect(RAW_TONE.test("tone={sg >= 0 ? 'good' : 'bad'}")).toBe(true);
    expect(RAW_TONE.test("mean >= 0 ? 'var(--ch-chart-gain)' : 'x'")).toBe(true);
    expect(RAW_TONE.test("data-sign={r.value < 0 ? 'loss' : 'gain'}")).toBe(true);
    expect(RAW_TONE.test("style={sg >= 0 ? { left: '50%' } : { right: '50%' }}")).toBe(false);
  });
});
