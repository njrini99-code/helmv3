/**
 * `signal.ageDays` derives from `golf_coach_insights.created_at`, frozen by
 * upsert-by-signature — a signal recomputed today into an old row still
 * reads as old. `BriefBand.tsx` and `buildTriageViewModel.ts` already
 * dropped every "New this week" / recency-bucketed UI for this reason (a
 * confident age reading is worse than none). `TeamSignalSummary` must not
 * reintroduce the same bug via its own "New this week" tile, "Signal
 * velocity" age-band chart, or per-category "fresh" caption.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamSignalSummary } from '../TeamSignalSummary';
import { groupSignals, type GroupedSignal } from '@/lib/coachhelm/signal-grouping';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => new URLSearchParams(),
}));

function sig(playerId: string, metric: string, ageDays: number): GroupedSignal {
  return {
    id: `${playerId}:${metric}`,
    kind: 'insight',
    category: metric,
    severity: 'high',
    title: `${metric} leak`,
    claim: 'A leak.',
    ageDays,
    status: 'active',
    strokeImpact: 1.2,
    playerId,
    supersededCount: 0,
    evidence: { metric, metric_label: 'Putts Made 3-5 ft' },
  };
}

describe('TeamSignalSummary — no age-bucketed recency UI', () => {
  it('does not render a "New this week" metric or a Signal velocity chart', () => {
    // Every row is stamped old (ageDays: 40) so a bucketed reading would
    // show "0 New this week" even though nothing here is actually stale
    // insight generation — a confident zero is exactly the bug being guarded.
    const signals = [
      sig('p1', 'putts_made_3_5ft_pct', 40),
      sig('p2', 'driving_accuracy_pct', 40),
    ];
    const groups = groupSignals(signals, { p1: 'A', p2: 'B' });

    render(<TeamSignalSummary groups={groups} categoryHref={(c) => `/golf/dashboard/intelligence?view=lab&filter=category:${c}`} onOpenCategory={vi.fn()} />);

    expect(screen.queryByText('New this week')).toBeNull();
    expect(screen.queryByText('Signal velocity')).toBeNull();
    expect(screen.queryByText(/^\d+ fresh$/)).toBeNull();
  });

  it('still renders the roster counts from real severities, not ages', () => {
    const signals = [
      sig('p1', 'putts_made_3_5ft_pct', 3),
      sig('p2', 'driving_accuracy_pct', 3),
    ];
    const groups = groupSignals(signals, { p1: 'A', p2: 'B' });

    render(<TeamSignalSummary groups={groups} categoryHref={(c) => `/golf/dashboard/intelligence?view=lab&filter=category:${c}`} onOpenCategory={vi.fn()} />);

    // Both signals are high severity, from two players, in two areas.
    const high = screen.getByText('High priority').closest('div');
    expect(high).toHaveTextContent('2');
    expect(screen.getByText('Players flagged').closest('div')).toHaveTextContent('2');
    expect(screen.getByText('Game categories').closest('div')).toHaveTextContent('2');
    expect(screen.getByText('2 live')).toBeInTheDocument();
  });

  it('links every ranked area into The Lab, filtered to that area', () => {
    const signals = [sig('p1', 'putts_made_3_5ft_pct', 3)];
    const groups = groupSignals(signals, { p1: 'A' });
    const onOpenCategory = vi.fn();

    render(<TeamSignalSummary groups={groups} categoryHref={(c) => `/golf/dashboard/intelligence?view=lab&filter=category:${c}`} onOpenCategory={onOpenCategory} />);

    const link = screen.getByRole('link', { name: /1 signal/ });
    expect(link).toHaveAttribute('href', '/golf/dashboard/intelligence?view=lab&filter=category:putts_made_3_5ft_pct');
    link.click();
    expect(onOpenCategory).toHaveBeenCalledWith('putts_made_3_5ft_pct');
  });
});
