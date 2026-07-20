import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TodayQueue } from './TodayQueue';
import type { Coach } from '../crm-config';

function makeCoach(overrides: Partial<Coach> = {}): Coach {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    name: 'Jamie Coach',
    title: 'Head Coach',
    email: 'jamie@example.edu',
    phone: null,
    school: 'Example State',
    conference: 'Old Dominion',
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
    email_status: 'valid',
    source: null,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    athletics_url: null,
    role_level: 'head_coach',
    is_primary_contact: false,
    ...overrides,
  };
}

const noop = () => {};

describe('TodayQueue eligibility filter', () => {
  it('includes a new_lead coach with a valid (or unset) email_status', () => {
    const coach = makeCoach({ school: 'Valid State', email_status: 'valid' });
    render(
      <TodayQueue
        coaches={[coach]}
        onCoachClick={noop}
        onOpenInGmail={noop}
        onLogTouch={noop}
        manualTemplateArmed={false}
      />,
    );
    expect(screen.getByText('Jamie Coach')).toBeTruthy();
  });

  it('excludes a coach whose email_status is bounced', () => {
    const coach = makeCoach({ school: 'Bounced State', email_status: 'bounced' });
    render(
      <TodayQueue
        coaches={[coach]}
        onCoachClick={noop}
        onOpenInGmail={noop}
        onLogTouch={noop}
        manualTemplateArmed={false}
      />,
    );
    expect(screen.queryByText('Jamie Coach')).toBeNull();
    expect(screen.getByText('All caught up')).toBeTruthy();
  });

  it('excludes a coach whose email_status is complained', () => {
    const coach = makeCoach({ school: 'Complained State', email_status: 'complained' });
    render(
      <TodayQueue
        coaches={[coach]}
        onCoachClick={noop}
        onOpenInGmail={noop}
        onLogTouch={noop}
        manualTemplateArmed={false}
      />,
    );
    expect(screen.queryByText('Jamie Coach')).toBeNull();
  });

  it('excludes a coach whose email_status is unsubscribed', () => {
    const coach = makeCoach({ school: 'Unsub State', email_status: 'unsubscribed' });
    render(
      <TodayQueue
        coaches={[coach]}
        onCoachClick={noop}
        onOpenInGmail={noop}
        onLogTouch={noop}
        manualTemplateArmed={false}
      />,
    );
    expect(screen.queryByText('Jamie Coach')).toBeNull();
  });
});

describe('TodayQueue loading state', () => {
  it('renders a loading skeleton instead of "All caught up" when loading and coaches is empty', () => {
    render(
      <TodayQueue
        coaches={[]}
        onCoachClick={noop}
        onOpenInGmail={noop}
        onLogTouch={noop}
        manualTemplateArmed={false}
        loading
      />,
    );
    expect(screen.queryByText('All caught up')).toBeNull();
  });

  it('renders "All caught up" when not loading and coaches is empty', () => {
    render(
      <TodayQueue
        coaches={[]}
        onCoachClick={noop}
        onOpenInGmail={noop}
        onLogTouch={noop}
        manualTemplateArmed={false}
      />,
    );
    expect(screen.getByText('All caught up')).toBeTruthy();
  });
});
