/**
 * ConferenceGroupView — regression tests for three confirmed wiring defects:
 *
 * 1. Coaches with a null/blank `conference` used to group under the raw ''
 *    key and render a blank <h3> — often the single largest, first-rendered
 *    group on the tab. They must now land in a labeled "No Conference"
 *    bucket instead.
 * 2. The header's division breakdown used to hardcode D2/D3 only, so a
 *    conference made up entirely of D1, NAIA, JUCO-variant, or CCCAA
 *    programs showed zero division chips. It must now tally and render
 *    every division value present.
 * 3. A failed coach fetch (error=true) must render a distinct "failed to
 *    load" empty state instead of the generic "no results" copy used for a
 *    legitimately-filtered empty search.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConferenceGroupView } from '../ConferenceGroupView';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../../crm-config';
import type { Coach } from '../../crm-config';

function makeCoach(overrides: Partial<Coach>): Coach {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    name: 'Test Coach',
    title: null,
    email: null,
    phone: null,
    school: 'Test School',
    conference: '',
    division: 'D3',
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
    email_status: 'unknown',
    source: null,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    athletics_url: null,
    role_level: null,
    is_primary_contact: false,
    ...overrides,
  };
}

const noop = () => {};

describe('ConferenceGroupView', () => {
  it('groups blank/null conference coaches under a labeled "No Conference" bucket, not a blank header', () => {
    const coaches = [
      makeCoach({ id: '1', conference: '', name: 'Blank Conference Coach' }),
      makeCoach({ id: '2', conference: '   ', name: 'Whitespace Conference Coach' }),
      makeCoach({ id: '3', conference: 'Big Ten Conference', name: 'Real Conference Coach' }),
    ];

    render(
      <ConferenceGroupView
        coaches={coaches}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={noop}
        onCoachClick={noop}
        onStatusChange={noop}
        onToggleStar={noop}
        onLogContact={noop}
        statusConfig={STATUS_CONFIG}
        priorityConfig={PRIORITY_CONFIG}
      />
    );

    // The labeled bucket exists and holds both blank/whitespace coaches.
    expect(screen.getByText('No Conference')).toBeInTheDocument();
    const noConferenceGroup = screen.getByText('No Conference').closest('div[class*="glass-standard"]');
    expect(noConferenceGroup).not.toBeNull();
    expect(noConferenceGroup).toHaveTextContent('2');

    // No group renders with an empty header title.
    const headers = screen.getAllByRole('heading', { level: 3 });
    for (const h of headers) {
      expect(h.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('tallies and renders division chips for non-D2/D3 divisions (e.g. D1-only conferences)', () => {
    const coaches = [
      makeCoach({ id: '1', conference: 'Big Ten Conference', division: 'D1' }),
      makeCoach({ id: '2', conference: 'Big Ten Conference', division: 'D1' }),
      makeCoach({ id: '3', conference: 'Big Ten Conference', division: 'NAIA' }),
    ];

    render(
      <ConferenceGroupView
        coaches={coaches}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={noop}
        onCoachClick={noop}
        onStatusChange={noop}
        onToggleStar={noop}
        onLogContact={noop}
        statusConfig={STATUS_CONFIG}
        priorityConfig={PRIORITY_CONFIG}
      />
    );

    // Previously this conference (all D1/NAIA, no D2/D3) rendered zero
    // division chips. Now it must show both.
    expect(screen.getByText('D1: 2')).toBeInTheDocument();
    expect(screen.getByText('NAIA: 1')).toBeInTheDocument();
  });

  it('shows a distinct failed-to-load message when error=true, not the generic "no results" copy', () => {
    render(
      <ConferenceGroupView
        coaches={[]}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={noop}
        onCoachClick={noop}
        onStatusChange={noop}
        onToggleStar={noop}
        onLogContact={noop}
        statusConfig={STATUS_CONFIG}
        priorityConfig={PRIORITY_CONFIG}
        error
      />
    );

    expect(screen.getByText('Failed to load coaches')).toBeInTheDocument();
    expect(screen.queryByText('No coaches found')).not.toBeInTheDocument();
  });

  it('shows the generic "no results" copy when coaches is empty without an error', () => {
    render(
      <ConferenceGroupView
        coaches={[]}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={noop}
        onCoachClick={noop}
        onStatusChange={noop}
        onToggleStar={noop}
        onLogContact={noop}
        statusConfig={STATUS_CONFIG}
        priorityConfig={PRIORITY_CONFIG}
      />
    );

    expect(screen.getByText('No coaches found')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load coaches')).not.toBeInTheDocument();
  });
});
