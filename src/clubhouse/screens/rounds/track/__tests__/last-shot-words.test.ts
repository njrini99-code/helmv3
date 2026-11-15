import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ShotRecord } from '@/lib/types/golf';
import { lastShotWords } from '../parts';

/**
 * B5 (round-flow review, 2026-11-11): with a penalty in the hole the collapsed log's line was cut inside a word
 * ("Last: Around the green → gr…", "10 ft le…"). The line now ends on a whole fact: it may break between the words of
 * the shot's name or in front of a mark, and nowhere else, and only its first line is drawn.
 */
const NBSP = ' ';
const chip: ShotRecord = { shotNumber: 4, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'rough', distanceToHoleBefore: 20, distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 10, distanceUnitAfter: 'feet', shotDistance: 17, isPenalty: false };
const tee: ShotRecord = { ...chip, shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 381, result: 'fairway', distanceToHoleAfter: 142, distanceUnitAfter: 'yards', shotDistance: 239 };

describe('the collapsed log’s last-shot line (B5)', () => {
  it('reads as before', () => {
    const plain = (s: string) => s.split(NBSP).join(' ');
    expect(plain(lastShotWords(chip, 'yards'))).toBe('Last: Around the green → green · 10 ft left');
    expect(plain(lastShotWords(tee, 'yards'))).toBe('Last: Tee · Driver → fairway · 142 yds left');
    expect(plain(lastShotWords({ ...chip, isPenalty: true, penaltyType: undefined }, 'yards'))).toBe('Last: Penalty');
  });

  it('can only end between facts: every mark holds the fact after it, and a fact’s words hold together', () => {
    // What a line break may leave at the end of the first line: each piece, cumulatively.
    const ends = (s: string) => s.split(' ').map((_, i, all) => all.slice(0, i + 1).join(' ').split(NBSP).join(' '));
    expect(ends(lastShotWords(chip, 'yards'))).toEqual(['Last: Around', 'Last: Around the', 'Last: Around the green', 'Last: Around the green → green', 'Last: Around the green → green · 10 ft left']);
    expect(ends(lastShotWords(tee, 'yards'))).toEqual(['Last: Tee', 'Last: Tee · Driver', 'Last: Tee · Driver → fairway', 'Last: Tee · Driver → fairway · 142 yds left']);
  });

  it('is one wrapped line with the rest hidden, not an ellipsis', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds-track.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.ch-rt-log__t em \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/max-height: 1lh;/);
    expect(rule).toMatch(/overflow: hidden;/);
    expect(css).not.toMatch(/\.ch-rt-log__t em \{[^}]*(text-overflow|white-space: nowrap)/);
  });
});
