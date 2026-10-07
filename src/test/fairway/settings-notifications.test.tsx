import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setCategoryChannelMock = vi.fn();
const setQuietModeMock = vi.fn();
const setAllChannelsMock = vi.fn();
const toastDangerMock = vi.fn();

vi.mock('@/app/golf/actions/v3/notification-prefs', () => ({
  setCategoryChannel: setCategoryChannelMock,
  setQuietMode: setQuietModeMock,
  setAllChannels: setAllChannelsMock,
}));

vi.mock('@/components/fairway/feedback/ToastStack', () => ({
  fairwayToast: {
    danger: toastDangerMock,
    success: vi.fn(),
  },
}));

vi.mock('@/components/fairway', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    // eslint-disable-next-line helm/no-raw-button
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Surface: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
    'aria-label': string;
  }) => (
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
  ViewHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

describe('FairwaySettingsNotifications', () => {
  beforeEach(() => {
    setCategoryChannelMock.mockResolvedValue({ ok: true });
    setCategoryChannelMock.mockClear();
    setQuietModeMock.mockResolvedValue({ ok: true });
    setQuietModeMock.mockClear();
    setAllChannelsMock.mockResolvedValue({ ok: true });
    setAllChannelsMock.mockClear();
    toastDangerMock.mockClear();
  });

  it('hides the coach-only weekly digest category from the player matrix', async () => {
    const { FairwaySettingsNotifications } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsNotifications'
    );

    render(<FairwaySettingsNotifications prefs={{}} quietMode={false} />);

    expect(screen.queryByText('Weekly digest (coach only)')).not.toBeInTheDocument();
  });

  it('rolls back a failed optimistic cell save and shows a toast', async () => {
    setCategoryChannelMock.mockResolvedValueOnce({ ok: false, error: 'No player profile' });
    const { FairwaySettingsNotifications } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsNotifications'
    );

    render(<FairwaySettingsNotifications prefs={{}} quietMode={false} />);

    const pushToggle = screen.getByRole('button', { name: 'New insight landed · Push' });
    expect(pushToggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pushToggle);

    await waitFor(() => {
      expect(toastDangerMock).toHaveBeenCalledWith('No player profile');
    });
    expect(pushToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps unrelated controls enabled while one cell is saving', async () => {
    let resolveSave: (value: { ok: boolean }) => void = () => {};
    setCategoryChannelMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { FairwaySettingsNotifications } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsNotifications'
    );

    render(<FairwaySettingsNotifications prefs={{}} quietMode={false} />);

    const savingToggle = screen.getByRole('button', { name: 'New insight landed · Push' });
    const otherToggle = screen.getByRole('button', { name: 'Goal achieved · Push' });
    fireEvent.click(savingToggle);

    await waitFor(() => {
      expect(savingToggle).toBeDisabled();
    });
    expect(otherToggle).not.toBeDisabled();

    resolveSave({ ok: true });
    await waitFor(() => {
      expect(savingToggle).not.toBeDisabled();
    });
  });

  // ── DATA-08 — a failed toggle reverts only its own cell ──────────────────
  it('reverts only the failed cell, keeping a concurrent toggle that succeeded', async () => {
    let resolvePush: (value: { ok: boolean; error?: string }) => void = () => {};
    setCategoryChannelMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePush = resolve;
        }),
      )
      .mockResolvedValueOnce({ ok: true });
    const { FairwaySettingsNotifications } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsNotifications'
    );

    render(<FairwaySettingsNotifications prefs={{}} quietMode={false} />);

    // Same category, sibling channels: the stale-snapshot bug clobbered these.
    const push = screen.getByRole('button', { name: 'New insight landed · Push' });
    const email = screen.getByRole('button', { name: 'New insight landed · Email' });
    // A different category too.
    const goalPush = screen.getByRole('button', { name: 'Goal achieved · Push' });

    fireEvent.click(push); // pending
    fireEvent.click(email); // succeeds
    await waitFor(() => expect(email).not.toBeDisabled());
    setCategoryChannelMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(goalPush); // succeeds
    await waitFor(() => expect(goalPush).not.toBeDisabled());

    resolvePush({ ok: false, error: 'Network down' });
    await waitFor(() => expect(toastDangerMock).toHaveBeenCalledWith('Network down'));

    expect(push).toHaveAttribute('aria-pressed', 'false');
    expect(email).toHaveAttribute('aria-pressed', 'true');
    expect(goalPush).toHaveAttribute('aria-pressed', 'true');
  });

  // ── DATA-09 — bulk writes and cell writes never overlap ──────────────────
  it('locks every cell while a bulk mute is pending', async () => {
    let resolveBulk: (value: { ok: boolean }) => void = () => {};
    setAllChannelsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBulk = resolve;
      }),
    );
    const { FairwaySettingsNotifications } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsNotifications'
    );

    render(<FairwaySettingsNotifications prefs={{}} quietMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mute push' }));

    const cell = screen.getByRole('button', { name: 'Goal achieved · Email' });
    await waitFor(() => expect(cell).toBeDisabled());
    fireEvent.click(cell);
    expect(setCategoryChannelMock).not.toHaveBeenCalled();

    resolveBulk({ ok: true });
    await waitFor(() => expect(cell).not.toBeDisabled());
  });

  it('locks the bulk actions while a cell write is pending', async () => {
    let resolveSave: (value: { ok: boolean }) => void = () => {};
    setCategoryChannelMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { FairwaySettingsNotifications } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsNotifications'
    );

    render(<FairwaySettingsNotifications prefs={{}} quietMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'New insight landed · Push' }));

    const mutePush = screen.getByRole('button', { name: 'Mute push' });
    const muteEmail = screen.getByRole('button', { name: 'Mute email' });
    const reset = screen.getByRole('button', { name: 'Reset defaults' });
    await waitFor(() => expect(mutePush).toBeDisabled());
    expect(muteEmail).toBeDisabled();
    expect(reset).toBeDisabled();

    resolveSave({ ok: true });
    await waitFor(() => expect(mutePush).not.toBeDisabled());
    expect(setAllChannelsMock).not.toHaveBeenCalled();
  });
});
