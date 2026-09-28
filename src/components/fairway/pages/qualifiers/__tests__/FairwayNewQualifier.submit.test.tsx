/**
 * Regression test for #1270 — "Create qualifier" did nothing at all: no POST,
 * no row, no error message anywhere on the page.
 *
 * Root cause (Base UI, verified against the installed source): every
 * `Checkbox.Root` calls `useField({ enabled: !groupContext, ... })`, so an
 * UNGROUPED checkbox registers itself as a field of the enclosing `<Form>`.
 * Registration stores `getCombinedFieldValidityData(validityData, invalid)`,
 * and outside a `Field.Root` the checkbox gets Base UI's DEFAULT field context
 * whose validity state is `valid: null` — nothing ever commits a real value
 * into it. `Form`'s submit handler then does
 *
 *     const invalidFields = values.filter(f => !f.validityData.state.valid)
 *
 * and `!null` is `true`, so all 7 roster checkboxes counted as permanently
 * invalid. Form called `event.preventDefault()` and NEVER invoked the app's
 * `onSubmit`, which is why nothing happened and nothing was reported: with no
 * `Field.Root` there is also no `<Field.Error>` to render a message.
 *
 * The fix wraps the roster in `CheckboxGroup`, which flips `enabled` to false
 * so the checkboxes never register at all.
 *
 * This test asserts the OUTCOME (the submit handler runs and the action is
 * called), so it fails again if anyone re-introduces a bare Base UI control
 * inside this form — regardless of which control it is.
 *
 * Owner 2026-09-28 rebuild: the dates are the Fairway DatePicker, not OS date
 * inputs, so these drive the real picker (open it, click the day). The
 * blocked-submit cases now also pin WHERE the coach is sent: the first
 * problem in page order gets focus, and its message sits at its field.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';

const createGolfQualifier = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock('@/app/golf/actions/golf', () => ({
  createGolfQualifier: (...args: unknown[]) => createGolfQualifier(...args),
}));

import { FairwayNewQualifier } from '../FairwayNewQualifier';

const players = [
  { id: 'p1', first_name: 'Ada', last_name: 'Lovelace' },
  { id: 'p2', first_name: 'Grace', last_name: 'Hopper' },
];

// The start picker disables days before the viewer's today, so a hardcoded
// date silently expires (this file once did, from 2026-09-16 on). The clock
// is pinned instead, to mid-August, so no UTC offset in -12..+14 moves "today"
// out of August 15-16 and every day picked below stays in the future and in
// the month the calendar opens on. `toFake: ['Date']` fakes the clock ONLY:
// userEvent drives real timers for its pointer sequences.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
  createGolfQualifier.mockReset();
  createGolfQualifier.mockResolvedValue({ success: true });
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

type User = ReturnType<typeof userEvent.setup>;

/** Open a date field's calendar and click a day, as a coach would. */
async function pickDate(user: User, label: string, day: number) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  const grid = await screen.findByRole('grid');
  // The day button's own full name; a looser pattern matches every cell whose
  // number contains the digit.
  await user.click(
    within(grid).getByRole('button', { name: format(new Date(2026, 7, day), 'EEEE, MMMM do, yyyy') }),
  );
}

function typeName(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /Qualifier name/i }), { target: { value } });
}

function confirmSingleRoundCap() {
  fireEvent.click(screen.getByRole('checkbox', { name: /intentionally allows one 18-hole round/i }));
}

/** A stepper button inside the number field with this label. */
function stepper(label: string, which: 'Increase' | 'Decrease') {
  const field = screen.getByRole('textbox', { name: label }).closest<HTMLElement>('[data-slot="number-field"]');
  expect(field).toBeTruthy();
  return within(field!).getByRole('button', { name: which });
}

function createButton() {
  return screen.getByRole('button', { name: /Create qualifier/i });
}

describe('FairwayNewQualifier — submit reaches the server action (#1270)', () => {
  it('calls createGolfQualifier when the required fields are filled', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('Spring Travel Qualifier');
    await pickDate(user, 'Start date', 25);
    confirmSingleRoundCap();

    fireEvent.click(createButton());

    await waitFor(() => expect(createGolfQualifier).toHaveBeenCalledTimes(1));
    expect(createGolfQualifier.mock.calls[0]?.[0]).toMatchObject({
      name: 'Spring Travel Qualifier',
      startDate: '2026-08-25',
      numRounds: 1,
      selectionSlotsTotal: 5,
      selectionSlotsCoachPick: 1,
    });
    // One round: no per-round course list is sent.
    expect(createGolfQualifier.mock.calls[0]?.[0].roundCourses).toBeUndefined();
  });

  it('still submits with roster players selected — the checkboxes must not gate the form', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('Squad pick');
    await pickDate(user, 'Start date', 25);
    confirmSingleRoundCap();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ada Lovelace' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Grace Hopper' }));

    fireEvent.click(createButton());

    await waitFor(() => expect(createGolfQualifier).toHaveBeenCalledTimes(1));
    expect(createGolfQualifier.mock.calls[0]?.[0]).toMatchObject({
      playerIds: ['p1', 'p2'],
    });
  });

  it('blocks a blank name VISIBLY rather than silently', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    await pickDate(user, 'Start date', 25);
    fireEvent.click(createButton());

    // The name Input is a properly registered Field carrying `required`, so
    // Base UI legitimately blocks here — and because it IS inside a Field.Root
    // it renders a real <Field.Error> the coach can read. That is the whole
    // difference from #1270: a blocked submit must always leave a message and
    // mark the offending control. A bare, unregistered control could do
    // neither, which is how the create button came to fail in total silence.
    await waitFor(() => {
      const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
      expect(nameInput?.getAttribute('data-invalid')).not.toBeNull();
    });
    const errorRow = document.querySelector('input[name="name"]')?.parentElement?.textContent ?? '';
    expect(errorRow.trim().length).toBeGreaterThan(0);
    expect(createGolfQualifier).not.toHaveBeenCalled();
  });

  it('blocks a name of only spaces at the field, with its own message', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('   ');
    await pickDate(user, 'Start date', 25);
    confirmSingleRoundCap();
    fireEvent.click(createButton());

    const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
    await waitFor(() => expect(nameInput?.getAttribute('data-invalid')).not.toBeNull());
    expect(nameInput?.closest('[data-slot="form-field"]')?.textContent).toContain('Give the qualifier a name.');
    expect(createGolfQualifier).not.toHaveBeenCalled();
  });

  it('sends the coach to the start date when it is missing, with the message at the field', async () => {
    render(<FairwayNewQualifier players={players} />);

    typeName('Fall Qualifying');
    confirmSingleRoundCap();
    fireEvent.click(createButton());

    await waitFor(() => expect(screen.getByText('Pick a start date.')).toBeTruthy());
    const trigger = screen.getByRole('button', { name: 'Start date' });
    expect(document.activeElement).toBe(trigger);
    // The message is the trigger's description, so a screen reader hears it
    // when the focus lands.
    expect(document.getElementById(trigger.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Pick a start date.',
    );
    expect(createGolfQualifier).not.toHaveBeenCalled();
  });

  it('keeps an end date that the start moved past from reaching the server', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('Two-day qualifier');
    await pickDate(user, 'Start date', 25);
    await pickDate(user, 'End date', 27);
    // The end picker disables days before the start, so the only way to an
    // end before the start is moving the start past it afterwards.
    await pickDate(user, 'Start date', 28);
    confirmSingleRoundCap();

    expect(screen.getByText('End date cannot be before the start date.')).toBeTruthy();
    fireEvent.click(createButton());

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^End date/ })),
    );
    expect(createGolfQualifier).not.toHaveBeenCalled();
  });

  it('requires the coach to explicitly choose the round cap', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('Fall Qualifying');
    await pickDate(user, 'Start date', 25);

    fireEvent.click(createButton());

    await waitFor(() => {
      expect(screen.getByText(/confirm that this qualifier intentionally allows one round/i)).toBeTruthy();
    });
    expect(document.activeElement).toBe(
      screen.getByRole('checkbox', { name: /intentionally allows one 18-hole round/i }),
    );
    expect(createGolfQualifier).not.toHaveBeenCalled();
  });

  it('treats a raised round count as the cap: no confirmation, and the count is sent', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('Three-round qualifier');
    await pickDate(user, 'Start date', 25);
    fireEvent.click(stepper('Rounds', 'Increase'));
    fireEvent.click(stepper('Rounds', 'Increase'));

    // The one-round confirmation is for one round only.
    expect(screen.queryByRole('checkbox', { name: /intentionally allows one 18-hole round/i })).toBeNull();
    expect(screen.getByRole('group', { name: /Course per round/i })).toBeTruthy();

    fireEvent.click(createButton());

    await waitFor(() => expect(createGolfQualifier).toHaveBeenCalledTimes(1));
    expect(createGolfQualifier.mock.calls[0]?.[0]).toMatchObject({ numRounds: 3, roundCourses: [] });
  });

  it('reads the squad out live, never "Top 0", and sends what it says', async () => {
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    // The defaults: a 5-player squad with 1 coach's pick.
    expect(screen.getByText("Top 4 on score · 1 coach's pick.")).toBeTruthy();

    for (let i = 0; i < 4; i++) fireEvent.click(stepper("Coach's picks", 'Increase'));
    expect(screen.getByText("All 5 are coach's picks.")).toBeTruthy();

    // A smaller squad takes the picks down with it: the field never shows
    // more picks than the squad holds.
    fireEvent.click(stepper('Squad size', 'Decrease'));
    expect(screen.getByText("All 4 are coach's picks.")).toBeTruthy();
    expect((screen.getByRole('textbox', { name: "Coach's picks" }) as HTMLInputElement).value).toBe('4');

    typeName('Coach selection');
    await pickDate(user, 'Start date', 25);
    confirmSingleRoundCap();
    fireEvent.click(createButton());

    await waitFor(() => expect(createGolfQualifier).toHaveBeenCalledTimes(1));
    expect(createGolfQualifier.mock.calls[0]?.[0]).toMatchObject({
      selectionSlotsTotal: 4,
      selectionSlotsCoachPick: 4,
    });
  });

  it('shows a server refusal beside the Create button', async () => {
    createGolfQualifier.mockResolvedValue({ success: false, error: 'Failed to add players to qualifier. Please try again.' });
    const user = userEvent.setup();
    render(<FairwayNewQualifier players={players} />);

    typeName('Spring Travel Qualifier');
    await pickDate(user, 'Start date', 25);
    confirmSingleRoundCap();
    fireEvent.click(createButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Failed to add players to qualifier.');
    expect(push).not.toHaveBeenCalled();
  });
});
