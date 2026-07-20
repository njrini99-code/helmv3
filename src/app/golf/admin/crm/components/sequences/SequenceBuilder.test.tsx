/**
 * SequenceBuilder — enrollment pause/stop controls.
 *
 * Regression coverage for the wiring defect where pauseEnrollment()/
 * stopEnrollment() existed as fully-working server actions with zero UI
 * call sites: the fetched `enrollments` list was only used to derive a
 * count fallback, never rendered as rows. This verifies the enrollment
 * list now renders per-coach rows and that Pause/Stop actually invoke the
 * server actions, and that a completed/stopped enrollment offers neither.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CrmSequenceEnrollment } from '@/app/golf/actions/crm-sequences';

const getSequence = vi.fn();
const listEnrollments = vi.fn();
const getSequenceEnrollmentCounts = vi.fn();
const getSequencePerformance = vi.fn();
const pauseEnrollment = vi.fn();
const resumeEnrollment = vi.fn();
const stopEnrollment = vi.fn();

vi.mock('@/app/golf/actions/crm-sequences', () => ({
  getSequence: (...args: unknown[]) => getSequence(...args),
  listEnrollments: (...args: unknown[]) => listEnrollments(...args),
  getSequenceEnrollmentCounts: (...args: unknown[]) =>
    getSequenceEnrollmentCounts(...args),
  getSequencePerformance: (...args: unknown[]) => getSequencePerformance(...args),
  pauseEnrollment: (...args: unknown[]) => pauseEnrollment(...args),
  resumeEnrollment: (...args: unknown[]) => resumeEnrollment(...args),
  stopEnrollment: (...args: unknown[]) => stopEnrollment(...args),
  upsertSequenceStep: vi.fn(),
  deleteSequenceStep: vi.fn(),
  enrollSegmentInSequence: vi.fn(),
}));

vi.mock('@/app/golf/actions/crm-foundations', () => ({
  listSegments: vi.fn(async () => []),
}));

const coachRows = [
  { id: 'coach-1', name: 'Pat Smith', email: 'pat@example.edu' },
  { id: 'coach-2', name: 'Jordan Lee', email: 'jordan@example.edu' },
];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) =>
          Promise.resolve({
            data: coachRows.filter((c) => ids.includes(c.id)),
            error: null,
          }),
      }),
    }),
  }),
}));

import { SequenceBuilder } from './SequenceBuilder';

function enrollment(
  overrides: Partial<CrmSequenceEnrollment>,
): CrmSequenceEnrollment {
  return {
    id: 'enr-1',
    sequence_id: 'seq-1',
    coach_id: 'coach-1',
    status: 'active',
    current_step: 1,
    next_send_at: null,
    enrolled_at: new Date().toISOString(),
    completed_at: null,
    stopped_at: null,
    stop_reason: null,
    enrolled_by: 'user-1',
    metadata: {},
    ...overrides,
  };
}

describe('SequenceBuilder — enrollment management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSequence.mockResolvedValue({
      sequence: {
        id: 'seq-1',
        name: 'Test drip',
        description: null,
        trigger_kind: 'manual',
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      steps: [],
    });
    getSequenceEnrollmentCounts.mockResolvedValue({
      active: 1,
      completed: 0,
      stopped: 0,
    });
    getSequencePerformance.mockResolvedValue(null);
  });

  it('renders enrolled coaches with working Pause/Stop actions', async () => {
    const user = userEvent.setup();
    listEnrollments.mockResolvedValue([
      enrollment({ id: 'enr-active', coach_id: 'coach-1', status: 'active' }),
    ]);
    pauseEnrollment.mockResolvedValue(
      enrollment({ id: 'enr-active', coach_id: 'coach-1', status: 'paused' }),
    );

    render(<SequenceBuilder sequenceId="seq-1" />);

    // Coach identity resolves via the batched client-side lookup.
    await waitFor(() => screen.getByText('Pat Smith'));
    expect(screen.getByText('pat@example.edu')).toBeInTheDocument();

    const row = screen.getByText('Pat Smith').closest('div.flex.items-center.gap-3');
    expect(row).not.toBeNull();
    const pauseBtn = within(row as HTMLElement).getByRole('button', { name: 'Pause enrollment' });
    const stopBtn = within(row as HTMLElement).getByRole('button', { name: 'Stop enrollment' });
    expect(pauseBtn).toBeInTheDocument();
    expect(stopBtn).toBeInTheDocument();

    await user.click(pauseBtn);

    expect(pauseEnrollment).toHaveBeenCalledWith('enr-active');
    await waitFor(() =>
      expect(screen.getByText('paused')).toBeInTheDocument(),
    );
  });

  it('resumes a paused enrollment via the Resume action', async () => {
    const user = userEvent.setup();
    listEnrollments.mockResolvedValue([
      enrollment({ id: 'enr-paused', coach_id: 'coach-1', status: 'paused', current_step: 2 }),
    ]);
    resumeEnrollment.mockResolvedValue(
      enrollment({ id: 'enr-paused', coach_id: 'coach-1', status: 'active', current_step: 2 }),
    );

    render(<SequenceBuilder sequenceId="seq-1" />);

    await waitFor(() => screen.getByText('Pat Smith'));
    const row = screen.getByText('Pat Smith').closest('div.flex.items-center.gap-3');
    const resumeBtn = within(row as HTMLElement).getByRole('button', { name: 'Resume enrollment' });
    // A paused enrollment can also be stopped outright, but not re-paused.
    expect(within(row as HTMLElement).queryByRole('button', { name: 'Pause enrollment' })).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole('button', { name: 'Stop enrollment' })).toBeInTheDocument();

    await user.click(resumeBtn);

    expect(resumeEnrollment).toHaveBeenCalledWith('enr-paused');
    await waitFor(() =>
      expect(screen.getByText('active')).toBeInTheDocument(),
    );
    // current_step is preserved across the pause/resume round trip.
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('stops an enrollment via the confirm-gated Stop action', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    listEnrollments.mockResolvedValue([
      enrollment({ id: 'enr-paused', coach_id: 'coach-2', status: 'paused' }),
    ]);
    stopEnrollment.mockResolvedValue(
      enrollment({
        id: 'enr-paused',
        coach_id: 'coach-2',
        status: 'stopped',
        stop_reason: 'manual',
      }),
    );

    render(<SequenceBuilder sequenceId="seq-1" />);

    await waitFor(() => screen.getByText('Jordan Lee'));
    const row = screen.getByText('Jordan Lee').closest('div.flex.items-center.gap-3');
    const stopBtn = within(row as HTMLElement).getByRole('button', { name: 'Stop enrollment' });

    await user.click(stopBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(stopEnrollment).toHaveBeenCalledWith('enr-paused', 'manual');
    await waitFor(() =>
      expect(screen.getByText('stopped')).toBeInTheDocument(),
    );

    confirmSpy.mockRestore();
  });

  it('offers no Pause/Resume/Stop controls for a completed enrollment', async () => {
    listEnrollments.mockResolvedValue([
      enrollment({ id: 'enr-done', coach_id: 'coach-1', status: 'completed' }),
    ]);

    render(<SequenceBuilder sequenceId="seq-1" />);

    await waitFor(() => screen.getByText('Pat Smith'));
    expect(screen.queryByRole('button', { name: 'Pause enrollment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume enrollment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop enrollment' })).not.toBeInTheDocument();
  });

  it('shows an honest empty state when nobody is enrolled', async () => {
    listEnrollments.mockResolvedValue([]);

    render(<SequenceBuilder sequenceId="seq-1" />);

    await waitFor(() =>
      expect(screen.getByText(/No coaches enrolled yet/)).toBeInTheDocument(),
    );
  });
});
