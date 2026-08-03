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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

describe('FairwayNewQualifier — submit reaches the server action (#1270)', () => {
  beforeEach(() => {
    createGolfQualifier.mockReset();
    createGolfQualifier.mockResolvedValue({ success: true });
    push.mockReset();
  });

  it('calls createGolfQualifier when the required fields are filled', async () => {
    render(<FairwayNewQualifier players={players} />);

    fireEvent.change(screen.getByRole('textbox', { name: /Qualifier name/i }), {
      target: { value: 'Spring Travel Qualifier' },
    });
    const startDate = document.querySelector<HTMLInputElement>('input[name="startDate"]');
    expect(startDate).toBeTruthy();
    fireEvent.change(startDate!, { target: { value: '2026-09-15' } });

    fireEvent.click(screen.getByRole('button', { name: /Create qualifier/i }));

    await waitFor(() => expect(createGolfQualifier).toHaveBeenCalledTimes(1));
    expect(createGolfQualifier.mock.calls[0]?.[0]).toMatchObject({
      name: 'Spring Travel Qualifier',
      startDate: '2026-09-15',
    });
  });

  it('still submits with roster players selected — the checkboxes must not gate the form', async () => {
    render(<FairwayNewQualifier players={players} />);

    fireEvent.change(screen.getByRole('textbox', { name: /Qualifier name/i }), {
      target: { value: 'Squad pick' },
    });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="startDate"]')!, {
      target: { value: '2026-09-15' },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ada Lovelace' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Grace Hopper' }));

    fireEvent.click(screen.getByRole('button', { name: /Create qualifier/i }));

    await waitFor(() => expect(createGolfQualifier).toHaveBeenCalledTimes(1));
    expect(createGolfQualifier.mock.calls[0]?.[0]).toMatchObject({
      playerIds: ['p1', 'p2'],
    });
  });

  it('blocks a blank name VISIBLY rather than silently', async () => {
    render(<FairwayNewQualifier players={players} />);

    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="startDate"]')!, {
      target: { value: '2026-09-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create qualifier/i }));

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
});
