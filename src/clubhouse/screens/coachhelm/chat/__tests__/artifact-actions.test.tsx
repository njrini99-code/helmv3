import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  askArtifactFolders: vi.fn(async () => ({ folders: [{ name: 'Player reports', count: 3 }] })),
  saveAskArtifact: vi.fn(async () => ({ success: true })),
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
