// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamTape, type TapeItem } from '../screens/stats/TeamTape';

afterEach(cleanup);

const base: TapeItem = { label: 'Scrambling', value: '52', unit: '%', delta: 4, deltaDigits: 0, lowerIsBetter: false, context: 'vs previous 10', series: [44, 48, 52], gauge: { kind: 'rate', ref: 48 }, n: 52 };

describe('TeamTape', () => {
  it('a rate dial with a reference draws its tick', () => {
    const { container } = render(<TeamTape items={[base]} />);
    expect(container.querySelectorAll('.ch-tp__tick')).toHaveLength(1);
  });

  it('a rate dial with no reference draws no tick', () => {
    const { container } = render(<TeamTape items={[{ ...base, gauge: { kind: 'rate', ref: null } }]} />);
    expect(container.querySelector('.ch-tp__tick')).toBeNull();
  });

  it('a figure with no value keeps no caption and no coverage note', () => {
    const { container } = render(<TeamTape items={[{ ...base, value: '—', delta: null, n: null, note: 'Holes scored in 6 of 10 rounds' }]} />);
    expect(container.querySelector('.ch-tp__v')!.textContent).toBe('—');
    expect(container.querySelector('.ch-tp__d em')).toBeNull();
    expect(container.querySelector('.ch-tp__n')).toBeNull();
  });

  it('a figure with a value keeps both', () => {
    const { container } = render(<TeamTape items={[{ ...base, note: 'Holes scored in 6 of 10 rounds' }]} />);
    expect(container.querySelector('.ch-tp__d em')!.textContent).toBe('vs previous 10');
    expect(container.querySelector('.ch-tp__n')!.textContent).toBe('Holes scored in 6 of 10 rounds');
  });
});
