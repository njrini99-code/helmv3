/**
 * Regression test for P192 — the roster checkbox row in FairwayNewQualifier
 * had an EMPTY accessible name for every checkbox. Root cause: it's rendered
 * outside any `FormField`/`Field.Root`, so Base UI's `Checkbox` never
 * receives the `labelId` it needs to set `aria-labelledby` from, and (unlike
 * a native `<input type="checkbox">`) the underlying `<button role="checkbox">`
 * does not pick up a name from the surrounding `<label>`'s text content on its
 * own. Fixed by passing an explicit `aria-label` with the player's name.
 *
 * The 3 numeric steppers in this form were checked the same way and found to
 * already carry a correct `aria-labelledby` via the surrounding `FormField`
 * (Base UI's Field context) — no fix needed there.
 *
 * Owner 2026-09-28 rebuild: the 3 dates are Fairway DatePicker triggers now,
 * not OS date inputs (a typed five-digit year once reached the database).
 * The intent of the old date check is unchanged: every date control has a
 * visible label that names it, and its help text is tied to it.
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

    const rosterCheckboxes = players.map((player) =>
      screen.getByRole('checkbox', { name: `${player.first_name} ${player.last_name}` }),
    );

    expect(rosterCheckboxes).toHaveLength(players.length);
    expect(
      screen.getByRole('checkbox', {
        name: 'This qualifier intentionally allows one 18-hole round',
      }),
    ).toBeTruthy();

    for (const checkbox of rosterCheckboxes) {
      const name =
        checkbox.getAttribute('aria-label') ?? checkbox.getAttribute('aria-labelledby');
      expect(name).toBeTruthy();
    }
  });

  it('gives every date picker a name from its visible label, and ties its help text to it', () => {
    render(<FairwayNewQualifier players={players} />);

    // No OS date inputs are left to type a year into.
    expect(document.querySelectorAll('input[type="date"]').length).toBe(0);

    for (const label of ['Start date', 'End date', 'Entry deadline']) {
      const trigger = screen.getByRole('button', { name: label });
      const visible = Array.from(document.querySelectorAll('label')).find(
        (el) => el.htmlFor === trigger.id,
      );
      expect(visible?.textContent).toContain(label);
    }

    for (const [label, help] of [
      ['End date', /several days/i],
      ['Entry deadline', /on or before the start/i],
    ] as const) {
      const describedBy = screen.getByRole('button', { name: label }).getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)?.textContent).toMatch(help);
    }
  });

  it('gives every numeric stepper field a real accessible name via aria-labelledby', () => {
    render(<FairwayNewQualifier players={players} />);
    // NumberField renders its value as a native text input (role="textbox");
    // the 3 numeric fields are Rounds, Squad size, Coach's picks. Assert the
    // actual accessible-name wiring on the rendered input — not just that the
    // label text renders somewhere on the page, which would pass even if the
    // input and label were never associated.
    const numericLabels = ['Rounds', 'Squad size', "Coach's picks"];
    for (const label of numericLabels) {
      const input = screen.getByRole('textbox', { name: label });
      expect(input).toBeTruthy();
      const labelledBy = input.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).toBeTruthy();
    }

    const numericInputs = document.querySelectorAll('input[data-slot="number-field-input"]');
    expect(numericInputs.length).toBe(numericLabels.length);
  });

  it('has exactly one Create button, and names each section of the form', () => {
    render(<FairwayNewQualifier players={players} />);

    // The phone tray and the desktop rail are one element, so a screen reader
    // never meets two Create buttons.
    expect(screen.getAllByRole('button', { name: /Create qualifier/i })).toHaveLength(1);
    for (const section of ['The basics', 'When it runs', 'Format', 'Travel squad', 'Players']) {
      expect(screen.getByRole('group', { name: section })).toBeTruthy();
    }
  });
});
