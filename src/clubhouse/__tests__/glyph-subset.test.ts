import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { code, ROOT, walk } from './_scan';

/**
 * A23 (CONS-9): Clubhouse sets its words in Instrument Sans, latin subset (lib/fonts.ts). A character the subset does
 * not carry is drawn from another font, in another style, or as a missing-glyph box ("two▯putting", "3 ▯2"). So the
 * words in the source use only what the subset has.
 *
 * The allowlist is the subset's own character map (read from the served woff2, 2026-10-23): printable ASCII, Latin-1
 * except ¤ ¦ ¬ soft hyphen ± ² ³ µ ¹ ¼ ½ ¾, and the few marks below. Comments are not words on a screen and are skipped.
 */
const root = join(__dirname, '..');

const latin1Missing = new Set([0xa4, 0xa6, 0xac, 0xad, 0xb1, 0xb2, 0xb3, 0xb5, 0xb9, 0xbc, 0xbd, 0xbe]);
const extra = new Set([..."ĂıŒœˆ˚˜–—‘’‚“”„•…‹›€™↑↓−"].map((c) => c.codePointAt(0)!));

/**
 * Characters the subset does not have, kept on purpose, each with where and why.
 * - "→" is the arrow grammar of a shot's line and a CoachHelm path ("395 yds → fairway", "approach missed → chip"),
 *   built as strings that are also read aloud; Apple's system font draws it, at the same weight. An icon there means
 *   splitting each string where it is drawn: left for a later pass, and no other arrow may join them.
 * - "⌘" and "↵" are the keys in the command palette's hints, set in the mono face and shown only with a keyboard.
 */
const kept: Record<string, string[]> = {
  '→': [
    'data/coachhelm-dive-shape.ts',
    'data/coachhelm-path.ts',
    'screens/rounds/RoundReview.tsx',
    'screens/rounds/track/ShotEntry.tsx',
    'screens/rounds/track/labels.ts',
    'screens/rounds/track/parts.tsx',
    'screens/stats/dev-format.ts',
  ],
  '⌘': ['shell/command/shortcuts.ts'],
  '↵': ['shell/command/Palette.tsx'],
};

const allowed = (cp: number) => (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff && !latin1Missing.has(cp)) || extra.has(cp);

describe('Glyph subset (A23)', () => {
  it('every character in Clubhouse source words is one Instrument Sans latin draws, or a named exception', () => {
    const misses: string[] = [];
    for (const file of walk(ROOT, /\.tsx?$/)) {
      const rel = relative(root, file);
      for (const [i, line] of code(file).split('\n').entries()) {
        for (const ch of line) {
          const cp = ch.codePointAt(0)!;
          if (cp === 0x09 || allowed(cp) || kept[ch]?.includes(rel)) continue;
          misses.push(`${rel}:${i + 1} U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${ch}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it('no non-breaking hyphen anywhere, CSS included (CONS-9)', () => {
    const all = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return all(path);
        return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
      });
    const hits = all(root).filter((file) => /‑|\\u2011/.test(readFileSync(file, 'utf8')));
    expect(hits.map((f) => relative(root, f))).toEqual([]);
  });
});
