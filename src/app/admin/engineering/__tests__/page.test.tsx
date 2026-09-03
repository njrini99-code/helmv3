import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));

vi.mock('@/lib/admin/engineering/decision-inbox', () => ({
  fetchDecisionInbox: vi.fn(async () => ({
    status: 'unconfigured',
    data: null,
    fetchedAt: null,
    error: 'Decision Inbox sources not readable',
  })),
}));

vi.mock('@/lib/admin/agent-runs/fetch', () => ({
  fetchAgentRuns: vi.fn(async () => ({
    status: 'unconfigured',
    data: null,
    fetchedAt: null,
    error: 'Agent Flight Recorder (helm_debug.agent_runs migration not yet applied)',
  })),
}));

vi.mock('@/lib/admin/engineering/charter', () => ({
  fetchMutationGateCharter: vi.fn(async () => ({ status: 'ok', data: { floor: 40, scope: 'src/**', provisional: true, evidenceCommand: 'node scripts/mutation-gate.mjs' }, fetchedAt: '2026-09-03T00:00:00Z' })),
  fetchContractsCharter: vi.fn(async () => ({ status: 'ok', data: [], fetchedAt: '2026-09-03T00:00:00Z' })),
  fetchJanitorCharter: vi.fn(async () => ({ status: 'unconfigured', data: null, fetchedAt: null, error: 'not generated' })),
}));

vi.mock('@/lib/admin/engineering/blast-radius', () => ({
  fetchBlastRadius: vi.fn(async () => ({ status: 'unconfigured', data: null, fetchedAt: null, error: 'World Model not on main' })),
  formatCausalConfidenceLadder: vi.fn(() => ['NEW AFTER RELEASE · release 8e4c5b7d · confidence 86%', '+ began 4m after deploy']),
}));

vi.mock('@/lib/admin/engineering/work-log', () => ({
  fetchRepairQuality: vi.fn(async () => ({
    status: 'unconfigured',
    data: null,
    fetchedAt: null,
    error: 'GitHub PR feed not configured',
  })),
}));

import EngineeringOsPage from '@/app/admin/engineering/page';

/**
 * The panel bodies (`DecisionInboxBody`, `AgentFlightRecorderBody`, …) are
 * async Server Components — under `@testing-library/react`'s client
 * reconciler they stay suspended (their `PanelBoundary` skeleton renders
 * instead of the resolved content), so this test pins the SHELL the page
 * itself renders synchronously: the h1, every section's h2 label, and the
 * fact that the async data-fetching functions are actually invoked with the
 * right arguments (an `async function` component's body runs up to its
 * first `await` even when the render suspends). It does not assert on
 * resolved panel content — see `src/app/admin/baseball/__tests__/page.test.tsx`
 * for the same established shell-only pattern this repo already uses for a
 * page built the same way.
 */
describe('EngineeringOsPage', () => {
  it('renders the page heading, every section label, and does not nest a second <main> landmark', async () => {
    const element = await EngineeringOsPage({ searchParams: Promise.resolve({}) });
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: /engineering os/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /decision inbox — engineering os/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /agent flight recorder/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /charter & verifier visibility/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /blast radius & causal confidence/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /repair quality/i })).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('honors the ?entity= search param for the blast radius panel default', async () => {
    const { fetchBlastRadius } = await import('@/lib/admin/engineering/blast-radius');
    const element = await EngineeringOsPage({ searchParams: Promise.resolve({ entity: 'golf_round_lifecycle' }) });
    render(element);
    expect(fetchBlastRadius).toHaveBeenCalledWith('golf_round_lifecycle');
  });

  it('defaults the blast radius entity to admin_platform when no search param is given', async () => {
    const { fetchBlastRadius } = await import('@/lib/admin/engineering/blast-radius');
    const element = await EngineeringOsPage({ searchParams: Promise.resolve({}) });
    render(element);
    expect(fetchBlastRadius).toHaveBeenCalledWith('admin_platform');
  });
});
