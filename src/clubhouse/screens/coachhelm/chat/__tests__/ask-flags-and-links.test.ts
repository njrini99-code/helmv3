import { describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (f: string) => flags.on.has(f) }));

import { ASK_V2_FLAG, isAskV2Enabled, isPlayerAskEnabled, PLAYER_ASK_FLAG } from '@/lib/coachhelm/v3/chat/ask-flag';
import { askAboutHref, askAboutReadHref } from '../ask-links';

/** Ask `ask-flag.test.ts`: a player's Ask needs both flags. */
describe('the Ask flags', () => {
  it.each([
    [[], false, false],
    [[ASK_V2_FLAG], true, false],
    [[PLAYER_ASK_FLAG], false, false],
    [[ASK_V2_FLAG, PLAYER_ASK_FLAG], true, true],
  ])('%j', (on, v2, player) => {
    flags.on = new Set(on);
    expect(isAskV2Enabled()).toBe(v2);
    expect(isPlayerAskEnabled()).toBe(player);
  });
});

/** Ask CP-69. */
describe('ask-links', () => {
  it('are null with Ask v2 off, so the row is left out; off is the default', () => {
    expect(askAboutHref({ question: 'q' })).toBeNull();
    expect(askAboutHref({ question: 'q' }, false)).toBeNull();
    expect(askAboutReadHref({ insightId: 'i', title: 't' })).toBeNull();
    expect(askAboutReadHref({ insightId: 'i', title: 't', first: 'Eli' }, false)).toBeNull();
  });
  it('seed the question, encoded', () => {
    expect(askAboutHref({ question: 'Why & how?' }, true)).toContain(`q=${encodeURIComponent('Why & how?')}`);
  });
  it('a coach’s link names the player; a player’s says "my"', () => {
    expect(decodeURIComponent(askAboutReadHref({ insightId: 'i1', title: 'Putts', first: 'Eli' }, true)!)).toContain('Tell me about Eli: Putts');
    const mine = decodeURIComponent(askAboutReadHref({ insightId: 'i1', title: 'Putts' }, true)!);
    expect(mine).toContain('Tell me about my read: Putts');
    expect(mine).toContain('insight=i1');
  });
});
