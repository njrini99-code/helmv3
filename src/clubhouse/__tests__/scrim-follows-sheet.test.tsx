import { act, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A9: a dialog's dim fades with its panel and follows a drag. Every `::backdrop` fades by `opacity: var(--ch-scrim-a)` with a
 * transition, never a keyframe a close could only jump to the end of; the sheet drag sets it from how far the sheet is out.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { chScrimAt, useSheetDrag } from '../lib/sheet-drag';

const STYLES = join(process.cwd(), 'src/clubhouse/styles');
/** Every `::backdrop` rule in the Clubhouse styles: its file, selector and body. */
const backdrops = readdirSync(STYLES)
  .filter((f) => f.endsWith('.css'))
  .flatMap((f) =>
    [...readFileSync(join(STYLES, f), 'utf8').matchAll(/([^{}]*::backdrop[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ file: f, selector: m[1]!.trim(), body: m[2]! })),
  );

describe('the dim is driven, not a keyframe (A9)', () => {
  it('no ::backdrop rule runs an animation or a reversed one', () => {
    expect(backdrops.length).toBeGreaterThan(5);
    for (const b of backdrops) {
      expect(b.body, `${b.file} ${b.selector}`).not.toMatch(/\banimation\s*:/);
      expect(b.body, `${b.file} ${b.selector}`).not.toMatch(/reverse/);
    }
  });

  it('every ::backdrop that fades does it on var(--ch-scrim-a)', () => {
    const fading = backdrops.filter((b) => /transition\s*:/.test(b.body) && !b.selector.includes('*::backdrop'));
    expect(fading.length).toBeGreaterThanOrEqual(7);
    for (const b of fading) expect(b.body, `${b.file} ${b.selector}`).toMatch(/opacity:\s*var\(--ch-scrim-a/);
  });

  it('each dialog with a dim has its fade (the dark and phone overrides only change its colour)', () => {
    const dims = new Set(backdrops.filter((b) => /background:\s*(?!\s|transparent)/.test(b.body)).flatMap((b) => b.selector.match(/\.ch-[\w-]+(?=::backdrop)/g) ?? []));
    const fades = new Set(backdrops.filter((b) => /var\(--ch-scrim-a/.test(b.body)).flatMap((b) => b.selector.match(/\.ch-[\w-]+(?=::backdrop)/g) ?? []));
    for (const d of dims) expect(fades.has(d), d).toBe(true);
  });
});

function pointer(type: string, y: number, time: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 0, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 1 }, timeStamp: { value: time }, isPrimary: { value: true } });
  return e;
}

function Sheet() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(ref, () => {});
  return (
    <dialog data-testid="dialog" open>
      <div ref={ref} data-testid="sheet">
        <header data-testid="head" onPointerDown={drag.onPointerDown} />
      </div>
    </dialog>
  );
}

afterEach(() => vi.useRealTimers());

describe('the dim follows the drag (A9)', () => {
  it('a 400px sheet dragged 100px down leaves the dim at 0.75, at once; let go, it goes back to full with the panel', () => {
    expect(chScrimAt(100, 400)).toBe(0.75);
    expect(chScrimAt(-30, 400)).toBe(1);
    expect(chScrimAt(500, 400)).toBe(0);
    vi.useFakeTimers();
    render(<Sheet />);
    const sheet = screen.getByTestId('sheet');
    Object.defineProperty(sheet, 'offsetHeight', { value: 400, configurable: true });
    const dialog = screen.getByTestId('dialog');
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 100, 1000));
      window.dispatchEvent(pointer('pointermove', 200, 1100));
    });
    expect(dialog.style.getPropertyValue('--ch-scrim-a')).toBe('0.75');
    expect(dialog.style.getPropertyValue('--ch-scrim-dur')).toBe('0ms');
    act(() => {
      window.dispatchEvent(pointer('pointermove', 140, 1400));
      window.dispatchEvent(pointer('pointerup', 140, 1500));
    });
    expect(dialog.style.getPropertyValue('--ch-scrim-a')).toBe('1');
    expect(dialog.style.getPropertyValue('--ch-scrim-dur')).not.toBe('0ms');
  });
});
