// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('@/app/golf/actions/round-coach-note', () => ({ saveRoundCoachNote: save }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/rounds/x' }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { ToastProvider } from '../ui/Toast';
import { CoachNote } from '../screens/rounds/CoachNote';

const show = (props: Partial<React.ComponentProps<typeof CoachNote>>) =>
  render(
    <ToastProvider>
      <CoachNote roundId="round-1" note={null} canWrite={false} playerFirst="Jonah" {...props} />
    </ToastProvider>,
  );

beforeEach(() => {
  save.mockReset();
  router.refresh.mockReset();
});
afterEach(cleanup);

describe('CoachNote', () => {
  it('shows a player nothing when their coach has left no note', () => {
    const { container } = show({});
    expect(container.querySelector('.ch-rv-cn')).toBeNull();
  });

  it('CH-11523 shows a player the note under "From your coach", with no editor', () => {
    show({ note: 'Good lag putting.' });
    expect(screen.getByRole('heading', { name: 'From your coach' })).toBeTruthy();
    expect(screen.getByText('Good lag putting.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CH-11222 tells a player when the note could not be checked, instead of saying there is none', () => {
    show({ error: true });
    expect(screen.getByText(/couldn’t check for a coach note/i)).toBeTruthy();
    expect(screen.queryByText(/No note on this round yet/)).toBeNull();
  });

  it('CH-11523 offers a coach "Add a note" on a round with none', () => {
    show({ canWrite: true });
    expect(screen.getByRole('heading', { name: 'Coach note' })).toBeTruthy();
    expect(screen.getByText('No note on this round yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a note' })).toBeTruthy();
  });

  it('CH-11523 keeps Save off until there is text, saves the trimmed note, refreshes the page and shows what was saved', async () => {
    save.mockResolvedValue({ success: true, data: { note: 'Work on the wedges.' } });
    const user = userEvent.setup();
    show({ canWrite: true });
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    const saveBtn = screen.getByRole('button', { name: 'Save note' });
    expect(saveBtn).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '  Work on the wedges.  ');
    await user.click(saveBtn);
    await waitFor(() => expect(save).toHaveBeenCalledWith('round-1', 'Work on the wedges.'));
    await waitFor(() => expect(screen.getByText('Work on the wedges.')).toBeTruthy());
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('CH-11023 keeps the editor and the text when the save fails', async () => {
    save.mockResolvedValue({ success: false, error: 'Could not save the note. Please try again.' });
    const user = userEvent.setup();
    show({ canWrite: true });
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    await user.type(screen.getByRole('textbox'), 'Keep this');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('starts an edit from the current note and Cancel leaves it unchanged', async () => {
    const user = userEvent.setup();
    show({ canWrite: true, note: 'First draft.' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('First draft.');
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Changed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('First draft.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});
