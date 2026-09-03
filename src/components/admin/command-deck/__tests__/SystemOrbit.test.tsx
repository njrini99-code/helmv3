import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemOrbit } from '../SystemOrbit';
import { buildSystemOrbit } from '@/lib/admin/command-deck/orbit';
import type { DeployFreshness } from '@/lib/admin/deploy-freshness';
import { freshnessRows } from '@/lib/admin/command-deck/__tests__/fixtures';

const NOW = Date.parse('2026-09-03T12:00:00.000Z');

function currentDeploy(): DeployFreshness {
  return { state: 'current', summary: 'up to date', red: null, ageHours: 2 };
}

describe('SystemOrbit', () => {
  it('renders all 8 node labels, including Realtime honestly marked Unknown', () => {
    const snapshot = buildSystemOrbit({
      incidents: [],
      freshness: freshnessRows(),
      deployFreshness: currentDeploy(),
      activeUsersToday: 10,
      selfHealFlowing: false,
      selfHealStalled: false,
      selfHealReadable: true,
      now: NOW,
    });
    render(<SystemOrbit snapshot={snapshot} />);
    for (const label of ['Users', 'Next / Vercel', 'Auth', 'Supabase', 'AI', 'Postgres', 'Jobs', 'Realtime']) {
      // Each label renders twice — once in the desktop SVG, once in the
      // mobile node list — so assert presence, not a single unique match.
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('the SVG carries an accessible label naming every node and its state', () => {
    const snapshot = buildSystemOrbit({
      incidents: [],
      freshness: freshnessRows(),
      deployFreshness: currentDeploy(),
      activeUsersToday: 10,
      selfHealFlowing: false,
      selfHealStalled: false,
      selfHealReadable: true,
      now: NOW,
    });
    render(<SystemOrbit snapshot={snapshot} />);
    const img = screen.getByRole('img', { name: /Helm System Orbit/ });
    expect(img.getAttribute('aria-label')).toContain('Realtime Unknown');
  });
});
