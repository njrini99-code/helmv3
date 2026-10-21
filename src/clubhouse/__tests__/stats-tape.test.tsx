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
    // No standard error on the change: it is shown, in neutral ink, as no clear change (stats visuals Q4).
    expect(container.querySelector('.ch-tp__d em')!.textContent).toBe('No clear change vs previous 10');
    expect(container.querySelector('.ch-tp__n')!.textContent).toBe('Holes scored in 6 of 10 rounds');
  });

  it('colours a change only when it clears its standard error, and keeps the signed number either way', () => {
    const { container } = render(<TeamTape items={[{ ...base, se: 5 }, { ...base, label: 'Greens', se: 2 }, { ...base, label: 'Putts', delta: 0.6, deltaDigits: 1, lowerIsBetter: true, se: 0.4 }]} />);
    const cells = [...container.querySelectorAll('.ch-tp__c')];
    expect(cells.map((c) => c.className.replace('ch-tp__c ', ''))).toEqual(['is-flat', 'is-good', 'is-bad']);
    expect(cells.map((c) => c.querySelector('.ch-tp__d em')!.textContent)).toEqual(['No clear change vs previous 10', 'Better than previous 10', 'Worse than previous 10']);
    expect(cells.map((c) => c.querySelector('.ch-tp__d')!.textContent!.replace(/[A-Za-z ]+previous 10$/, ''))).toEqual(['+4', '+4', '+0.6']);
  });

  it('a change under a caption that says something else keeps that caption on the note line', () => {
    const { container } = render(<TeamTape items={[{ ...base, label: 'Greens', context: 'Tour averages 66%', note: 'Holes scored in 6 of 10 rounds', se: 2 }]} />);
    expect(container.querySelector('.ch-tp__d em')!.textContent).toBe('Better than previous 10');
    expect(container.querySelector('.ch-tp__n')!.textContent).toBe('Tour averages 66% · Holes scored in 6 of 10 rounds');
  });
});
