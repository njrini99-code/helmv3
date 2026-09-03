// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JourneyFlow } from './JourneyFlow';
import type { JourneyLens, JourneyStage } from '@/lib/admin/lenses/types';

function stage(overrides: Partial<JourneyStage> = {}): JourneyStage {
  return {
    id: 'stage',
    label: 'Stage',
    featureKeys: ['round_tracking'],
    metric: { attempts: 10, completions: 8, successRate: 0.8 },
    incidents: { count: 1, criticalCount: 0 },
    confidence: 'durable_and_proven',
    sourceNote: 'test source note',
    ...overrides,
  };
}

function lens(stages: JourneyStage[]): JourneyLens {
  return {
    id: 'golf',
    title: 'Golf Journey River',
    generatedAt: '2026-09-03T00:00:00Z',
    windowDays: 14,
    stages,
    degradedNote: null,
  };
}

describe('JourneyFlow', () => {
  it('renders one node per stage, in order, with the stage label', () => {
    render(<JourneyFlow lens={lens([stage({ id: 'a', label: 'Login' }), stage({ id: 'b', label: 'Start round' })])} />);
    const labels = screen.getAllByText(/Login|Start round/);
    expect(labels.map((el) => el.textContent)).toEqual(['Login', 'Start round']);
  });

  it('renders a null metric as "Unavailable", never a fabricated zero', () => {
    render(
      <JourneyFlow
        lens={lens([stage({ metric: { attempts: null, completions: null, successRate: null } })])}
      />,
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('renders a real zero distinctly from an unavailable metric', () => {
    render(<JourneyFlow lens={lens([stage({ metric: { attempts: 0, completions: 0, successRate: null } })])} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
  });

  it('shows "incidents unknown" rather than a fabricated 0 when the incident read failed', () => {
    render(<JourneyFlow lens={lens([stage({ incidents: { count: null, criticalCount: null } })])} />);
    expect(screen.getByText('incidents unknown')).toBeInTheDocument();
  });

  it('always shows the confidence label and source note next to the stage, never hidden', () => {
    render(<JourneyFlow lens={lens([stage({ confidence: 'brief_derived', sourceNote: 'invented for the test' })])} />);
    expect(screen.getByText('brief-derived')).toBeInTheDocument();
    expect(screen.getByText(/invented for the test/)).toBeInTheDocument();
  });
});
