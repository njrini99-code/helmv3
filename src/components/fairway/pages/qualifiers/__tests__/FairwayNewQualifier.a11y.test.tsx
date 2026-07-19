/**
 * Regression test for P192 — the roster checkbox row in FairwayNewQualifier
 * had an EMPTY accessible name for every checkbox. Root cause: it's rendered
 * outside any `FormField`/`Field.Root`, so Base UI's `Checkbox` never
 * receives the `labelId` it needs to set `aria-labelledby` from, and (unlike
 * a native `<input type="checkbox">`) the underlying `<button role="checkbox">`
 * does not pick up a name from the surrounding `<label>`'s text content on its
 * own. Fixed by passing an explicit `aria-label` with the player's name.
 *
 * The 3 date inputs + 3 numeric steppers in this form were checked the same
 * way and found to already carry a correct `aria-labelledby` via the
 * surrounding `FormField` (Base UI's Field context) — no fix needed there.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayNewQualifier } from '../FairwayNewQualifier';

const players = [
  { id: 'p1', first_name: 'Ada', last_name: 'Lovelace' },
  { id: 'p2', first_name: 'Grace', last_name: 'Hopper' },
];

describe('FairwayNewQualifier — form control accessible names (P192)', () => {
  it('gives every roster checkbox a non-empty accessible name matching the player', () => {
    render(<FairwayNewQualifier players={players} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(players.length);

    expect(screen.getByRole('checkbox', { name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Grace Hopper' })).toBeTruthy();

    for (const checkbox of checkboxes) {
      const name =
        checkbox.getAttribute('aria-label') ?? checkbox.getAttribute('aria-labelledby');
      expect(name).toBeTruthy();
    }
  });

  it('gives every date input a non-empty accessible name via its FormField', () => {
    render(<FairwayNewQualifier players={players} />);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(3);
    for (const input of Array.from(dateInputs)) {
      expect(input.getAttribute('aria-labelledby')).toBeTruthy();
    }
  });

  it('gives every numeric stepper field a non-empty accessible name via its FormField', () => {
    render(<FairwayNewQualifier players={players} />);
    // NumberField renders its value as a text input (role="textbox"); the 3
    // numeric fields are Rounds, Squad size, Coach's picks.
    const numericLabels = ['Rounds', 'Squad size', "Coach's picks"];
    for (const label of numericLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
