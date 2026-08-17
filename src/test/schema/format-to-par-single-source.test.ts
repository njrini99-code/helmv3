/**
 * Score-to-par is formatted in ONE place.
 *
 * `src/lib/golf/format-to-par.ts` says it is "the convention new/rebuilt call
 * sites should import rather than reimplement", and then documents its own
 * failure in prose: "A few other local copies (FairwayMyQualifiers,
 * RosterTable) still stringify the raw negative number and so render an ASCII
 * hyphen instead — this file doesn't guarantee every surface stays in sync."
 *
 * A convention nothing enforces is a preference. Four copies existed, with
 * three different behaviours for the same number:
 *
 *   lib/golf/format-to-par        −2   U+2212     round card, leaderboard
 *   buildReviewViewModel.ts       -2   ASCII      Round Review hero
 *   admin RosterTable.tsx         -2   ASCII      admin roster
 *   FairwayMyQualifiers.tsx       -2   ASCII      my qualifiers
 *
 * WHY THE GLYPH IS NOT PEDANTRY. Every one of those readouts is tabular:
 * `ReviewHero.tsx:376` is `font-fw-mono … tabular-nums`, RosterTable's own
 * header comment says "heavy graphite (warm-900, bold, tabular)", and the
 * qualifier leaderboard is described as a tabular-nums standings table. Tabular
 * figures are cut so that U+2212 carries the digit advance width; the ASCII
 * hyphen is narrower and sits at a different height, so a column of to-par
 * values stops lining up with itself. And the pairs are one tap apart — round
 * card to round review, my-qualifiers to leaderboard — so a player sees the
 * same number rendered two ways in consecutive screens.
 *
 * This scans source rather than behaviour because the failure is duplication:
 * a behavioural test would pass against four copies that agree today and say
 * nothing about the fifth someone writes tomorrow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const CANONICAL = join('lib', 'golf', 'format-to-par.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      out.push(...walk(p));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('formatToPar has a single implementation', () => {
  it('is declared only in lib/golf/format-to-par.ts', () => {
    // `function formatToPar` / `const formatToPar =` — a DECLARATION. Imports
    // and re-exports are what we want callers to have, so they are not matched.
    const declaration = /(?:function\s+formatToPar\b|const\s+formatToPar\s*[:=])/;
    const offenders = walk(SRC)
      .filter((file) => !file.endsWith(CANONICAL))
      .filter((file) => declaration.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(
      offenders,
      `formatToPar must be imported from @/lib/golf/format-to-par, not redeclared. ` +
        `Redeclared in:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the canonical implementation still emits U+2212, E and an em-dash', async () => {
    // Guards the other direction: consolidating onto one copy is only a win if
    // that copy is the correct one. If this changes, every surface changes.
    const { formatToPar } = await import('@/lib/golf/format-to-par');
    expect(formatToPar(-2)).toBe('−2');
    expect(formatToPar(-2)).not.toContain('-'); // U+002D must not appear
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(null)).toBe('—');
  });
});
