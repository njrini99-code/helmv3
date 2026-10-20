import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The sidebar's script wordmark: written in once when the app opens from the welcome, drawn whole every other time. */

vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));

import { BrandLine, markBrandWrite, useBrandWrite } from '../shell/BrandWord';

function Brand() {
  const write = useBrandWrite();
  return (
    <div>
      <BrandLine write={write} />
    </div>
  );
}

afterEach(() => sessionStorage.clear());

describe('BrandWord', () => {
  it('reads Golfhelm, helm set apart, and is drawn whole by default', () => {
    const { container } = render(<Brand />);
    const word = container.querySelector('.ch-brand__word')!;
    expect(word.textContent).toBe('Golfhelm');
    expect(word.querySelector('b')?.textContent).toBe('helm');
    expect(word.classList.contains('is-write')).toBe(false);
    // Script then logo: the wheel follows the word.
    // The word sits in its fold track (the sidebar's rail closes it), and the wheel follows that track.
    expect(word.parentElement?.classList.contains('ch-brand__fold')).toBe(true);
    expect(word.parentElement?.nextElementSibling?.classList.contains('ch-brand__mark')).toBe(true);
    expect(container.querySelector('.ch-brand__mark')!.classList.contains('is-write')).toBe(false);
  });

  it('writes in once after the welcome asks, then clears the ask', () => {
    markBrandWrite();
    const first = render(<Brand />);
    expect(first.container.querySelector('.ch-brand__word')!.classList.contains('is-write')).toBe(true);
    expect(first.container.querySelector('.ch-brand__mark')!.classList.contains('is-write')).toBe(true);
    expect(sessionStorage.getItem('ch-brand-write')).toBeNull();
    first.unmount();
    const again = render(<Brand />);
    expect(again.container.querySelector('.ch-brand__word')!.classList.contains('is-write')).toBe(false);
  });
});
