import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setCategoryChannelMock = vi.fn();
const setQuietModeMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/app/golf/actions/v3/notification-prefs', () => ({
  setCategoryChannel: setCategoryChannelMock,
  setQuietMode: setQuietModeMock,
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('@/components/fairway', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    // eslint-disable-next-line helm/no-raw-button
    <button type="button" onClick={onClick}>
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
    toastErrorMock.mockClear();
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
      expect(toastErrorMock).toHaveBeenCalledWith('No player profile');
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
});
