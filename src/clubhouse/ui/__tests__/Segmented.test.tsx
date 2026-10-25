import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from '../Segmented';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true }) }));

const animate = vi.fn();
beforeEach(() => {
  animate.mockClear();
  (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
  // Each option sits 80px further along: the thumb has somewhere to slide from.
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    const b = this.closest('[role="radio"]');
    return b ? Array.from(b.parentElement!.children).indexOf(b) * 80 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(80);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(32);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type View = 'day' | 'month' | 'list';
function Harness({ onChange }: { onChange?: (v: View) => void }) {
  const [v, setV] = useState<View>('day');
  return (
    <Segmented
      label="View"
      value={v}
      options={[
        { value: 'day', label: 'Day' },
        { value: 'month', label: 'Month' },
        { value: 'list', label: 'List' },
      ]}
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
    />
  );
}

const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

describe('Segmented (B17)', () => {
  it('the arrow keys move the choice, aria-checked follows it, and there is one Tab stop', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'View' });
    const day = within(group).getByRole('radio', { name: 'Day' });
    expect(day.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(day, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('month');
    const month = within(group).getByRole('radio', { name: 'Month' });
    expect(month.getAttribute('aria-checked')).toBe('true');
    expect(day.getAttribute('aria-checked')).toBe('false');
    expect(document.activeElement).toBe(month);
    // It wraps, as a native segmented control does.
    fireEvent.keyDown(day, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('list');
    expect(within(group).getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('the thumb slides from the option it left as a transform', async () => {
    render(<Harness />);
    await frame();
    fireEvent.click(screen.getByRole('radio', { name: 'List' }));
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes] = animate.mock.calls[0]!;
    expect(keyframes[0].transform).toMatch(/^translate\(-160px, 0px\)/);
    expect(keyframes[1].transform).toBe('none');
    expect(screen.getByRole('radio', { name: 'List' }).querySelector('.ch-seg__pill')).not.toBeNull();
  });
});
