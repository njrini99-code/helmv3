import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { KeyboardDoneBar } from './KeyboardDoneBar';

function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: coarse && query === '(pointer: coarse)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function Form({ onDone, scoped = false }: { onDone?: () => void; scoped?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref}>
        <input aria-label="Distance" inputMode="numeric" />
        <input aria-label="Agree" type="checkbox" />
      </div>
      <input aria-label="Outside" />
      <KeyboardDoneBar onDone={onDone} scope={scoped ? ref : undefined} />
    </>
  );
}

describe('KeyboardDoneBar', () => {
  it('appears while a text field is focused on a touch device and sits on the published keyboard height', () => {
    stubPointer(true);
    render(<Form />);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    act(() => screen.getByLabelText('Distance').focus());
    const done = screen.getByRole('button', { name: 'Done' });
    const bar = done.parentElement as HTMLElement;
    expect(bar.style.bottom).toBe('var(--keyboard-height, 0px)');
    expect(done.className).toContain('min-h-11');
  });

  it('blurs the field and calls onDone on Done', () => {
    stubPointer(true);
    const onDone = vi.fn();
    render(<Form onDone={onDone} />);
    const field = screen.getByLabelText('Distance');
    act(() => field.focus());
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.activeElement).not.toBe(field);
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('ignores checkboxes and fields outside its scope', () => {
    stubPointer(true);
    render(<Form scoped />);
    act(() => screen.getByLabelText('Agree').focus());
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    act(() => screen.getByLabelText('Outside').focus());
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('renders nothing on a fine pointer', () => {
    stubPointer(false);
    render(<Form />);
    act(() => screen.getByLabelText('Distance').focus());
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});
