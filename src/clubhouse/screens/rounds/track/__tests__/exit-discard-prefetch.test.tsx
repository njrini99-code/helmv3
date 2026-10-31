import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyMotion, domAnimation } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../../__tests__/dialog-polyfill';
import { ExitSheet } from '../round-sheets';

// F-0045: Discard stays asked-first, but Rounds is fetched the moment the question opens, so the page after the delete is instant.
describe('Exit round · Discard', () => {
  it('opening the discard question warms the next page; nothing is deleted until it is confirmed', async () => {
    const user = userEvent.setup();
    const onConfirmOpen = vi.fn();
    const onDiscard = vi.fn();
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <ExitSheet open course="Pines" holes={[]} currentNumber={1} discarding={false} discardError={null} onSave={() => {}} onKeep={() => {}} onDiscard={onDiscard} onConfirmOpen={onConfirmOpen} />
        </div>
      </LazyMotion>,
    );
    await user.click(screen.getByRole('button', { name: /Discard round/ }));
    expect(onConfirmOpen).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
