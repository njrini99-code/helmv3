// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField steppers', () => {
  it('stretch to the field height instead of sitting at the top', () => {
    // 390px baseline (New qualifier: Rounds, Squad size): the -/+ sat higher
    // than the number. `h-full` on a stepper is a percentage of the group's
    // auto height, which switches off the group's items-stretch, so the button
    // shrank to its glyph and pinned to the top edge.
    render(<NumberField defaultValue={5} min={1} max={50} unit="players" />);
    for (const name of ['Decrease', 'Increase']) {
      const stepper = screen.getByRole('button', { name });
      expect(stepper.className).not.toMatch(/(^|\s)h-full(\s|$)/);
      expect(stepper.className).toMatch(/(^|\s)items-center(\s|$)/);
      expect(stepper.parentElement?.className).toMatch(/(^|\s)items-stretch(\s|$)/);
    }
  });
});
