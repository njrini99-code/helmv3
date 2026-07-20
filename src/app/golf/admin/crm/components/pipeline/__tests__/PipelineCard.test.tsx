/**
 * PipelineCard — priority-signal regression tests.
 *
 * Confirms the fix for a confirmed CRM-audit finding: the absolutely-
 * positioned colored left-edge "priority accent stripe" is the banned
 * accent-stripe pattern. It must be replaced with the small priority-dot
 * idiom used on CoachTable rows (a `w-1.5 h-1.5 rounded-full` dot), while
 * still signalling High (amber) vs Hot (orange) priority.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineCard } from '../PipelineCard';
import type { Coach, Division, ProgramType, CoachStatus } from '../../../crm-config';

function makeCoach(overrides: Partial<Coach> = {}): Coach {
  return {
    id: 'coach-1',
    name: 'Coach One',
    title: null,
    email: null,
    phone: null,
    school: 'Some University',
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
    ...overrides,
  };
}

describe('PipelineCard priority signal', () => {
  it('does not render the banned absolutely-positioned left-edge accent stripe', () => {
    const { container } = render(<PipelineCard coach={makeCoach({ priority: 2 })} />);

    // The old stripe was `absolute inset-y-0 left-0 w-[3px]`. Assert no
    // element still carries that shape, regardless of priority level.
    const stripe = container.querySelector('.absolute.inset-y-0.left-0');
    expect(stripe).not.toBeInTheDocument();
  });

  it('renders no priority dot at Normal priority (0)', () => {
    const { container } = render(<PipelineCard coach={makeCoach({ priority: 0 })} />);
    expect(container.querySelector('.rounded-full.bg-amber-500, .rounded-full.bg-orange-500')).toBeNull();
  });

  it('renders an amber dot for High priority (1)', () => {
    render(<PipelineCard coach={makeCoach({ priority: 1 })} />);
    expect(screen.getByLabelText('High priority')).toBeInTheDocument();
  });

  it('renders an orange dot for Hot priority (2)', () => {
    render(<PipelineCard coach={makeCoach({ priority: 2 })} />);
    expect(screen.getByLabelText('Hot priority')).toBeInTheDocument();
  });
});
