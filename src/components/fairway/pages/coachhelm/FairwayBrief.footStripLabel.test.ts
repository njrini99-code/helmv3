/**
 * Regression test for #946 (Team Brief hero, fix 4/5): the hero's foot-strip
 * eyebrow hard-coded "Dragging {category}" over the WHOLE flagged-player
 * group, even when some of those players were `trend === 'improving'`.
 * `needsAttention` flags a player on absolute standing, not direction — a
 * player can be both flagged AND improving (weak but trending up), and the
 * chip below already renders "trending up" for them. Blanket-labeling that
 * player "dragging" contradicts their own chip.
 *
 * `footStripLabel` must keep the single-word label when the flagged group is
 * uniform (still honest), and split the label when it's mixed — following
 * the data instead of asserting a narrative the players don't support.
 */
import { describe, it, expect } from 'vitest';
import { footStripLabel } from './FairwayBrief';
import type { PlayerCategoryStat } from '@/app/golf/actions/team-category-insights';

function player(
  playerId: string,
  trend: PlayerCategoryStat['trend'],
): PlayerCategoryStat {
  return {
    playerId,
    playerName: playerId,
    avatarUrl: null,
    value: 40,
    trend,
    trendDelta: 0,
    needsAttention: true,
  };
}

describe('footStripLabel (#946)', () => {
  it('uses the plain "Dragging" label when every flagged player is declining/steady', () => {
    const players = [player('a', 'declining'), player('b', 'stable')];
    expect(footStripLabel('putting', players)).toBe('Dragging putting');
  });

  it('uses the plain "Dragging" label when there are no flagged players', () => {
    expect(footStripLabel('putting', [])).toBe('Dragging putting');
  });

  it('NEVER blanket-labels a group that includes an improving player as "Dragging" — splits instead', () => {
    // Live-prod repro: "Mason trending up" listed under "DRAGGING PUTTING".
    const players = [player('mason', 'improving'), player('avery', 'declining')];
    const label = footStripLabel('putting', players);
    expect(label).not.toBe('Dragging putting');
    expect(label).toContain('1 dragging putting');
    expect(label).toContain('1 improving');
  });

  it('uses the plain "Improving" label when every flagged player is improving', () => {
    const players = [player('a', 'improving'), player('b', 'improving')];
    expect(footStripLabel('putting', players)).toBe('Improving putting');
  });

  it('counts a 2-decline/1-improve mix correctly', () => {
    const players = [player('a', 'declining'), player('b', 'declining'), player('c', 'improving')];
    expect(footStripLabel('short game', players)).toBe('2 dragging short game · 1 improving');
  });
});
