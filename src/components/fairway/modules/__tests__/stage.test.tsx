// @vitest-environment jsdom
/**
 * StageRouter — smoke coverage for the param ↔ view mapping (Task 3).
 *
 * Overrides the project-wide `next/navigation` mock (src/test/setup.tsx,
 * which always returns an empty URLSearchParams + no-op navigators) with a
 * mutable module-level URLSearchParams so each test can point
 * `useSearchParams()` at a different query before rendering — the same
 * per-file override pattern used by
 * src/components/coach/discover/__tests__/DiscoverView.test.tsx.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const replaceMock = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => mockSearchParams,
}));

import { StageRouter } from '../StageRouter';
import type { StageView } from '../types';

const VIEWS: StageView[] = [
  { key: 'home', node: <p>Home view content</p> },
  { key: 'putting', node: <p>Putting view content</p> },
];

describe('StageRouter', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it('renders the home view by default (no param present)', () => {
    render(<StageRouter param="area" homeKey="home" views={VIEWS} />);

    expect(screen.getByText('Home view content')).toBeInTheDocument();
    expect(screen.queryByText('Putting view content')).not.toBeInTheDocument();
  });

  it('renders the param-selected view when the param matches a known key', () => {
    mockSearchParams = new URLSearchParams('area=putting');
    render(<StageRouter param="area" homeKey="home" views={VIEWS} />);

    expect(screen.getByText('Putting view content')).toBeInTheDocument();
    expect(screen.queryByText('Home view content')).not.toBeInTheDocument();
  });

  it('falls back to the home view when the param is unknown', () => {
    mockSearchParams = new URLSearchParams('area=bogus');
    render(<StageRouter param="area" homeKey="home" views={VIEWS} />);

    expect(screen.getByText('Home view content')).toBeInTheDocument();
    expect(screen.queryByText('Putting view content')).not.toBeInTheDocument();
  });
});
