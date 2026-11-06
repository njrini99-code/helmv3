import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));

describe('keyboardCover', () => {
  it('reads the keyboard from the visible height', async () => {
    const { keyboardCover } = await import('../sheet-keyboard');
    expect(keyboardCover(844, 508, 1)).toBe(336);
  });
  it('ignores a browser bar, and a pinch-zoom', async () => {
    const { keyboardCover } = await import('../sheet-keyboard');
    expect(keyboardCover(844, 780, 1)).toBe(0);
    expect(keyboardCover(844, 400, 2)).toBe(0);
  });
});
