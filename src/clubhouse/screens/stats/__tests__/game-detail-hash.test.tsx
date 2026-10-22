// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDetail } from '../GameDetail';
import { gameSectionFromHash } from '../legs';
import { legDetailHref } from '../links';
import { filterFor } from '../../../data/stats-filter';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

const scrollIntoView = vi.fn();
beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = '';
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(cleanup);

function phoneDetail() {
  const d = PREVIEW_PLAYER;
  return render(
    <GameDetail s={d.stats!} x={d.extra} bench={d.bench} first="Jonah" rounds={d.win.rounds} window={d.window} phone />,
  );
}
const shown = (c: HTMLElement) => Array.from(c.querySelectorAll('section.ch-gm')).map((e) => e.id);

describe('gameSectionFromHash', () => {
  it('names a Game detail section, and nothing else', () => {
    expect(gameSectionFromHash('#gm-approach')).toBe('approach');
    expect(gameSectionFromHash('#gm-short')).toBe('short');
    expect(gameSectionFromHash('#gm-putting')).toBe('putting');
    expect(gameSectionFromHash('#gm-nope')).toBeNull();
    expect(gameSectionFromHash('#other')).toBeNull();
    expect(gameSectionFromHash('')).toBeNull();
  });
});

describe('Game detail on the phone, opened from a leg figure', () => {
  it('starts on Scoring with no hash', () => {
    const { container } = phoneDetail();
    expect(shown(container)).toEqual(['gm-scoring']);
  });

  it.each([['approach'], ['short'], ['putting']] as const)('draws and scrolls to #gm-%s, the section the address names', (id) => {
    window.location.hash = `#gm-${id}`;
    const { container } = phoneDetail();
    expect(shown(container)).toEqual([`gm-${id}`]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(`gm-${id}`));
  });

  it('follows a hash that changes while the page is open', () => {
    const { container } = phoneDetail();
    expect(shown(container)).toEqual(['gm-scoring']);
    act(() => {
      window.location.hash = '#gm-putting';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(shown(container)).toEqual(['gm-putting']);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('opens on the section every leg link of the team grid names', () => {
    for (const leg of ['Approach', 'Around green', 'Putting'] as const) {
      const hash = `#${legDetailHref('jonah', filterFor('last10'), leg).split('#')[1]}`;
      window.location.hash = hash;
      const { container, unmount } = phoneDetail();
      expect(shown(container)).toEqual([hash.slice(1)]);
      unmount();
    }
  });
});
