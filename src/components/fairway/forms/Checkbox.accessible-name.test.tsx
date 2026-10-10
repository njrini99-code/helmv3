// Base UI 1.8 links a checkbox to its wrapping <label> with aria-labelledby,
// which outranks aria-label and reads the whole row. These tests pin the
// Fairway wrapper's contract: a checkbox is named once, by its label text or
// by the caller's aria-label, and a description is a description.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox, CheckboxGroup } from '@/components/fairway/forms/Checkbox';

describe('Fairway Checkbox accessible name', () => {
  it('names a labelled checkbox by its label alone and describes it by its description', () => {
    render(
      <CheckboxGroup value={[]} onValueChange={() => {}}>
        <Checkbox value="ok" label="Allow one round." description="Players cannot enter another." />
      </CheckboxGroup>,
    );
    const box = screen.getByRole('checkbox', { name: 'Allow one round.' });
    expect(box).toHaveAccessibleDescription('Players cannot enter another.');
  });

  it('keeps a caller aria-label as the whole name inside an outer row label', () => {
    render(
      <CheckboxGroup value={[]} onValueChange={() => {}}>
        <label htmlFor="row-p1">
          <Checkbox id="row-p1" value="p1" aria-label="Ada Lovelace" />
          <span>Ada Lovelace</span>
          <span>AL</span>
        </label>
      </CheckboxGroup>,
    );
    expect(screen.getByRole('checkbox', { name: 'Ada Lovelace' })).toBeTruthy();
  });

  it('lets an explicit aria-labelledby win', () => {
    render(
      <CheckboxGroup value={[]} onValueChange={() => {}}>
        <span id="custom-name">Custom name</span>
        <Checkbox value="x" label="Visible label" aria-labelledby="custom-name" />
      </CheckboxGroup>,
    );
    expect(screen.getByRole('checkbox', { name: 'Custom name' })).toBeTruthy();
  });
});
