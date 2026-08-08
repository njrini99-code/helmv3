/**
 * AvatarUpload — never tell a signed-in person they are signed out.
 *
 * A Shenandoah player hit "You must be logged in to upload files" partway
 * through onboarding on 2026-08-06 while holding a perfectly valid session.
 * The component called `supabase.auth.getUser()` — a NETWORK request — and
 * destructured its error away, so a dropped request was indistinguishable
 * from being logged out. That request is at its most fragile in exactly this
 * moment: the OS photo picker has just handed control back and the radio is
 * still waking up.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvatarUpload } from '@/components/ui/avatar-upload';

const getSession = vi.fn();
const upload = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession },
    storage: {
      from: () => ({
        upload,
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example/avatar.png' } }),
      }),
    },
  }),
}));

vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

function selectAPhoto() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'me.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

function renderUpload(onUploadComplete = vi.fn()) {
  render(<AvatarUpload name="Braeden Gillen" onUploadComplete={onUploadComplete} />);
  return onUploadComplete;
}

describe('AvatarUpload — a failed session read is not a logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ data: { path: 'u1/me.png' }, error: null });
  });

  it('uploads using the session the browser already holds', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    const onUploadComplete = renderUpload();

    selectAPhoto();

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('https://cdn.example/avatar.png'));
    // The uploaded path is scoped to the signed-in user's own folder.
    expect(upload.mock.calls[0]![0]).toMatch(/^u1\//);
  });

  it('does NOT claim you are logged out when the session read itself fails', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Failed to fetch' } });
    renderUpload();

    selectAPhoto();

    const message = await screen.findByText(/check your connection/i);
    expect(message).toBeTruthy();
    expect(screen.queryByText(/logged in|sign in again/i)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('does say to sign in again when there genuinely is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    renderUpload();

    selectAPhoto();

    expect(await screen.findByText(/sign in again/i)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });
});
