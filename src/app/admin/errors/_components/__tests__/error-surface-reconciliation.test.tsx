// The component that renders the state the board could not express.
//
// It renders even when everything agrees — a deliberate departure from
// BlindnessBeacon, which returns null when nothing is wrong. Silence is right
// for a WARNING and wrong for a RECONCILIATION: without a visible row, "the
// surfaces agree" and "nobody compared them" look identical, which is the
// failure this whole thing exists to remove.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorSurfaceReconciliation } from '@/app/admin/_components/ErrorSurfaceReconciliation';
import { reconcileErrorSurfaces } from '@/lib/admin/incidents/reconciliation';

const verdictFor = (appCount: number | null, sentryCount: number | null, blindApp = false) =>
  reconcileErrorSurfaces({
    application: { health: blindApp ? 'blind' : 'reading', count: appCount },
    runtime: { health: 'reading', count: sentryCount },
  });

describe('ErrorSurfaceReconciliation', () => {
  it('renders BOTH surfaces separately and an overall verdict', () => {
    render(<ErrorSurfaceReconciliation verdict={verdictFor(0, 12)} />);
    expect(screen.getByText('APPLICATION EVENTS')).toBeInTheDocument();
    expect(screen.getByText('RUNTIME ERROR SURFACE')).toBeInTheDocument();
    expect(screen.getByText('OVERALL')).toBeInTheDocument();
  });

  it('REPRODUCES 2026-08-30: OVERALL says partial while a row still says healthy', () => {
    // Both facts are true at once, and that is the point: application events
    // ARE quiet. What must never happen again is that row's word standing as
    // the verdict for production.
    render(<ErrorSurfaceReconciliation verdict={verdictFor(0, 12)} />);
    const overallRow = screen.getByText('OVERALL').parentElement;
    expect(overallRow?.textContent).toContain('partial');
    expect(overallRow?.textContent).not.toContain('healthy');
  });

  it('still renders when the two surfaces AGREE — an invisible check is no check', () => {
    render(<ErrorSurfaceReconciliation verdict={verdictFor(0, 0)} />);
    expect(screen.getByLabelText('Error surface reconciliation')).toBeInTheDocument();
    // Three rows, all agreeing — including OVERALL, which is the row a reader
    // needs in order to know the comparison happened at all.
    expect(screen.getAllByText('healthy')).toHaveLength(3);
    expect(screen.getByText('OVERALL').parentElement?.textContent).toContain('healthy');
  });

  it('renders an unread count as an em-dash, never as 0', () => {
    render(<ErrorSurfaceReconciliation verdict={verdictFor(null, 0, true)} />);
    // The count sits in its own text node, so match on the row's textContent.
    expect(
      screen.getByText((_t, el) => el?.tagName === 'DD' && el.textContent === '(admin_events, —)'),
    ).toBeInTheDocument();
    expect(screen.getByText('blind')).toBeInTheDocument();
  });

  it('always renders the explaining sentence', () => {
    render(<ErrorSurfaceReconciliation verdict={verdictFor(0, 12)} />);
    expect(screen.getByText(/neither zero describes production on its own/)).toBeInTheDocument();
  });
});
