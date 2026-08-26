import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  AdminErrorBoundary,
  CardErrorBoundary,
  SectionErrorBoundary,
} from '@/app/golf/admin/components/AdminErrorBoundary';
import { logError } from '@/lib/error-logging';

vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn(),
}));

const mockLogError = vi.mocked(logError);

// `ReactElement` (not the global `JSX.Element`): React 19's @types/react no
// longer expose a global `JSX` namespace (it's `React.JSX` now).
function Bomb(): ReactElement {
  throw new Error('dashboard exploded');
}

describe('AdminErrorBoundary', () => {
  it('renders healthy children untouched', () => {
    render(
      <AdminErrorBoundary title="Dashboard Error">
        <p>healthy content</p>
      </AdminErrorBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('reports the crash through the shared client error-logging pipeline BY DEFAULT — no onError required', () => {
    // This is the gap this test guards: previously componentDidCatch only
    // console.error'd unless a caller passed its own onError, and the real
    // consumer (src/app/golf/admin/page.tsx wraps the whole dashboard in
    // <AdminErrorBoundary title="Dashboard Error" size="lg">) passes none.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLogError.mockClear();

    render(
      <AdminErrorBoundary title="Dashboard Error">
        <Bomb />
      </AdminErrorBoundary>,
    );

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const call = mockLogError.mock.calls[0];
    if (!call) throw new Error('logError was not called');
    const [reportedError, context, severity] = call;
    expect(reportedError).toBeInstanceOf(Error);
    expect((reportedError as Error).message).toBe('dashboard exploded');
    expect(context).toMatchObject({
      boundary: 'admin',
      feature: 'admin_dashboard',
      sport: 'shared',
    });
    expect(severity).toBe('medium');

    // The fallback still renders — reporting is a side effect, not a
    // replacement for the existing degrade-gracefully behavior.
    expect(screen.getByText('Dashboard Error')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('still invokes a caller-supplied onError as an ADDITIONAL callback, not a replacement', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLogError.mockClear();
    const onError = vi.fn();

    render(
      <AdminErrorBoundary title="Dashboard Error" onError={onError}>
        <Bomb />
      </AdminErrorBoundary>,
    );

    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    const [reportedError] = onError.mock.calls[0] as [Error];
    expect(reportedError.message).toBe('dashboard exploded');
    spy.mockRestore();
  });

  it('never throws out of the reporting path, even if the logger itself fails', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLogError.mockClear();
    mockLogError.mockImplementationOnce(() => {
      throw new Error('logging pipeline unavailable');
    });

    expect(() =>
      render(
        <AdminErrorBoundary title="Dashboard Error">
          <Bomb />
        </AdminErrorBoundary>,
      ),
    ).not.toThrow();

    expect(screen.getByText('Dashboard Error')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('CardErrorBoundary and SectionErrorBoundary inherit the same default reporting', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLogError.mockClear();

    render(
      <CardErrorBoundary cardName="Live posture">
        <Bomb />
      </CardErrorBoundary>,
    );
    expect(mockLogError).toHaveBeenCalledTimes(1);

    mockLogError.mockClear();
    render(
      <SectionErrorBoundary sectionName="Rollups">
        <Bomb />
      </SectionErrorBoundary>,
    );
    expect(mockLogError).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
