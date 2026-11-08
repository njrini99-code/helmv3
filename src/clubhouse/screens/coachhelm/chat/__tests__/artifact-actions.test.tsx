import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  askArtifactFolders: vi.fn(async () => ({ folders: [{ name: 'Player reports', count: 3 }] })),
  saveAskArtifact: vi.fn(async () => ({ success: true, id: 'doc-1', folder: 'Player reports', savedAt: new Date().toISOString() })),
  undoAskArtifact: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/coachhelm-ask-artifacts', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/x' }));

import { ArtifactView } from '../parts/Artifact';
import { ToastProvider } from '../../../../ui/Toast';

const artifact = (kind: 'player_report' | 'practice_plan', body: unknown) => ({ id: 'a1', kind, title: 'Eli, October', versions: [{ id: 'v1', at: '', body }] });

// jsdom has no <dialog> methods.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** FID-ASK-4: the pane's footer is Save draft and Publish for anything but a plan, whose own row saves it. */
describe('the artifact pane footer', () => {
  it('a report has Save draft and Publish; Publish asks through the chat, so it lands on the confirm card', async () => {
    const onPublish = vi.fn();
    render(
      <ToastProvider>
        <ArtifactView artifact={artifact('player_report', 'Words') as never} phone={false} body={() => null} onClose={() => undefined} onPublish={onPublish} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Save draft…' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Publish…' }));
    expect(onPublish).toHaveBeenCalledWith('Eli, October');
    expect(actions.saveAskArtifact).not.toHaveBeenCalled();
  });

  it('a plan has neither', () => {
    render(
      <ToastProvider>
        <ArtifactView artifact={artifact('practice_plan', { blocks: [] }) as never} phone={false} body={() => null} onClose={() => undefined} onPublish={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Save draft…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish…' })).toBeNull();
  });

  it('Save draft reads the folders and saves into the chosen one', async () => {
    render(
      <ToastProvider>
        <ArtifactView artifact={artifact('player_report', 'Words') as never} phone={false} body={() => null} onClose={() => undefined} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save draft…' }));
    const save = await screen.findByRole('button', { name: 'Save to Player reports' }, { timeout: 2000 });
    await userEvent.click(save);
    await waitFor(() => expect(actions.saveAskArtifact).toHaveBeenCalledWith({ title: 'Eli, October', body: 'Words', folder: 'Player reports' }));
  });
});

/** S-ASK.save: the docked card. It saves at once, shows a receipt with Undo for 8 seconds, and Undo takes the draft back out. */
describe('the save card', () => {
  const open = async () => {
    render(
      <ToastProvider>
        <ArtifactView artifact={artifact('player_report', 'Words') as never} phone={false} body={() => null} onClose={() => undefined} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save draft…' }));
  };

  it('docks above the footer, defaults to the most used folder and names it in the primary and the On save line', async () => {
    await open();
    expect(await screen.findByRole('button', { name: 'Save to Player reports' })).toBeTruthy();
    expect(screen.getByText(/only you can see it, in/i).textContent).toContain('Documents · Player reports');
  });

  it('saves, then the receipt names the folder and Undo takes the draft out again', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Player reports' }));
    expect(await screen.findByText('Draft saved · Documents · Player reports')).toBeTruthy();
    expect(screen.getByText('Only you can see it. Players are told when you publish.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(() => expect(actions.undoAskArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' })));
    expect(await screen.findByText('Removed. Nothing was saved.')).toBeTruthy();
  });

  it('a late Undo says so and leaves the draft saved', async () => {
    actions.undoAskArtifact.mockResolvedValueOnce({ success: false, error: 'Too late to undo. It’s saved in Documents.' } as never);
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Player reports' }));
    await userEvent.click(await screen.findByRole('button', { name: /Undo/ }));
    expect(await screen.findByText('Too late to undo. It’s saved in Documents.')).toBeTruthy();
    expect(screen.getByText('Draft saved · Documents · Player reports')).toBeTruthy();
  });

  it('New folder is a name, made by saving into it; an existing name is refused', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: /Save to/ , expanded: false }));
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    await userEvent.type(field, 'player reports');
    expect(screen.getByText('You already have that folder.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(field);
    await userEvent.type(field, 'November{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Save to November' }));
    await waitFor(() => expect(actions.saveAskArtifact).toHaveBeenCalledWith({ title: 'Eli, October', body: 'Words', folder: 'November' }));
  });

  it('a failed save keeps the card open with the reason and nothing claimed', async () => {
    actions.saveAskArtifact.mockResolvedValueOnce({ success: false, error: 'That didn’t save.' } as never);
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Player reports' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Draft saved/)).toBeNull();
  });

  it('Cancel closes the card without saving', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Save draft' })).toBeNull();
    expect(actions.saveAskArtifact).not.toHaveBeenCalled();
  });
});
