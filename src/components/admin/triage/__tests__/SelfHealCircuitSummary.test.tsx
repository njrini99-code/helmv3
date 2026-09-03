import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelfHealCircuitSummary } from '@/components/admin/triage/SelfHealCircuitSummary';
import type { SelfHealCircuitStage, SelfHealCircuitView } from '@/lib/admin/triage/self-heal-circuit';
import { UNTRACKED_BUDGET } from '@/lib/admin/triage/self-heal-circuit';

function stage(overrides: Partial<SelfHealCircuitStage> = {}): SelfHealCircuitStage {
  return {
    stageId: 'triage',
    title: 'Diagnose',
    step: 1,
    runtimeStatus: 'ok',
    capabilityState: 'proven',
    capabilityEvidence: '12 analyses in 7d',
    currentRunInProgress: false,
    lastOutcome: null,
    waiting: 0,
    stalled: 0,
    oldestWaitingMs: null,
    unmeasured: 0,
    flowState: 'idle',
    budget: UNTRACKED_BUDGET,
    repairLink: null,
    ...overrides,
  };
}

function view(overrides: Partial<SelfHealCircuitView> = {}): SelfHealCircuitView {
  return {
    stages: [
      stage(),
      stage({ stageId: 'repair', title: 'Repair', step: 2 }),
      stage({ stageId: 'close', title: 'Close', step: 3 }),
    ],
    verdictLabel: 'Healthy',
    verdictDetail: 'All stages proven and on schedule.',
    verdictTone: 'ok',
    computedAt: '2026-09-03T00:00:00.000Z',
    unreadable: [],
    ...overrides,
  };
}

describe('SelfHealCircuitSummary', () => {
  it('renders the verdict and one tile per stage', () => {
    render(<SelfHealCircuitSummary view={view()} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
    expect(screen.getByText('Repair')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('always renders budget as "not tracked" — never a fabricated number', () => {
    render(<SelfHealCircuitSummary view={view()} />);
    const budgetCells = screen.getAllByText('not tracked');
    expect(budgetCells).toHaveLength(3);
  });

  it('renders a repair-quality link only for the stage that has one', () => {
    render(
      <SelfHealCircuitSummary
        view={view({
          stages: [
            stage(),
            stage({
              stageId: 'repair',
              title: 'Repair',
              step: 2,
              repairLink: { url: 'https://github.com/x/y/pull/9', number: 9, createdAt: '2026-09-02T00:00:00.000Z' },
            }),
            stage({ stageId: 'close', title: 'Close', step: 3 }),
          ],
        })}
      />,
    );
    const link = screen.getByRole('link', { name: /PR #9/ });
    expect(link).toHaveAttribute('href', 'https://github.com/x/y/pull/9');
  });

  it('shows a running badge only for the stage whose latest run is in progress', () => {
    render(
      <SelfHealCircuitSummary
        view={view({
          stages: [
            stage({ currentRunInProgress: true }),
            stage({ stageId: 'repair', title: 'Repair', step: 2 }),
            stage({ stageId: 'close', title: 'Close', step: 3 }),
          ],
        })}
      />,
    );
    expect(screen.getAllByText('running')).toHaveLength(1);
  });

  it('renders an unreadable-stage notice honestly, never silently as healthy', () => {
    render(<SelfHealCircuitSummary view={view({ unreadable: ['selfheal-close'] })} />);
    expect(screen.getByText(/Some stages could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/selfheal-close/)).toBeInTheDocument();
  });

  it('renders no unreadable notice when every stage read cleanly', () => {
    render(<SelfHealCircuitSummary view={view({ unreadable: [] })} />);
    expect(screen.queryByText(/Some stages could not be read/i)).not.toBeInTheDocument();
  });

  it('shows a stalled stage\'s oldest wait, distinct from a merely-waiting one', () => {
    render(
      <SelfHealCircuitSummary
        view={view({
          stages: [
            stage({ waiting: 3, stalled: 1, oldestWaitingMs: 2 * 60 * 60_000, flowState: 'stalled' }),
            stage({ stageId: 'repair', title: 'Repair', step: 2 }),
            stage({ stageId: 'close', title: 'Close', step: 3 }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/oldest 2 hours/)).toBeInTheDocument();
  });
});
