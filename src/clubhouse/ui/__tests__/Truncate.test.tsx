import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Truncate } from '../Truncate';

// ST-1: one truncate policy. The whole text stays the accessible text; a cut adds it as the title.
describe('Truncate (ST-1)', () => {
  it('keeps the whole text and clamps by lines', () => {
    render(<Truncate lines={2}>Demo University Golf — Team Channel</Truncate>);
    const el = screen.getByText('Demo University Golf — Team Channel');
    expect(el.className).toContain('ch-trunc');
    expect(el.getAttribute('data-lines')).toBe('2');
  });

  it('adds a title only when the text is cut', () => {
    render(<Truncate>Short</Truncate>);
    expect(screen.getByText('Short').getAttribute('title')).toBeNull();
  });
});
