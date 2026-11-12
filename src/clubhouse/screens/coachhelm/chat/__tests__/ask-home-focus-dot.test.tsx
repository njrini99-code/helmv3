import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));

import type { ChAskData } from '../../../../data/coachhelm-chat-shape';
import { PREVIEW_ASK_DATA, PREVIEW_ASK_PLAYER_SUGGESTIONS } from '../../../../preview/fixtures-ask';
import { AskHomeV2 } from '../Home';

afterEach(cleanup);

const PLAYER: ChAskData = { ...PREVIEW_ASK_DATA, role: 'player', firstName: 'Jonah', suggestions: PREVIEW_ASK_PLAYER_SUGGESTIONS, allowance: 'plenty' };
const rows = (focus: NonNullable<ChAskData['focus']>, phone = false) => {
  const { container } = render(<AskHomeV2 data={PLAYER} phone={phone} heroComposer={<div />} onAsk={() => undefined} focus={focus} />);
  return [...container.querySelectorAll('.ch-ak-home .pulse .rw')];
};

/**
 * A player's "Your focus" (Ask home A): a line whose area has no outcome yet drew an empty `<i>`, an 8px slot and its
 * gap with nothing in it, so its words started further in than a line with a dot. The dot is drawn only when it says
 * something.
 */
describe('Your focus: a dot only where there is a trend', () => {
  it('a line with no trend draws no dot slot; its words are the row’s first child', () => {
    for (const phone of [false, true]) {
      const [row] = rows([{ text: 'Approach from 125 to 150', ask: 'How is my approach doing?' }], phone);
      expect(row!.querySelector('i')).toBeNull();
      expect(row!.firstElementChild!.tagName).toBe('SPAN');
      cleanup();
    }
  });

  it('a line with a trend keeps its dot, in its tone', () => {
    const [up, warn] = rows([
      { text: 'Putting', ask: 'How is my putting?', trend: 'up' },
      { text: 'Driving', ask: 'How is my driving?', trend: 'warn' },
    ]);
    expect(up!.querySelector('i')!.className).toBe('is-fine');
    expect(warn!.querySelector('i')!.className).toBe('is-warn');
  });

  it('mixed lines: only the ones with a trend have a dot', () => {
    const r = rows([
      { text: 'Putting', ask: 'How is my putting?', trend: 'up' },
      { text: 'Wedges', ask: null },
    ]);
    expect(r.map((x) => !!x.querySelector('i'))).toEqual([true, false]);
  });
});
