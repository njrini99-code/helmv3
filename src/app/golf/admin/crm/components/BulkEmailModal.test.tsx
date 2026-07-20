/**
 * BulkEmailModal — send-path suppression safety.
 *
 * Regression coverage: the Gmail-BCC bulk path built its BCC list straight
 * from the selected coaches with no email_status or crm_email_suppressions
 * gate, so an unsubscribed/bounced/complained coach could be BCC'd (CAN-SPAM
 * exposure). `coachesWithEmail` — the array both the BCC list and the Helm
 * recipient count are built from — must exclude a coach whose email_status
 * is suppressed (isSuppressedEmailStatus) OR whose address is on the
 * crm_email_suppressions do-not-contact list (getSuppressions), and the
 * modal must show the operator how many were excluded and why. The send
 * buttons must also stay disabled until that list has loaded at least once,
 * so a fast click can't race ahead of the suppression check.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import type { Coach } from '../crm-config';
import type { EmailSuppression } from '../types/foundations';

const getSuppressionsMock = vi.fn<(emails?: string[]) => Promise<EmailSuppression[]>>(
  async () => [],
);

vi.mock('@/app/golf/actions/crm-foundations', () => ({
  getSuppressions: (...args: [string[]?]) => getSuppressionsMock(...args),
}));

// BulkEmailModal renders TemplatePicker (mode defaults to 'helm'), which fetches
// templates via a direct supabase-client call on mount. Stub the chain it uses
// (`.from().select().order().order()`) so that fetch resolves to an empty list
// instead of throwing in this environment.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { BulkEmailModal } from './BulkEmailModal';

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
    is_primary_contact: true,
    ...overrides,
  };
}

function makeSuppression(overrides: Partial<EmailSuppression> = {}): EmailSuppression {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    email: 'bounced@example.edu',
    reason: 'hard_bounce',
    source: 'resend_webhook',
    metadata: {},
    suppressed_at: new Date().toISOString(),
    suppressed_by: null,
    ...overrides,
  };
}

const noop = () => {};

afterEach(() => {
  vi.clearAllMocks();
  getSuppressionsMock.mockResolvedValue([]);
});

describe('BulkEmailModal recipient suppression gate', () => {
  it('excludes a coach whose email_status is suppressed from the recipient count and BCC list, and shows an excluded count', async () => {
    const validCoach = makeCoach({ id: 'c-valid', email: 'valid@example.edu', email_status: 'valid' });
    const bouncedCoach = makeCoach({ id: 'c-bounced', name: 'Bounced Coach', email: 'bounced@example.edu', email_status: 'bounced' });

    render(<BulkEmailModal coaches={[validCoach, bouncedCoach]} onClose={noop} onSuccess={noop} />);

    await waitFor(() => expect(getSuppressionsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('1 recipient selected')).toBeTruthy());
    expect(screen.getByText(/1 excluded — unsubscribed\/bounced/)).toBeTruthy();
    expect(screen.getByText(/1 coach excluded \(unsubscribed\/bounced\): Bounced Coach/)).toBeTruthy();
    // The excluded coach must never appear in the recipient chip list.
    expect(screen.queryByText('Bounced Coach')).toBeNull();
  });

  it('excludes a coach on the crm_email_suppressions do-not-contact list even when email_status is valid', async () => {
    const validCoach = makeCoach({ id: 'c-valid', email: 'valid@example.edu', email_status: 'valid' });
    const suppressedCoach = makeCoach({
      id: 'c-suppressed',
      name: 'Suppressed Coach',
      email: 'suppressed@example.edu',
      email_status: 'valid', // NOT reflected on the coach row — only the suppression table knows
    });
    getSuppressionsMock.mockResolvedValueOnce([
      makeSuppression({ email: 'suppressed@example.edu', reason: 'unsubscribed' }),
    ]);

    render(<BulkEmailModal coaches={[validCoach, suppressedCoach]} onClose={noop} onSuccess={noop} />);

    await waitFor(() =>
      expect(getSuppressionsMock).toHaveBeenCalledWith(
        expect.arrayContaining(['valid@example.edu', 'suppressed@example.edu']),
      ),
    );
    await waitFor(() => expect(screen.getByText('1 recipient selected')).toBeTruthy());
    expect(screen.getByText(/1 excluded — unsubscribed\/bounced/)).toBeTruthy();
    expect(screen.queryByText('Suppressed Coach')).toBeNull();
  });

  it('keeps the send button disabled (and labeled) while the suppression list is loading, then enables it once loaded', async () => {
    let resolveSuppressions: (rows: EmailSuppression[]) => void = () => {};
    const pending = new Promise<EmailSuppression[]>((resolve) => {
      resolveSuppressions = resolve;
    });
    getSuppressionsMock.mockReturnValueOnce(pending);

    const coach = makeCoach({ id: 'c-1', email: 'a@example.edu', email_status: 'valid' });
    render(<BulkEmailModal coaches={[coach]} onClose={noop} onSuccess={noop} />);

    expect(screen.getByRole('button', { name: /checking suppressions/i })).toBeDisabled();

    resolveSuppressions([]);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send to 1 coach/i })).not.toBeDisabled(),
    );
  });

  it('does not exclude a coach with no suppression signal at all', async () => {
    const coach = makeCoach({ id: 'c-clean', email: 'clean@example.edu', email_status: 'valid' });
    render(<BulkEmailModal coaches={[coach]} onClose={noop} onSuccess={noop} />);

    await waitFor(() => expect(screen.getByText('1 recipient selected')).toBeTruthy());
    expect(screen.queryByText(/excluded — unsubscribed\/bounced/)).toBeNull();
  });
});
