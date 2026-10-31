import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * F-0058 (audit 2026-10-29): after Cancel or Delete on Calendar, another event's peek opened by itself. The dialog's
 * native close put focus back loudly (Peek opens on a focus it didn't hear was code's). Focus now goes back quietly, to
 * the opener, or to a fallback the caller names when the opener has gone.
 */
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
import { useDialogLifetime } from '../lib/dialog-lifetime';

function Dlg({ open, fallback }: { open: boolean; fallback: () => HTMLElement | null }) {
  const { ref, present } = useDialogLifetime(open, { direction: 'center', fallbackFocus: fallback });
  return present ? <dialog ref={ref}>Body</dialog> : null;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a closing dialog hands focus back quietly (F-0058)', () => {
  it('to the fallback when the opener has gone, marked quiet as it lands', async () => {
    const opener = document.createElement('button');
    const day = document.createElement('div');
    day.tabIndex = -1;
    document.body.append(opener, day);
    opener.focus();
    let quietOnFocus: boolean | null = null;
    day.addEventListener('focus', () => {
      quietOnFocus = 'chPeekQuiet' in day.dataset;
    });
    const view = render(<Dlg open fallback={() => day} />);
    opener.remove();
    view.rerender(<Dlg open={false} fallback={() => day} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(document.activeElement).toBe(day);
    expect(quietOnFocus).toBe(true);
  });
});
