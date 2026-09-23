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

    render(<TeamSignalSummary groups={groups} playerHref={(id) => `/golf/dashboard/players/${id}`} onOpenPlayer={vi.fn()} />);

    expect(screen.queryByText('New this week')).toBeNull();
    expect(screen.queryByText('Signal velocity')).toBeNull();
    expect(screen.queryByText(/^\d+ fresh$/)).toBeNull();
  });

  it('still renders the severity mix using real severity counts', () => {
    const signals = [
      sig('p1', 'putts_made_3_5ft_pct', 3),
      sig('p2', 'driving_accuracy_pct', 3),
    ];
    const groups = groupSignals(signals, { p1: 'A', p2: 'B' });

    render(<TeamSignalSummary groups={groups} playerHref={(id) => `/golf/dashboard/players/${id}`} onOpenPlayer={vi.fn()} />);

    expect(screen.getByText('Severity mix')).toBeInTheDocument();
    expect(screen.getByText('2 total')).toBeInTheDocument();
  });
});
