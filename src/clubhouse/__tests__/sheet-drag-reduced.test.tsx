import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * F-0018 (audit 2026-10-29): Reduce Motion switched sheet drag off. It changes how a drag settles, never whether there is
 * one: the sheet still follows the finger, and a let-go short of closing puts it back at once instead of springing.
 */
vi.mock('../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
import { useSheetDrag } from '../lib/sheet-drag';

function pointer(type: string, y: number, time: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 0, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 1 }, timeStamp: { value: time }, isPrimary: { value: true } });
  return e;
}

function Sheet() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(ref, () => {}, { reduced: true });
  return (
    <dialog open>
      <div ref={ref} data-testid="sheet">
        <header data-testid="head" onPointerDown={drag.onPointerDown} />
      </div>
    </dialog>
  );
}

describe('sheet drag under Reduce Motion (F-0018)', () => {
  it('follows the finger, and a short let-go returns at once', () => {
    render(<Sheet />);
    const sheet = screen.getByTestId('sheet');
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 100, 1000));
      window.dispatchEvent(pointer('pointermove', 220, 1100));
    });
    expect(sheet.style.translate).toBe('0 120px');
    act(() => {
      window.dispatchEvent(pointer('pointermove', 140, 1400));
      window.dispatchEvent(pointer('pointerup', 140, 1500));
    });
    expect(sheet.style.translate).toBe('');
    expect(sheet.style.transition).toBe('none');
  });

  it('no sheet turns its drag off for reduced motion', () => {
    const sites = ['ui/Modal.tsx', 'ui/FormSheet.tsx', 'shell/AccountSheet.tsx', 'shell/AskSheetBody.tsx', 'screens/coachhelm/chat/History.tsx'];
    for (const f of sites) {
      const src = readFileSync(join(process.cwd(), 'src/clubhouse', f), 'utf8');
      expect(src, f).toMatch(/useSheetDrag\([^)]*reduced[^)]*\)/);
      expect(src, f).not.toMatch(/enabled: (phone && )?!reduced/);
    }
  });
});
