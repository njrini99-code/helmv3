// Base UI 1.8 links a switch to its wrapping <label> with aria-labelledby,
// which outranks aria-label and reads the label block plus the switch's own
// aria-label again ("Repeat weekly Repeat weekly"). These tests pin the Fairway
// wrapper's contract: a switch is named once, by its label text.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Switch } from '@/components/fairway/forms/Switch';

describe('Fairway Switch accessible name', () => {
  it('names a labelled switch once even when the caller also passes aria-label', () => {
    render(<Switch label="Repeat weekly" aria-label="Repeat weekly" />);
    expect(screen.getByRole('switch', { name: 'Repeat weekly' })).toBeTruthy();
  });

  it('names a labelled switch by its label alone and describes it by its description', () => {
    render(<Switch label="Email alerts" description="Sent once a day." />);
    const control = screen.getByRole('switch', { name: 'Email alerts' });
    expect(control).toHaveAccessibleDescription('Sent once a day.');
  });

  it('lets an explicit aria-labelledby win', () => {
    render(
      <>
        <span id="custom-name">Custom name</span>
        <Switch label="Visible label" aria-labelledby="custom-name" />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Custom name' })).toBeTruthy();
  });
});
