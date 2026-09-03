import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureConstellationGrid } from '@/components/admin/triage/FeatureConstellationGrid';
import type { ConstellationNode } from '@/lib/admin/triage/feature-constellation';

function node(overrides: Partial<ConstellationNode> = {}): ConstellationNode {
  return {
    key: 'round_tracking' as ConstellationNode['key'],
    label: 'Round Tracking',
    app: 'golfhelm',
    status: 'green',
    trend: 'flat',
    signalVolume: 12,
    activeIncidentSignatures: 1,
    ...overrides,
  };
}

describe('FeatureConstellationGrid', () => {
  it('renders one card per node with its posture', () => {
    render(<FeatureConstellationGrid view={{ nodes: [node()], edges: [], edgeSource: 'none' }} selectedKey={null} />);
    expect(screen.getByText('Round Tracking')).toBeInTheDocument();
    expect(screen.getByText('green')).toBeInTheDocument();
  });

  it('renders an honest empty state, never a blank grid', () => {
    render(<FeatureConstellationGrid view={{ nodes: [], edges: [], edgeSource: 'none' }} selectedKey={null} />);
    expect(screen.getByText(/No feature health data available/i)).toBeInTheDocument();
  });

  it('shows a shared-table relationship line only for nodes that have one', () => {
    render(
      <FeatureConstellationGrid
        view={{
          nodes: [node({ key: 'round_tracking' as ConstellationNode['key'] }), node({ key: 'stats' as ConstellationNode['key'], label: 'Stats' })],
          edges: [{ source: 'round_tracking' as never, target: 'stats' as never, sharedTable: 'golf_rounds' }],
          edgeSource: 'shared-table',
        }}
        selectedKey={null}
      />,
    );
    expect(screen.getAllByText(/shares golf_rounds with/i)).toHaveLength(2);
  });

  it('never fabricates an edge note when edgeSource is none', () => {
    render(<FeatureConstellationGrid view={{ nodes: [node()], edges: [], edgeSource: 'none' }} selectedKey={null} />);
    expect(screen.getByText(/No feature currently shares/i)).toBeInTheDocument();
  });

  it('zero-signal-volume features render their volume as 0, not omitted', () => {
    render(
      <FeatureConstellationGrid
        view={{ nodes: [node({ signalVolume: 0 })], edges: [], edgeSource: 'none' }}
        selectedKey={null}
      />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
