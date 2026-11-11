// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChFileField } from '../../../../data/coachhelm-file-shape';
import { FieldCard } from '../cards';

afterEach(cleanup);

const field = (over: Partial<ChFileField> = {}): ChFileField => ({
  head: 'Better than the field',
  band: 'better',
  figure: '−2.4',
  sentence: 'You shot 74. 5 teammates played; the field, you included, averaged +6.0.',
  dots: null,
  me: 3.6,
  mean: 6,
  scale: [-1, 11],
  meta: 'Oct 26 · Lonnie Poole',
  caption: 'You +3.6 · field +6.0',
  label: 'Strokes to par, per 18 holes',
  ...over,
});

const marks = () => [...document.querySelectorAll('.dots__lab .dots__m')].map((m) => `${m.textContent}|${m.className.replace('dots__m ', '')}`);

describe('Last round in context: a label at each mark', () => {
  it('says the player’s figure at their dot and the field’s at its tick, the left one ending at its mark and the right one starting at its mark', () => {
    render(<FieldCard field={field()} />);
    expect(marks()).toEqual(['You +3.6|is-l is-me', 'field +6.0|is-r']);
    const row = document.querySelector('.dots__lab') as HTMLElement;
    // The row carries the two marks' places, left then right, as the strip draws them.
    expect(row.style.getPropertyValue('--ch-hf-a')).toBe((document.querySelector('.dots .me') as HTMLElement).style.left);
    expect(row.style.getPropertyValue('--ch-hf-b')).toBe((document.querySelector('.dots .mean') as HTMLElement).style.left);
    // The scale's ends stay at the row's ends, and the joined line is gone.
    expect(row.firstElementChild!.textContent).toBe('−1.0');
    expect(row.lastElementChild!.textContent).toBe('+11.0');
    expect(row.textContent).not.toContain(' · ');
  });

  it('swaps the sides when the player is behind the field', () => {
    render(<FieldCard field={field({ me: 8.4, mean: 6, band: 'behind', caption: 'You +8.4 · field +6.0' })} />);
    expect(marks()).toEqual(['You +8.4|is-r is-me', 'field +6.0|is-l']);
    const row = document.querySelector('.dots__lab') as HTMLElement;
    expect(row.style.getPropertyValue('--ch-hf-a')).toBe((document.querySelector('.dots .mean') as HTMLElement).style.left);
  });

  it('a coach’s card names the player, and a caption it cannot split is shown whole', () => {
    render(<FieldCard field={field({ caption: 'Eli +3.6 · field +6.0' })} />);
    expect(marks()[0]).toBe('Eli +3.6|is-l is-me');
    cleanup();
    render(<FieldCard field={field({ caption: 'No field figure' })} />);
    expect(marks()).toEqual([]);
    expect(document.querySelector('.dots__lab')!.textContent).toContain('No field figure');
  });
});
