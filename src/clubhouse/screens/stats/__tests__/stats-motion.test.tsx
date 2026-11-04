import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WindowCrossfade } from '../shs-motion';

describe('WindowCrossfade', () => {
  it('lays a fading copy over the page on a window change only', () => {
    const { container, rerender } = render(
      <WindowCrossfade k="a" off={false} reduced={false}>
        <p>old</p>
      </WindowCrossfade>,
    );
    rerender(
      <WindowCrossfade k="a" off={false} reduced={false}>
        <p>same window</p>
      </WindowCrossfade>,
    );
    expect(container.querySelector('.ch-shs-xfade-ghost')).toBeNull();
    rerender(
      <WindowCrossfade k="b" off={false} reduced={false}>
        <p>new</p>
      </WindowCrossfade>,
    );
    expect(container.querySelector('.ch-shs-xfade-ghost')?.textContent).toBe('same window');
    expect(container.querySelector('.ch-shs-xfade-ghost')?.getAttribute('aria-hidden')).toBe('true');
  });
});
