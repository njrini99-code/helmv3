/**
 * PipelineView — drag-and-drop status write regression tests.
 *
 * Confirms the fix for two confirmed CRM-audit findings:
 *  - Critical: dropping a card back into the stage it's already in (including
 *    a stray reorder among won/lost/nurture cards inside the same "Closed"
 *    column) must NOT write a status — it used to unconditionally write
 *    stage.statuses[0], silently overwriting lost/nurture coaches to 'won'.
 *  - High: dropping (or quick-advancing) into a multi-status stage must never
 *    blindly pick stage.statuses[0] — it must ask which exact status was
 *    intended, and the quick-advance/Space affordance must not appear at all
 *    when the next stage is ambiguous.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineView } from '../PipelineView';
import {
  PIPELINE_STAGES,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  type Coach,
  type CoachStatus,
} from '../../crm-config';

function makeCoach(overrides: Partial<Coach> & { id: string; status: CoachStatus }): Coach {
  return {
    name: 'Coach ' + overrides.id,
    title: null,
    email: null,
    phone: null,
    school: 'Some University',
    conference: 'ACC',
    division: 'D1',
    program: 'mens',
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
    email_status: 'unknown',
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

function statsFor(coaches: Coach[]) {
  const byStatus = {
    new_lead: 0, contacted: 0, engaged: 0, proposal: 0, won: 0, lost: 0, nurture: 0,
  } as Record<CoachStatus, number>;
  coaches.forEach((c) => { byStatus[c.status] += 1; });
  return { total: coaches.length, byStatus, byStage: {} };
}

function renderPipeline(coaches: Coach[], onStatusChange = vi.fn()) {
  render(
    <PipelineView
      coaches={coaches}
      onCoachClick={vi.fn()}
      onStatusChange={onStatusChange}
      onToggleStar={vi.fn()}
      statusConfig={STATUS_CONFIG}
      priorityConfig={PRIORITY_CONFIG}
      pipelineStages={PIPELINE_STAGES}
      stats={statsFor(coaches)}
      onBulkUpdate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  return onStatusChange;
}

function dropOnStage(stageLabel: string, coachId: string) {
  const zone = screen.getByLabelText(new RegExp(`^${stageLabel} column`));
  fireEvent.drop(zone, { dataTransfer: { getData: () => coachId } });
}

describe('PipelineView drag-and-drop status writes', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('does NOT write a status when a card is dropped back into its own stage (same-column reorder)', () => {
    const lostCoach = makeCoach({ id: 'lost-1', status: 'lost' });
    const onStatusChange = renderPipeline([lostCoach]);

    // "Closed" stage covers won/lost/nurture — dropping the already-lost
    // coach back into that column is a stray reorder, not a real move.
    dropOnStage('Closed', 'lost-1');

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('writes directly when the target stage maps to exactly one status', () => {
    const activeCoach = makeCoach({ id: 'active-1', status: 'contacted' });
    const onStatusChange = renderPipeline([activeCoach]);

    // "Closing" stage maps to a single status ('proposal') — unambiguous.
    dropOnStage('Closing', 'active-1');

    expect(onStatusChange).toHaveBeenCalledWith('active-1', 'proposal');
  });

  it('prompts for the exact status instead of defaulting to statuses[0] when the target stage is ambiguous', () => {
    const newCoach = makeCoach({ id: 'new-1', status: 'new_lead' });
    const onStatusChange = renderPipeline([newCoach]);

    // "Closed" stage maps to 3 statuses (won/lost/nurture) — statuses[0] is
    // always 'won'. The bug wrote 'won' unconditionally; the fix must ask.
    dropOnStage('Closed', 'new-1');

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Move to Closed/i })).toBeInTheDocument();

    // Explicitly choose "Lost" — must NOT silently become 'won'.
    fireEvent.click(screen.getByRole('button', { name: STATUS_CONFIG.lost.label }));

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('new-1', 'lost');
  });

  it('hides the quick-advance affordance when the next stage is ambiguous (multi-status)', () => {
    // 'proposal' (Closing) -> next stage is Closed (won/lost/nurture) — ambiguous.
    const proposalCoach = makeCoach({ id: 'proposal-1', status: 'proposal', name: 'Proposal Coach' });
    renderPipeline([proposalCoach]);

    expect(
      screen.queryByRole('button', { name: /Advance Proposal Coach to next stage/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the quick-advance affordance when the next stage is unambiguous (single status)', () => {
    // 'contacted' (Active) -> next stage is Closing ('proposal' only) — unambiguous.
    const contactedCoach = makeCoach({ id: 'contacted-1', status: 'contacted', name: 'Contacted Coach' });
    const onStatusChange = renderPipeline([contactedCoach]);

    const advanceBtn = screen.getByRole('button', { name: /Advance Contacted Coach to next stage/i });
    fireEvent.click(advanceBtn);

    expect(onStatusChange).toHaveBeenCalledWith('contacted-1', 'proposal');
  });
});
