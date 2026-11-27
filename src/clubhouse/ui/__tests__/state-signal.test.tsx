import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** E4 (Bridge plan §4.2, §4.5): a numbered state is counted when drawn, and a page whose one read failed is a failure. */

const signal = vi.hoisted(() => vi.fn((_input: unknown) => null));
vi.mock('../../lib/signal', () => ({ chSignal: signal }));

import { EmptyState } from '../States';

describe('state signals', () => {
  afterEach(() => {
    cleanup();
    signal.mockClear();
  });

  it('counts a page whose one read failed as a failed load, under CH-1211 or its own code', () => {
    render(<EmptyState size="page" tone="danger" title="Team rounds didn’t load" />);
    render(<EmptyState size="page" tone="danger" code="CH-4201" title="Team rounds didn’t load" />);
    expect(signal.mock.calls.map(([s]) => s)).toEqual([
      { kind: 'state', code: 'CH-1211', outcome: 'failure' },
      { kind: 'state', code: 'CH-4201', outcome: 'failure' },
    ]);
  });

  it('counts an empty, a filter that hides everything and a dead end as states, never as failures', () => {
    render(<EmptyState size="page" code="CH-4301" title="No rounds yet" shape="rows" />);
    render(<EmptyState kind="filtered" code="CH-4313" title="No rounds match these filters" />);
    render(<EmptyState size="canvas" code="CH-1208" title="Not found" />);
    render(<EmptyState code="CH-4307" title="No season bests yet" />);
    expect(signal.mock.calls.map(([s]) => s)).toEqual([
      { kind: 'state', code: 'CH-4301' },
      { kind: 'state', code: 'CH-4313' },
      { kind: 'state', code: 'CH-1208' },
      { kind: 'state', code: 'CH-4307' },
    ]);
  });
});
