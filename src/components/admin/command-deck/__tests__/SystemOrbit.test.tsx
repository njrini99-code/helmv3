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

  it('the SVG is a labeled group (not role="img") naming every node and its state, since it holds real focusable links', () => {
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
    // role="img" would assert every descendant is flattened, non-interactive
    // content, which is false here (each linked node is a real `<a>`) — so
    // this must resolve as an accessible GROUP, not an image.
    const group = screen.getByRole('group', { name: /Helm System Orbit/ });
    expect(group.tagName.toLowerCase()).toBe('svg');
    expect(screen.queryByRole('img', { name: /Helm System Orbit/ })).toBeNull();
    expect(screen.getByText(/Realtime Unknown/, { selector: 'title' })).toBeInTheDocument();
  });
});
