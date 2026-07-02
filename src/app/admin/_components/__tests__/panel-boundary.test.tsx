import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PanelBoundary } from '@/app/admin/_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from '@/app/admin/_components/PanelStates';

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
  it('stale carries the upstream error', () => {
    render(<PanelStale label="Sentry" error="429" />);
    expect(screen.getByText(/last known data/i)).toBeInTheDocument();
  });
});
