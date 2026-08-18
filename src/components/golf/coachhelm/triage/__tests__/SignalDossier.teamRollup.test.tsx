/**
 * A roster roll-up must not offer actions that cannot work.
 *
 * `synthesizeTeamSignals` mints rows with a synthetic id (`team:<metric>`) and
 * no database row behind them. `TriageDesk.runSignalAction` now refuses them —
 * otherwise it would call acknowledgeInsight/dismissInsight with an id that
 * matches nothing and optimistically remove a card that returns on refresh.
 *
 * But the dossier renders "Mark reviewed" and "Dismiss" unconditionally, so
 * the guard alone leaves two buttons that look live and silently do nothing —
 * a worse affordance than before the roll-ups existed. There is also nothing
 * coherent for them to mean: dismissing a summary would not touch any of the
 * leaks it summarizes, each of which has its own card.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignalDossier } from '../SignalDossier';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => new URLSearchParams(),
}));

function signal(over: Partial<GroupedSignal> = {}): GroupedSignal {
  return {
    id: 'team:putts_made_3_5ft_pct',
    kind: 'team_synthesis',
    category: 'putts_made_3_5ft_pct',
    severity: 'high',
    title: 'Team leak: Putts Made 3-5 ft',
    claim: '6 players are losing a combined 9.95 strokes per round.',
    ageDays: 0,
    status: 'active',
    strokeImpact: 9.95,
    playerId: null,
    supersededCount: 0,
    evidence: { metric: 'putts_made_3_5ft_pct', metric_label: 'Putts Made 3-5 ft' },
    ...over,
  };
}

function group(s: GroupedSignal): SignalGroup {
  return {
    playerId: s.playerId,
    playerName: s.playerId ? 'Cole Bennett' : 'Team',
    worstSeverity: s.severity,
    signals: [s],
    attentionScore: 10,
  };
}

const noop = vi.fn();

function renderDossier(s: GroupedSignal) {
  return render(
    <SignalDossier
      entry={{ signal: s, group: group(s) }}
      coachId="c1"
      pending={false}
      onReview={noop}
      onDismiss={noop}
      onPromoted={noop}
      onBack={noop}
      onSelectSignal={noop}
    />,
  );
}

describe('SignalDossier — team roll-up', () => {
  it('offers no Mark reviewed / Dismiss on a synthesized roster total', () => {
    renderDossier(signal());

    expect(screen.queryByRole('button', { name: /mark reviewed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('still shows the combined strokes, which is the whole point of the card', () => {
    renderDossier(signal());
    // The claim sentence also names the figure, so match the mono readout
    // specifically rather than asserting a unique occurrence.
    expect(screen.getAllByText(/9\.95 strokes/).length).toBeGreaterThan(0);
  });

  it('keeps both actions on a real per-player insight', () => {
    renderDossier(signal({
      id: 'real-row',
      kind: 'insight',
      playerId: 'p1',
      strokeImpact: 2.0,
    }));

    expect(screen.getByRole('button', { name: /mark reviewed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });
});
