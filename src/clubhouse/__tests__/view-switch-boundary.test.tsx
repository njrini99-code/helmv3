import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense, startTransition, use, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The premise of CoachHelm's view switch (routes/coachhelm.tsx, perf 2026-10-01): when the next view is not ready, a transition keeps
 * the view that is on screen if the Suspense that holds it is the same one (same place, no key), and draws the fallback over it if
 * the boundary is new (keyed by view, as the page used to be). The route's views are server components behind Next's router, which
 * runs a navigation as a transition; this is React's own rule, with the server taken out.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function View({ read }: { read: Promise<string> }) {
  return <p data-testid="view">{use(read)}</p>;
}

function Harness({ keyed, reads }: { keyed: boolean; reads: Record<string, Promise<string>> }) {
  const [view, setView] = useState('board');
  return (
    <div>
      <button type="button" onClick={() => startTransition(() => setView('profile'))}>
        switch
      </button>
      <Suspense key={keyed ? view : undefined} fallback={<p data-testid="skeleton">skeleton</p>}>
        <View read={reads[view]!} />
      </Suspense>
    </div>
  );
}

async function run(keyed: boolean) {
  // A read already answered, as the view on screen is: React reads its value without suspending.
  const board = Object.assign(Promise.resolve('Board'), { status: 'fulfilled', value: 'Board' }) as Promise<string>;
  const profile = deferred<string>();
  render(<Harness keyed={keyed} reads={{ board, profile: profile.promise }} />);
  await act(async () => {});
  expect(screen.getByTestId('view').textContent).toBe('Board');
  await act(async () => {
    screen.getByRole('button', { name: 'switch' }).click();
  });
  const during = { skeleton: screen.queryByTestId('skeleton') !== null, view: screen.queryByTestId('view')?.textContent ?? null };
  await act(async () => profile.resolve('Profile'));
  return { during, after: screen.getByTestId('view').textContent };
}

describe('a switch of view, as React runs it', () => {
  it('one Suspense in one place keeps the view on screen until the next is ready, then swaps once', async () => {
    const { during, after } = await run(false);
    expect(during).toEqual({ skeleton: false, view: 'Board' });
    expect(after).toBe('Profile');
  });

  it('a Suspense keyed by view draws the skeleton over it (the old page): the premise of not keying it', async () => {
    const { during } = await run(true);
    expect(during.skeleton).toBe(true);
  });
});
