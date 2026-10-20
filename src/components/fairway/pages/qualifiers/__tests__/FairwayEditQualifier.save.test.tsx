/**
 * DATA-06: the edit form writes details, then round courses. A failed second
 * write used to show a bare error, hiding that the details had already saved.
 * DATA-07: an emptied Rounds field silently saved as 1 round.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const updateGolfQualifierDetails = vi.fn();
const setQualifierRoundCourses = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({
  updateGolfQualifierDetails: (...a: unknown[]) => updateGolfQualifierDetails(...a),
  setQualifierRoundCourses: (...a: unknown[]) => setQualifierRoundCourses(...a),
}));
vi.mock('@/components/fairway/pages/rounds-new/FairwayCoursePicker', () => ({ FairwayCoursePicker: () => null }));

import { FairwayEditQualifier } from '../FairwayEditQualifier';

const initial = {
  name: 'Fall qualifier',
  description: null,
  courseName: 'Home course',
  rules: null,
  startDate: '2030-10-01',
  endDate: null,
  entryDeadline: null,
  spotsAvailable: 5,
  numRounds: 1,
};

function submit() {
  fireEvent.submit(screen.getByRole('button', { name: /save changes/i }).closest('form')!);
}

beforeEach(() => {
  updateGolfQualifierDetails.mockReset().mockResolvedValue({ success: true });
  setQualifierRoundCourses.mockReset().mockResolvedValue({ success: true });
  push.mockReset();
});

describe('FairwayEditQualifier save', () => {
  it('says the details saved when the round-courses write fails', async () => {
    setQualifierRoundCourses.mockResolvedValue({ success: false, error: 'Course lookup failed.' });
    render(<FairwayEditQualifier qualifierId="q1" initial={initial} roundCourses={[]} />);
    submit();
    await waitFor(() =>
      expect(screen.getByText(/details were saved, but the round courses were not: Course lookup failed\./)).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('sends a cleared round as an empty row, so the stored course is cleared, not kept', async () => {
    const stored = [
      { roundNumber: 1, courseId: 'c1', courseName: 'North', teeId: 't1' },
      { roundNumber: 2, courseId: 'c2', courseName: 'South', teeId: 't2' },
    ];
    render(<FairwayEditQualifier qualifierId="q1" initial={{ ...initial, numRounds: 3 }} roundCourses={stored} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[1]!);
    submit();
    await waitFor(() => expect(setQualifierRoundCourses).toHaveBeenCalledTimes(1));
    // Round 3 never had a course, so nothing is sent for it.
    expect(setQualifierRoundCourses).toHaveBeenCalledWith('q1', 3, [
      { roundNumber: 1, courseId: 'c1', courseName: 'North', teeId: 't1' },
      { roundNumber: 2, courseId: null, courseName: null, teeId: null },
    ]);
  });

  it('reads a stored empty row as no course', () => {
    render(
      <FairwayEditQualifier
        qualifierId="q1"
        initial={{ ...initial, numRounds: 2 }}
        roundCourses={[
          { roundNumber: 1, courseId: 'c1', courseName: 'North', teeId: 't1' },
          { roundNumber: 2, courseId: null, courseName: null, teeId: null },
        ]}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Clear' })).toHaveLength(1);
  });

  it('blocks an empty Rounds field instead of saving 1 round', async () => {
    render(<FairwayEditQualifier qualifierId="q1" initial={initial} roundCourses={[]} />);
    const rounds = screen.getAllByRole('textbox').find((el) => (el as HTMLInputElement).value === '1') as HTMLInputElement;
    expect(rounds).toBeDefined();
    fireEvent.change(rounds, { target: { value: '' } });
    fireEvent.blur(rounds);
    submit();
    // Either guard may be the one that stops it: the field shows its inline
    // error, and the submit never reaches the save actions.
    await waitFor(() => expect(screen.getByText(/Enter 1 or more rounds\.|Enter how many rounds/)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    expect(updateGolfQualifierDetails).not.toHaveBeenCalled();
    expect(setQualifierRoundCourses).not.toHaveBeenCalled();
  });
});
