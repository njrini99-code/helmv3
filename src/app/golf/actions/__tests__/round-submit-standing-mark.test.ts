import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The round save marks its player's teams for a Standing refresh and never refreshes Standing itself (Clubhouse A+ rows 105/121):
 * three team-wide upserts inside after() race the crons into 40P01. Read from the source, as the other write-path contracts are.
 */

const src = readFileSync(join(process.cwd(), 'src/app/golf/actions/round-submit.ts'), 'utf8');

describe('round-submit and Standing', () => {
  it('calls no Standing refresh RPC on the save path', () => {
    expect(src).not.toMatch(/refresh_player_standing/);
  });

  it('marks the player’s teams dirty inside after(), before the queue branch that returns', () => {
    const afterAt = src.indexOf('after(async () => {');
    const markAt = src.indexOf('await markTeamStandingDirty(backgroundPlayerId)');
    const queueAt = src.indexOf('if (isHelmQueueEnabled())');
    expect(afterAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(afterAt);
    expect(queueAt).toBeGreaterThan(markAt);
  });
});
