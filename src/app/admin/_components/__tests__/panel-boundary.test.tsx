import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PanelBoundary } from '@/app/admin/_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from '@/app/admin/_components/PanelStates';
import { logError } from '@/lib/error-logging';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/admin',
}));

vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn(),
}));

const mockLogError = vi.mocked(logError);

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

  it('reports the crash through the shared client error-logging pipeline, attributed to this panel', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLogError.mockClear();

    render(
      <PanelBoundary title="Live posture">
        <Bomb />
      </PanelBoundary>,
    );

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const call = mockLogError.mock.calls[0];
    if (!call) throw new Error('logError was not called');
    const [reportedError, context, severity] = call;
    expect(reportedError).toBeInstanceOf(Error);
    expect((reportedError as Error).message).toBe('panel exploded');
    expect(context).toMatchObject({
      panelTitle: 'Live posture',
      route: '/admin',
      boundary: 'panel',
      feature: 'admin_dashboard',
    });
    expect(severity).toBe('medium');

    // The fallback must still render — reporting is a side effect, not a
    // replacement for the existing degrade-gracefully behavior.
    expect(screen.getByText(/Live posture/)).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('does not report when children render healthily', () => {
    mockLogError.mockClear();
    render(
      <PanelBoundary title="Errors">
        <p>healthy content</p>
      </PanelBoundary>,
    );
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('never throws out of the reporting path, even if the logger itself fails', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLogError.mockClear();
    mockLogError.mockImplementationOnce(() => {
      throw new Error('logging pipeline unavailable');
    });

    expect(() =>
      render(
        <PanelBoundary title="Errors">
          <Bomb />
        </PanelBoundary>,
      ),
    ).not.toThrow();

    // The fallback still renders even though the reporter itself blew up.
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    spy.mockRestore();
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
