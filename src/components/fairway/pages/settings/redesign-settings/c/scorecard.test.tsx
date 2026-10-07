import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Scorecard } from './scorecard';
import {
  ALERT_COLUMN_DEFAULTS,
  APPEARANCE_DEFAULTS,
  buildSetupCard,
  LOADING,
  type Loadable,
  type SetupCardInput,
} from './setup-card-model';

const ready = <T,>(data: T): Loadable<T> => ({ status: 'ready', data });

function coach(overrides: Partial<SetupCardInput> = {}): SetupCardInput {
  return {
    role: 'coach',
    name: 'Pat Coach',
    email: 'pat@example.edu',
    isNative: false,
    hasTeam: true,
    hasCoachId: true,
    hasPlayerId: false,
    appearance: { ...APPEARANCE_DEFAULTS },
    distanceUnits: 'yards',
    hapticsEnabled: true,
    notifications: ready({ email_messages: true, push_messages: true, push_events: true, quiet_mode: false }),
    // The live shape for 14 of 14 coaches with a row: digest off, all else default.
    philosophy: ready({ ...ALERT_COLUMN_DEFAULTS, alert_sensitivity: 'balanced', email_digest_enabled: false }),
    teamSettings: ready(null),
    team: ready({ name: "Men's Golf", join_code: 'HX7Q2K' }),
    coachHelm: ready(null),
    ...overrides,
  };
}

describe('Scorecard', () => {
  it('numbers rows across both nines and states each value and mark in words', () => {
    render(<Scorecard nines={buildSetupCard(coach())} onOpenRow={() => {}} />);

    expect(screen.getByRole('button', { name: '1. Name & photo, Pat Coach' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3. Password, hidden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4. Appearance, System, default' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '6. Notifications, Email 5/6, Push 5/5, changed from default' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7. Scoring & format, Stroke play, default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10. Invite code, HX7Q2K' })).toBeInTheDocument();

    const alerts = screen.getByRole('link', {
      name: '12. CoachHelm alerts, Balanced, 7/10 on, default, opens Coaching Intelligence',
    });
    expect(alerts).toHaveAttribute('href', '/golf/dashboard/settings/coaching-intelligence');
  });

  it('subtotals each nine and totals the card', () => {
    render(<Scorecard nines={buildSetupCard(coach())} onOpenRow={() => {}} />);
    const out = screen.getByRole('region', { name: 'Out: You' });
    expect(within(out).getByText('1 of 3 changed')).toBeInTheDocument();
    const back = screen.getByRole('region', { name: 'In: Team & CoachHelm' });
    expect(within(back).getByText('0 of 4 changed')).toBeInTheDocument();
    expect(screen.getByText(/of 7 changed from defaults/)).toHaveTextContent('Total: 1 of 7 changed from defaults');
  });

  it('opens the tapped row', () => {
    const onOpenRow = vi.fn();
    render(<Scorecard nines={buildSetupCard(coach())} onOpenRow={onOpenRow} />);
    fireEvent.click(screen.getByRole('button', { name: /^8\. Event reminders/ }));
    expect(onOpenRow).toHaveBeenCalledWith('reminders');
  });

  it('holds the total until every counted row has loaded', () => {
    render(<Scorecard nines={buildSetupCard(coach({ teamSettings: LOADING }))} onOpenRow={() => {}} />);
    expect(screen.queryByText(/of \d+ changed from defaults/)).toBeNull();
    expect(screen.getByText('Counting settings changed from defaults')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7. Scoring & format, loading' })).toBeInTheDocument();
  });

  it('leaves unreadable rows out of the total and says so', () => {
    render(<Scorecard nines={buildSetupCard(coach({ philosophy: { status: 'error' } }))} onOpenRow={() => {}} />);
    expect(screen.getByText(/of 5 changed from defaults/)).toBeInTheDocument();
    expect(screen.getByText('2 not counted: couldn’t load')).toBeInTheDocument();
  });
});
