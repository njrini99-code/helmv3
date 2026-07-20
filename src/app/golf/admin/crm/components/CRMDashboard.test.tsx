/**
 * CRMDashboard — regression coverage for confirmed/medium wiring fixes:
 *
 *  1. [high] "Top Conferences" no longer buckets null/empty `conference`
 *     into a blank-labeled row that can outrank real conferences.
 *  2. [medium] "Division Breakdown" (and the Total Coaches KPI detail) now
 *     reflects every division present in the data, not just D2/D3.
 *  3. [medium] The `get_crm_email_stats` RPC error path is no longer
 *     swallowed silently — it's routed through logError.
 *  4. [medium] Follow-up list widgets render a loading skeleton instead of
 *     a misleading "No follow-ups due" / etc. empty state while `loading`
 *     is true.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CRMDashboard } from './CRMDashboard';
import { PIPELINE_STAGES, STATUS_COLORS } from '../crm-config';
import type { Coach, CoachStatus } from '../crm-config';

const logErrorMock = vi.fn();
vi.mock('@/lib/error-logging', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: () => Promise.resolve(rpcResult),
  }),
}));

function makeCoach(overrides: Partial<Coach>): Coach {
  return {
    id: overrides.id ?? Math.random().toString(36),
    name: 'Coach Name',
    title: null,
    email: 'coach@example.com',
    phone: null,
    school: 'Some School',
    conference: 'Big Ten Conference',
    division: 'D2',
    program: 'mens',
    status: 'new_lead',
    priority: 0,
    highlight_color: null,
    is_starred: false,
    notes: null,
    internal_comments: null,
    tags: null,
    team_size: null,
    current_software: null,
    budget_range: null,
    decision_timeline: null,
    pain_points: null,
    best_contact_method: null,
    best_contact_time: null,
    timezone: null,
    last_contacted_at: null,
    next_follow_up_at: null,
    email_status: 'valid',
    source: null,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    athletics_url: null,
    role_level: null,
    is_primary_contact: false,
    ...overrides,
  };
}

function buildStats(coaches: Coach[]) {
  const byStatus = coaches.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<CoachStatus, number>);
  return {
    total: coaches.length,
    byStatus,
    byStage: {},
    starred: 0,
    hot: 0,
    followUpsDue: 0,
    contacted: 0,
    inPipeline: 0,
  };
}

const noop = () => {};
const noopAsync = async () => {};

describe('CRMDashboard', () => {
  beforeEach(() => {
    logErrorMock.mockClear();
    rpcResult = { data: null, error: null };
  });

  it('excludes coaches with a null/empty conference from Top Conferences', () => {
    const coaches = [
      makeCoach({ id: '1', conference: '' }),
      makeCoach({ id: '2', conference: '' }),
      makeCoach({ id: '3', conference: '' }),
      makeCoach({ id: '4', conference: 'Big Ten Conference' }),
    ];
    render(
      <CRMDashboard
        allCoaches={coaches}
        stats={buildStats(coaches)}
        pipelineStages={PIPELINE_STAGES}
        statusConfig={STATUS_COLORS as never}
        onBulkUpdate={noopAsync}
        onRefresh={noop}
        onNavigate={noop}
      />
    );

    expect(screen.getByText('Big Ten Conference')).toBeInTheDocument();
    // "1 shown" confirms the blank-conference bucket never made it into the list.
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  it('shows every division present in the data, not just D2/D3', () => {
    const coaches = [
      makeCoach({ id: '1', division: 'D1' }),
      makeCoach({ id: '2', division: 'D1' }),
      makeCoach({ id: '3', division: 'D2' }),
      makeCoach({ id: '4', division: 'NAIA' }),
    ];
    render(
      <CRMDashboard
        allCoaches={coaches}
        stats={buildStats(coaches)}
        pipelineStages={PIPELINE_STAGES}
        statusConfig={STATUS_COLORS as never}
        onBulkUpdate={noopAsync}
        onRefresh={noop}
        onNavigate={noop}
      />
    );

    // D1 is the largest bucket (2 coaches) and must appear even though the
    // old implementation only ever computed D2/D3.
    expect(screen.getAllByText('D1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NAIA').length).toBeGreaterThan(0);
  });

  it('logs a failed get_crm_email_stats RPC instead of swallowing it', async () => {
    rpcResult = { data: null, error: { message: 'Forbidden' } };
    const coaches = [makeCoach({ id: '1' })];
    render(
      <CRMDashboard
        allCoaches={coaches}
        stats={buildStats(coaches)}
        pipelineStages={PIPELINE_STAGES}
        statusConfig={STATUS_COLORS as never}
        onBulkUpdate={noopAsync}
        onRefresh={noop}
        onNavigate={noop}
      />
    );

    await vi.waitFor(() => {
      expect(logErrorMock).toHaveBeenCalled();
    });
    expect(logErrorMock.mock.calls[0]?.[1]).toMatchObject({ component: 'CRMDashboard' });
  });

  it('renders a loading skeleton instead of misleading empty states while loading', () => {
    render(
      <CRMDashboard
        allCoaches={[]}
        loading
        stats={buildStats([])}
        pipelineStages={PIPELINE_STAGES}
        statusConfig={STATUS_COLORS as never}
        onBulkUpdate={noopAsync}
        onRefresh={noop}
        onNavigate={noop}
      />
    );

    expect(screen.queryByText('No follow-ups due')).not.toBeInTheDocument();
    expect(screen.queryByText('No stale leads')).not.toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });
});
