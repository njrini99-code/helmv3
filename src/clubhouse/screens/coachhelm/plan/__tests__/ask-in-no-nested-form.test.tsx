import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AskIn } from '../PlanCard';

/**
 * capture-2c (11 Nov 2026): the practice thread's edit, swap and empty-bank sheets drew "<form> cannot be a descendant of <form>"
 * (23 hydration issues). The block and station asks were forms inside FormSheet's form. They are groups now; Enter sends and
 * never reaches the sheet's form, whose submit is its Done.
 */
describe('the ask inside a plan sheet', () => {
  it('is not a form, so it can sit inside the sheet’s form', () => {
    const sheetSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const { container } = render(
      <form onSubmit={sheetSubmit}>
        <AskIn label="Ask about this block" value="" onChange={() => {}} onSend={() => {}} />
      </form>,
    );
    expect(container.querySelectorAll('form form')).toHaveLength(0);
    expect(screen.getByRole('group', { name: 'Ask about this block' })).toBeTruthy();
  });

  it('sends on Enter and does not submit the sheet', () => {
    const sheetSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const send = vi.fn();
    render(
      <form onSubmit={sheetSubmit}>
        <AskIn label="Ask about this station" value="Shorter wedges?" onChange={() => {}} onSend={send} />
      </form>,
    );
    const input = screen.getByRole('textbox', { name: 'Ask about this station' });
    const enter = fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    // The keydown's default (implicit submission) is cancelled, so the sheet's form never submits.
    expect(enter).toBe(false);
    expect(sheetSubmit).not.toHaveBeenCalled();
  });

  it('sends nothing for an empty ask, and its key is a plain button', () => {
    const send = vi.fn();
    render(<AskIn label="Ask about this block" value="  " onChange={() => {}} onSend={send} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    const key = screen.getByRole('button', { name: 'Send' });
    expect(key.getAttribute('type')).toBe('button');
    expect((key as HTMLButtonElement).disabled).toBe(true);
  });
});
