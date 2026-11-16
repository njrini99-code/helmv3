import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import baseline from './raw-colour-baseline.json';

/**
 * Colours come from tokens (audit Batch 5 items 6 and 11): a stylesheet names `var(--ch-*)`, and a literal colour (a hex,
 * `rgb()`, `hsl()`, `oklch()`, `white`, `black`) lives only in tokens.css and auth-tokens.css, where it gets a name and a
 * dark value. The literals left in page stylesheets are counted per file in raw-colour-baseline.json; a file's count may
 * only fall, and a file not listed may hold none. After deleting literals, run with RAW_COLOUR_UPDATE=1 to lower the
 * baseline (it never raises one).
 */
const DIR = join(process.cwd(), 'src/clubhouse/styles');
const TOKEN_HOMES = new Set(['tokens.css', 'auth-tokens.css']);
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|(?<![\w-])(?:white|black)(?![\w-])/gi;

/** Literal colours in a stylesheet, comments removed. */
export const literals = (css: string) => (css.replace(/\/\*[\s\S]*?\*\//g, '').match(LITERAL) ?? []).length;

const counts = () =>
  Object.fromEntries(
    readdirSync(DIR)
      .filter((n) => n.endsWith('.css') && !TOKEN_HOMES.has(n))
      .sort()
      .map((n) => [n, literals(readFileSync(join(DIR, n), 'utf8'))] as const)
      .filter(([, n]) => n > 0),
  ) as Record<string, number>;

describe('colours from tokens only (raw-colour ratchet)', () => {
  const live = counts();
  const allow = baseline as Record<string, number>;

  if (process.env.RAW_COLOUR_UPDATE === '1') {
    const lowered = Object.fromEntries(Object.entries(live).map(([f, n]) => [f, Math.min(n, allow[f] ?? n)]));
    writeFileSync(join(__dirname, 'raw-colour-baseline.json'), JSON.stringify(lowered, null, 2) + '\n');
  }

  it('no stylesheet holds more literal colours than its baseline, and an unlisted one holds none', () => {
    const over = Object.entries(live)
      .filter(([f, n]) => n > (allow[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} literal colours > ${allow[f] ?? 0}; name it in tokens.css`);
    expect(over).toEqual([]);
  });

  it('the baseline has no slack: a file that dropped literals is lowered in the same change', () => {
    const slack = Object.entries(allow)
      .filter(([f, n]) => (live[f] ?? 0) < n)
      .map(([f, n]) => `${f}: ${live[f] ?? 0} < ${n}; run RAW_COLOUR_UPDATE=1`);
    expect(slack).toEqual([]);
  });

  it('counts the literal forms', () => {
    expect(literals('a { color: #fff; background: rgb(1 2 3 / 0.5); border-color: white; --x: var(--ch-white-ish); }')).toBe(3);
    expect(literals('/* #fff */ a { color: var(--ch-ink-900); }')).toBe(0);
  });
});
