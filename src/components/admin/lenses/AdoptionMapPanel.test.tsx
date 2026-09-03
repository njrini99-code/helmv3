// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdoptionMapPanel } from './AdoptionMapPanel';
import type { AdoptionMapLens } from '@/lib/admin/lenses/adoption-map';

function lens(overrides: Partial<AdoptionMapLens> = {}): AdoptionMapLens {
  return {
    generatedAt: '2026-09-03T00:00:00Z',
    byTeam: [],
    byRole: [],
    featureSignals: [],
    roleCoverageNote: null,
    degradedNote: null,
    ...overrides,
  };
}

describe('AdoptionMapPanel', () => {
  it('renders an honest empty state for an empty team/role breakdown', () => {
    render(<AdoptionMapPanel lens={lens()} />);
    expect(screen.getAllByText('No adopting users in this group yet.')).toHaveLength(2);
  });

  it('renders a feature signal tied to reliability with its delta and dropout flag', () => {
    render(
      <AdoptionMapPanel
        lens={lens({
          featureSignals: [{ key: 'calendar_events', label: 'Calendar', uniqueUsers30d: 78, delta7dPct: -18, dropoutRisk: true }],
        })}
      />,
    );
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('-18%')).toBeInTheDocument();
    expect(screen.getByText('dropout risk')).toBeInTheDocument();
  });

  it('renders the role-coverage disclosure note when the directory read was capped', () => {
    render(<AdoptionMapPanel lens={lens({ roleCoverageNote: 'Role lookup covers 500 of 812 users.' })} />);
    expect(screen.getByText(/500 of 812/)).toBeInTheDocument();
  });
});
