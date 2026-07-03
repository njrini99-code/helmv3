import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PanelBoundary } from '@/app/admin/_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from '@/app/admin/_components/PanelStates';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// `ReactElement` (not the global `JSX.Element`): React 19's @types/react no
// longer expose a global `JSX` namespace (it's `React.JSX` now).
function Bomb(): ReactElement {
  throw new Error('panel exploded');
}

describe('PanelBoundary', () => {
  it('contains a child crash to an amber stale card — never blanks the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <PanelBoundary title="Errors">
        <Bomb />
      </PanelBoundary>,
    );
    expect(screen.getByText(/Errors/)).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('never claims to show data it does not have', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <PanelBoundary title="Errors">
        <Bomb />
      </PanelBoundary>,
    );
    // The old copy said "showing last known data" while rendering none —
    // flagged by the 2026-07-03 Mission Control sweep during the 42501 outage.
    expect(screen.queryByText(/last known data/i)).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('offers a retry that refreshes the server render and remounts the panel', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRefresh.mockClear();

    let shouldExplode = true;
    function FlakyPanel(): ReactElement {
      if (shouldExplode) throw new Error('transient upstream failure');
      return <p>recovered content</p>;
    }

    render(
      <PanelBoundary title="Errors">
        <FlakyPanel />
      </PanelBoundary>,
    );
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();

    shouldExplode = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('recovered content')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders healthy children untouched', () => {
    render(
      <PanelBoundary title="Errors">
        <p>healthy content</p>
      </PanelBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
  });
});

describe('panel states are visually distinct', () => {
  it('all-clear is celebratory + timestamped', () => {
    render(<PanelAllClear label="No errors in the last 24h" checkedAt="2026-07-01T12:00:00Z" />);
    expect(screen.getByText(/No errors in the last 24h/)).toBeInTheDocument();
    expect(screen.getByText(/checked/)).toBeInTheDocument();
  });
  it('no-data explains what WOULD appear', () => {
    render(<PanelNoData label="No data yet" description="Pitch-level rows appear here once ingestion starts" />);
    expect(screen.getByText(/once ingestion starts/)).toBeInTheDocument();
  });
  it('stale is honest about unavailability and carries the upstream error', () => {
    render(<PanelStale label="Sentry" error="429" />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('429')).toBeInTheDocument();
    expect(screen.queryByText(/last known data/i)).not.toBeInTheDocument();
  });
});
