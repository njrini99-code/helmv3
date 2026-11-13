/**
 * Enter is how an input method commits a word. useImeGuard says an Enter belongs to the IME on every engine: Chromium and
 * Gecko (isComposing on the event), the legacy 229 mark, and WebKit, which ends composition BEFORE the commit keydown, so
 * only the composition events can tell. Each signal is tested on its own, so a guard that handled one engine would fail.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImeGuard } from '../ime-guard';

function Field({ onSend }: { onSend: () => void }) {
  const ime = useImeGuard();
  return (
    <textarea
      aria-label="field"
      {...ime.composition}
      onKeyDown={(e) => {
        if (ime.composing(e)) return;
        if (e.key === 'Enter') onSend();
      }}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const field = () => screen.getByLabelText('field');

describe('useImeGuard', () => {
  it('a plain Enter is not composing: it sends', () => {
    const onSend = vi.fn();
    render(<Field onSend={onSend} />);
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 13 });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Chromium and Gecko: the commit keydown carries isComposing', () => {
    const onSend = vi.fn();
    render(<Field onSend={onSend} />);
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 13, isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('the legacy mark: keyCode 229', () => {
    const onSend = vi.fn();
    render(<Field onSend={onSend} />);
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('WebKit: composition has already ended when the commit Enter arrives, with neither mark set, and it still does not send', () => {
    vi.useFakeTimers();
    const onSend = vi.fn();
    render(<Field onSend={onSend} />);
    fireEvent.compositionStart(field());
    fireEvent.compositionEnd(field());
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 13 });
    expect(onSend).not.toHaveBeenCalled();
    // The next Enter a person types (a later task) sends.
    act(() => {
      vi.runAllTimers();
    });
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 13 });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('while composing, every key belongs to the IME', () => {
    const onSend = vi.fn();
    render(<Field onSend={onSend} />);
    fireEvent.compositionStart(field());
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 13 });
    expect(onSend).not.toHaveBeenCalled();
  });
});
