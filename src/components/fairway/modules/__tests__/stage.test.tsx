// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal context trigger */
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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const replaceMock = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => mockSearchParams,
}));

import { StageRouter, replaceStageUrl, useStage } from '../StageRouter';
import type { StageView } from '../types';

const VIEWS: StageView[] = [
  { key: 'home', node: <p>Home view content</p> },
  { key: 'putting', node: <p>Putting view content</p> },
];

function StageTrigger() {
  const stage = useStage();
  return <button onClick={() => stage.open('putting')}>Open putting</button>;
}

const INTERACTIVE_VIEWS: StageView[] = [
  { key: 'home', node: <StageTrigger /> },
  { key: 'putting', node: <p>Putting view content</p> },
];

describe('StageRouter', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    mockSearchParams = new URLSearchParams();
    window.history.replaceState({}, '', '/golf/dashboard/stats');
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

  it('does NOT make the stage an aria-live region — the focus move announces a swap exactly once', () => {
    // Requirement changed on purpose (a11y audit 2026-09): with BOTH
    // aria-live="polite" on the stage and focus moving into the new view,
    // every swap was announced twice.
    const { container } = render(<StageRouter param="area" homeKey="home" views={VIEWS} />);
    const stage = container.querySelector('[data-slot="stage"]');
    expect(stage).not.toBeNull();
    expect(stage).not.toHaveAttribute('aria-live');
  });

  it('gives the active view container a focusable (tabIndex -1) target', () => {
    const { container } = render(<StageRouter param="area" homeKey="home" views={VIEWS} />);
    const stageview = container.querySelector('[data-slot="stageview"]');
    expect(stageview).not.toBeNull();
    expect(stageview).toHaveAttribute('tabindex', '-1');
  });

  it('does NOT steal focus on initial mount', () => {
    const { container } = render(<StageRouter param="area" homeKey="home" views={VIEWS} />);
    const stageview = container.querySelector('[data-slot="stageview"]');
    expect(stageview).not.toBeNull();
    expect(stageview).not.toHaveFocus();
  });

  it('swaps an already-loaded drill-in immediately and shallowly updates the URL', () => {
    render(<StageRouter param="area" homeKey="home" views={INTERACTIVE_VIEWS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open putting' }));

    expect(screen.getByText('Putting view content')).toBeInTheDocument();
    expect(window.location.search).toBe('?area=putting');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('writes history with null state so Next syncs its router URL (no stale canonical URL)', () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    render(<StageRouter param="area" homeKey="home" views={INTERACTIVE_VIEWS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open putting' }));
    expect(spy).toHaveBeenCalledWith(null, '', '/golf/dashboard/stats?area=putting');
    spy.mockRestore();
  });

  it('ignores a hook snapshot that trails the live URL (rapid taps do not flash the old stage)', () => {
    const { rerender } = render(<StageRouter param="area" homeKey="home" views={INTERACTIVE_VIEWS} />);
    // Tap 1: home -> putting. Tap 2 (before Next's sync lands): back home.
    fireEvent.click(screen.getByRole('button', { name: 'Open putting' }));
    act(() => {
      replaceStageUrl('area', 'home', 'home');
    });
    expect(window.location.search).toBe('');
    expect(screen.getByRole('button', { name: 'Open putting' })).toBeInTheDocument();
    // Now the snapshot catches up to tap 1 only — it trails the address bar.
    mockSearchParams = new URLSearchParams('area=putting');
    rerender(<StageRouter param="area" homeKey="home" views={INTERACTIVE_VIEWS} />);
    expect(screen.getByRole('button', { name: 'Open putting' })).toBeInTheDocument();
    expect(screen.queryByText('Putting view content')).not.toBeInTheDocument();
  });

  it('moves focus to the new view container when the view changes (a re-mount with a new key)', () => {
    const { container, rerender } = render(
      <StageRouter param="area" homeKey="home" views={VIEWS} />,
    );
    expect(container.querySelector('[data-slot="stageview"]')).not.toHaveFocus();

    // Simulate the navigation StageRouter performs internally: the param
    // changes, `activeKey` recomputes, and the stageview div re-keys/remounts
    // on the new view — the same trigger `open()`/`home()` produce via
    // router.replace + useSearchParams picking up the new param.
    // Next updates the address bar before the hook snapshot, so a real
    // external navigation changes both.
    mockSearchParams = new URLSearchParams('area=putting');
    window.history.replaceState({}, '', '/golf/dashboard/stats?area=putting');
    rerender(<StageRouter param="area" homeKey="home" views={VIEWS} />);

    const stageview = container.querySelector('[data-slot="stageview"][data-stage-key="putting"]');
    expect(stageview).not.toBeNull();
    expect(stageview).toHaveFocus();
  });
});
