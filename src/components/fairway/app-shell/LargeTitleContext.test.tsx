// =============================================================================
// src/components/fairway/app-shell/LargeTitleContext.test.tsx
//
// Pins the per-route title registry's contract: a page registers the name the
// top bar should show, the value is CLEARED on unmount so the next route never
// inherits a stale title, and consumers outside a provider degrade to a no-op
// instead of throwing.
//
// This file used to test an IntersectionObserver-driven `condensed` flag, a
// static header sentinel and a `FairwayContentAnchor` node-resolution tier —
// the machinery behind "the title cross-fades into the bar once you scroll
// past the page masthead". That behaviour was the bug (at scroll 0 nothing on
// screen named the view), the bar now shows its title unconditionally, and all
// of it was deleted on 2026-07-25. See LargeTitleContext.tsx's module doc.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FairwayLargeTitleProvider, useLargeTitle } from './LargeTitleContext';

/** Reads the registry the way `FairwayTopBar` does. */
function TitleProbe() {
  const { registeredTitle } = useLargeTitle();
  return <span data-testid="registered">{String(registeredTitle)}</span>;
}

/** Writes to the registry the way `FairwayLargeTitle` does. */
function Registrar({ title }: { title: string }) {
  const { setRegisteredTitle } = useLargeTitle();
  return (
    <>
      <Button type="button" onClick={() => setRegisteredTitle(title)}>
        register
      </Button>
      <Button type="button" onClick={() => setRegisteredTitle(null)}>
        clear
      </Button>
    </>
  );
}

describe('useLargeTitle outside a provider', () => {
  it('degrades to no title and a no-op setter (never throws)', () => {
    expect(() =>
      render(
        <>
          <TitleProbe />
          <Registrar title="Roster" />
        </>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('registered')).toHaveTextContent('null');

    act(() => {
      screen.getByRole('button', { name: 'register' }).click();
    });
    // The no-op setter silently discards it rather than crashing.
    expect(screen.getByTestId('registered')).toHaveTextContent('null');
  });
});

describe('FairwayLargeTitleProvider', () => {
  it('starts with no registered title so the shell fallback wins by default', () => {
    render(
      <FairwayLargeTitleProvider>
        <TitleProbe />
      </FairwayLargeTitleProvider>,
    );
    expect(screen.getByTestId('registered')).toHaveTextContent('null');
  });

  it('publishes a registered title to every consumer', () => {
    render(
      <FairwayLargeTitleProvider>
        <TitleProbe />
        <Registrar title="Users & Teams" />
      </FairwayLargeTitleProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'register' }).click();
    });
    expect(screen.getByTestId('registered')).toHaveTextContent('Users & Teams');
  });

  it('clears back to null so the next route never inherits a stale title', () => {
    render(
      <FairwayLargeTitleProvider>
        <TitleProbe />
        <Registrar title="Users & Teams" />
      </FairwayLargeTitleProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'register' }).click();
    });
    expect(screen.getByTestId('registered')).toHaveTextContent('Users & Teams');

    act(() => {
      screen.getByRole('button', { name: 'clear' }).click();
    });
    expect(screen.getByTestId('registered')).toHaveTextContent('null');
  });

  it('holds no scroll state — re-rendering its subtree cannot change the title', () => {
    function Harness() {
      const [tick, setTick] = useState(0);
      return (
        <FairwayLargeTitleProvider>
          <TitleProbe />
          <Registrar title="Roster" />
          <span data-testid="tick">{tick}</span>
          <Button type="button" onClick={() => setTick((t) => t + 1)}>
            rerender
          </Button>
        </FairwayLargeTitleProvider>
      );
    }
    render(<Harness />);

    act(() => {
      screen.getByRole('button', { name: 'register' }).click();
    });
    act(() => {
      screen.getByRole('button', { name: 'rerender' }).click();
    });

    expect(screen.getByTestId('tick')).toHaveTextContent('1');
    expect(screen.getByTestId('registered')).toHaveTextContent('Roster');
  });
});
