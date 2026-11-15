import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PREVIEW_HOME } from '../../../preview/fixtures';
import { Form } from '../HomePhone';

/**
 * W3 (owner's preview, 11 Nov 2026): Team scoring was "a green area with a V in it": no dates, nothing marked, and its boldest
 * figure was a change the card itself called "No clear change".
 */
describe('Team scoring line', () => {
  const form = PREVIEW_HOME.phone.form!;

  it('names its first and last days and its best and toughest', () => {
    const { container } = render(<Form form={form} />);
    expect(container.querySelector('.ch-hm-form__axis')?.textContent).toBe('Sep 2Oct 13');
    expect(screen.getByText(/Best day 73\.4 · Oct 13/)).toBeTruthy();
    expect(screen.getByText(/Toughest day 74\.6 · Sep 2/)).toBeTruthy();
    expect(container.querySelectorAll('.ch-hm-form__mark')).toHaveLength(2);
  });

  it('says when a marked day rests on one round', () => {
    render(<Form form={{ ...form, lineCounts: form.lineCounts!.map((n, i) => (i === 0 ? 1 : n)) }} />);
    expect(screen.getByText(/Toughest day 74\.6 · Sep 2 · 1 round/)).toBeTruthy();
  });

  it('a change under its standard error is quiet, a clear one keeps its tone', () => {
    const { container, rerender } = render(<Form form={form} />);
    expect(container.querySelector('.ch-hm-delta')?.className).toContain('is-flat');
    rerender(<Form form={{ ...form, deltaSe: 0.3 }} />);
    expect(container.querySelector('.ch-hm-delta')?.className).toContain('is-gain');
  });

  it('draws no labels without the days (an older fixture)', () => {
    const { container } = render(<Form form={{ ...form, lineDays: undefined }} />);
    expect(container.querySelector('.ch-hm-form__axis')).toBeNull();
    expect(container.querySelector('.ch-hm-form__ends')).toBeNull();
  });
});
