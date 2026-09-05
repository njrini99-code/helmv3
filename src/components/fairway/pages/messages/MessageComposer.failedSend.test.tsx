// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageComposer — a send that failed has to SAY it failed
 * ----------------------------------------------------------------------------
 * The composer already kept the draft when `onSend` resolved false: the clear
 * lives inside the success branch. But nothing ever said so, so a failed send
 * and a slow one looked identical — the text sat in the field, the thread did
 * not grow, and the only recovery was to guess that pressing Send a second
 * time would not double-post.
 *
 * The approved design's sixth composer state is exactly this: "Didn't send —
 * recoverable, and the text is never lost." These pin both halves, because
 * only one of them is new and a refactor could take the older one out from
 * under it.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';

/** The composer's textarea, by its placeholder. */
function field(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
}

describe('MessageComposer — a failed send is stated and recoverable', () => {
  it('keeps the draft and surfaces a Retry when onSend resolves false', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => false);
    render(<MessageComposer onSend={onSend} />);

    await user.type(field(), 'Bus leaves at six.');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).toHaveBeenCalledWith('Bus leaves at six.');
    // The words the sender typed are still theirs.
    expect(field().value).toBe('Bus leaves at six.');
    // And the failure is on screen, in a live region, with a way out.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Couldn’t send/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('clears the draft and shows no failure when the send succeeds', async () => {
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn(async () => true)} />);

    await user.type(field(), 'See you at the bus.');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(field().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops the notice the moment Retry starts, so the press visibly did something', async () => {
    const user = userEvent.setup();
    // Fails once, then succeeds — the ordinary shape of "you were offline".
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<MessageComposer onSend={onSend} />);

    await user.type(field(), 'Bring rain gear.');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(field().value).toBe('');
  });

  it('does not offer a failure state before anything has been sent', () => {
    render(<MessageComposer onSend={vi.fn(async () => true)} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
