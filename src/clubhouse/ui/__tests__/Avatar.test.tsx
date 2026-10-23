import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from '../Avatar';

afterEach(() => cleanup());

const toneOf = (name: string, size?: number, ring?: boolean) => {
  const { container, unmount } = render(<Avatar name={name} size={size} ring={ring} />);
  const tone = container.querySelector('.ch-avatar')!.getAttribute('data-tone');
  unmount();
  return tone;
};

/** B19: one tint rule. A person's coin takes the same tone wherever it is drawn, at any size and with or without a ring
 *  (the phone then draws every tone as the one calm neutral, D-43, in CSS). */
describe('Avatar tone (B19)', () => {
  it('the same person gets the same tone at every size and in a ring', () => {
    for (const name of ['Ava Thompson', 'Jonah Okafor', 'Priya Natarajan', 'Sam Lee']) {
      const t = toneOf(name);
      expect(t).toMatch(/^(sand|stone|sage|mist|clay)$/);
      expect(toneOf(name, 24)).toBe(t);
      expect(toneOf(name, 48, true)).toBe(t);
    }
  });

  it('spreads a team across the tones', () => {
    const names = ['Ava Thompson', 'Jonah Okafor', 'Priya Natarajan', 'Sam Lee', 'Eli Brooks', 'Mara Chen', 'Theo Grant', 'Lena Ruiz'];
    expect(new Set(names.map((n) => toneOf(n))).size).toBeGreaterThanOrEqual(3);
  });
});
