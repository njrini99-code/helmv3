/**
 * PipelineColumn — render-cap regression tests.
 *
 * Confirms the fix for a confirmed CRM-audit finding: columns rendered EVERY
 * coach with a mounted dnd useDraggable each (new_lead ~= 2,000 coaches =
 * jank). The column must cap the initial render to the first 60 (by the
 * column's existing/incoming order) behind a "Show 60 more (N remaining)"
 * button, while the header count keeps reading off the FULL column set.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { PipelineColumn } from '../PipelineColumn';
import type { Coach, CoachStatus, Division, ProgramType } from '../../../crm-config';

function makeCoach(id: string): Coach {
  return {
    id,
    name: `Coach ${id}`,
    title: null,
    email: null,
    phone: null,
    school: `School ${id}`,
    conference: 'ACC',
    division: 'D1' as Division,
    program: 'mens' as ProgramType,
    status: 'new_lead' as CoachStatus,
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
  };
}

function makeCoaches(count: number): Coach[] {
  // Zero-padded ids so string order === numeric order, matching how
  // "the column's existing order" is asserted below.
  return Array.from({ length: count }, (_, i) => makeCoach(String(i).padStart(4, '0')));
}

function renderColumn(coaches: Coach[]) {
  return render(
    <PipelineColumn
      status="new_lead"
      label="New Lead"
      headerBg="bg-warm-100/80"
      headerText="text-warm-700"
      countBg="bg-warm-200/80"
      countText="text-warm-700"
      coaches={coaches}
      engagementMap={{}}
    />,
  );
}

/**
 * Timeout raised from the 5s default because these tests are legitimately
 * heavy, not because anything here is slow by mistake: each one mounts 60+
 * rows that each carry a dnd `useDraggable`, and the expand case mounts them
 * twice. Unloaded that case takes ~870ms — comfortably inside 5s — but a full
 * `vitest run` executes this file in four projects at once against 800+ other
 * files, and under that contention it intermittently crossed the line and
 * failed the whole suite. The tests assert render behaviour, never speed, so
 * a wall-clock budget is the wrong thing for them to fail on.
 */
describe('PipelineColumn render cap', { timeout: 30_000 }, () => {
  it('renders only the first 60 coaches (by incoming order) when the column has more', () => {
    const coaches = makeCoaches(65);
    renderColumn(coaches);

    // First 60 (Coach 0000..0059) are mounted; the rest are not.
    expect(screen.getByText('Coach 0000')).toBeInTheDocument();
    expect(screen.getByText('Coach 0059')).toBeInTheDocument();
    expect(screen.queryByText('Coach 0060')).not.toBeInTheDocument();
    expect(screen.queryByText('Coach 0064')).not.toBeInTheDocument();
  });

  it('shows a "Show 60 more (N remaining)" button reflecting the true remaining count', () => {
    const coaches = makeCoaches(65);
    renderColumn(coaches);

    expect(screen.getByRole('button', { name: 'Show 60 more (5 remaining)' })).toBeInTheDocument();
  });

  it('reveals the rest on click, in order, and removes the button once fully expanded', () => {
    const coaches = makeCoaches(65);
    renderColumn(coaches);

    fireEvent.click(screen.getByRole('button', { name: 'Show 60 more (5 remaining)' }));

    expect(screen.getByText('Coach 0060')).toBeInTheDocument();
    expect(screen.getByText('Coach 0064')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show 60 more/i })).not.toBeInTheDocument();
  });

  it('does not cap or show the button when the column has 60 or fewer coaches', () => {
    const coaches = makeCoaches(40);
    renderColumn(coaches);

    expect(screen.getByText('Coach 0039')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show 60 more/i })).not.toBeInTheDocument();
  });

  it('keeps the header count reading off the FULL column set, not the capped render', () => {
    const coaches = makeCoaches(65);
    const { container } = renderColumn(coaches);

    const header = container.querySelector('h3')!.closest('div')!.parentElement!;
    expect(within(header).getByText('65')).toBeInTheDocument();
  });
});
