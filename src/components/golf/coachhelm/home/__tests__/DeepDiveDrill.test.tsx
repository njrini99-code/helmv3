/**
 * DD-01: the what-if simulation never projects from a missing prediction.
 * Before, `currentPrediction ?? 0` made "If you improve X" read as a change
 * from even par for a player with no prediction at all.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const whatIfProps = vi.fn();
const getPlayerWhatIfMock = vi.fn();

vi.mock('@/components/fairway', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/fairway/modules', () => ({
  DrillPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useStage: () => ({ home: vi.fn() }),
}));
vi.mock('@/components/golf/coachhelm/player/ShotAnalysisCard', () => ({
  ShotAnalysisCard: () => null,
}));
vi.mock('@/components/golf/coachhelm/player/WhatIfPanel', () => ({
  WhatIfPanel: (props: Record<string, unknown>) => {
    whatIfProps(props);
    return null;
  },
}));
vi.mock('@/app/golf/actions/coachhelm-data', () => ({
  getPlayerWhatIf: (...args: unknown[]) => getPlayerWhatIfMock(...args),
}));

import { DeepDiveDrill } from '../DeepDiveDrill';

type Simulate = (metric: string, amount: number) => Promise<{ projectedScore: number; rankChange: number }>;

function lastOnSimulate(): Simulate | undefined {
  const calls = whatIfProps.mock.calls;
  return (calls[calls.length - 1]?.[0] as { onSimulate?: Simulate }).onSimulate;
}

describe('DeepDiveDrill what-if (DD-01)', () => {
  beforeEach(() => {
    whatIfProps.mockClear();
    getPlayerWhatIfMock.mockReset();
  });

  it('offers no simulation when there is no prediction', () => {
    render(<DeepDiveDrill playerId="p-1" profileData={{ improvements: [] }} />);
    expect(lastOnSimulate()).toBeUndefined();
  });

  it('offers no simulation when the prediction is not a finite number', () => {
    render(<DeepDiveDrill playerId="p-1" profileData={{ currentPrediction: null }} />);
    expect(lastOnSimulate()).toBeUndefined();
  });

  it('projects from the real prediction when there is one', async () => {
    getPlayerWhatIfMock.mockResolvedValue({
      success: true,
      data: { scenario: { projectedScoringChange: -1.5, projectedRankChange: 2 } },
    });
    render(<DeepDiveDrill playerId="p-1" profileData={{ currentPrediction: 4.2 }} />);
    const simulate = lastOnSimulate();
    expect(simulate).toBeTypeOf('function');
    const result = await simulate!('gir_pct', 1);
    expect(result.projectedScore).toBeCloseTo(2.7);
    expect(result.rankChange).toBe(2);
  });
});
