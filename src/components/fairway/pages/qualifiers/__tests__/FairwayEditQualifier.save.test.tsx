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
vi.mock('@/app/golf/actions/golf', () => ({
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
