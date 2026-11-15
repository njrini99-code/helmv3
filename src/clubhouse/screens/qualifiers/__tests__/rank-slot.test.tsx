import { act, cleanup, render } from '@testing-library/react';
import { startTransition, ViewTransition, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RankSlot, useRankSlideArmed } from '../RankSlot';

/**
 * pa-mot-02 (MOTION-AND-VISUAL 3.3; audit S4.8): a push into a qualifier starts no document view transition. React 19.3
 * starts one whenever a `<ViewTransition>` mounts in a transition commit, whatever its `enter` class, and a navigation
 * is a transition; the leaderboard's per-row boundaries therefore wait for the board to land.
 */
let start: ReturnType<typeof vi.fn>;
beforeEach(() => {
  start = vi.fn((arg: { update: () => void }) => {
    arg.update();
    const done = Promise.resolve();
    return { ready: done, finished: done, updateCallbackDone: done, skipTransition: () => {}, types: new Set() };
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: start });
});
afterEach(() => {
  cleanup();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});

function Board({ ids, slide = false }: { ids: string[]; slide?: boolean }) {
  const armed = useRankSlideArmed();
  return (
    <ol>
      {ids.map((id) => (
        <li key={id}>
          <RankSlot id={id} slide={slide} armed={armed}>
            <button type="button">{id}</button>
          </RankSlot>
        </li>
      ))}
    </ol>
  );
}

/** Mounts `node` as a navigation does: inside a transition. */
async function navigateTo(node: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = render(<div />, { container: host });
  await act(async () => {
    startTransition(() => view.rerender(node));
  });
  return view;
}

describe('the leaderboard rows on a push (pa-mot-02)', () => {
  it('a raw row boundary mounting in a transition starts a document view transition, even with enter="none"', async () => {
    await navigateTo(
      <ViewTransition name="ch-rank-a" update="none" enter="none" exit="none" share="none" default="none">
        <button type="button">a</button>
      </ViewTransition>,
    );
    expect(start).toHaveBeenCalled();
  });

  it('the board mounts in a transition with no view transition, and its rows gain their boundaries right after', async () => {
    const view = await navigateTo(<Board ids={['a', 'b', 'c']} />);
    expect(start).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('button')).toHaveLength(3);
    // Armed by then: a refresh that changes no rank (update="none") still starts none.
    await act(async () => {
      startTransition(() => view.rerender(<Board ids={['a', 'b', 'c']} />));
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('once armed, a refresh that re-ranks the rows starts the slide', async () => {
    const view = await navigateTo(<Board ids={['a', 'b', 'c']} />);
    await act(async () => {
      startTransition(() => view.rerender(<Board ids={['b', 'a', 'c']} slide />));
    });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
