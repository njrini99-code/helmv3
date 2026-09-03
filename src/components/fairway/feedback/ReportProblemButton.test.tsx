import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getFeedbackMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  getFeedback: (...args: unknown[]) => getFeedbackMock(...args),
}));

const toastInfoMock = vi.fn();
vi.mock('@/components/fairway/feedback/ToastStack', () => ({
  fairwayToast: { info: (...args: unknown[]) => toastInfoMock(...args) },
}));

import { ReportProblemButton } from './ReportProblemButton';

describe('ReportProblemButton', () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    getFeedbackMock.mockReset();
    toastInfoMock.mockReset();
    // jsdom throws "Not implemented: navigation" on a real assignment —
    // stub the setter so the fallback path can be asserted without it.
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: originalHref };
  });

  afterEach(() => {
    (window as unknown as { location: { href: string } }).location = { href: originalHref };
  });

  it('renders the "Report a problem" label', () => {
    render(<ReportProblemButton />);
    expect(screen.getByRole('button', { name: 'Report a problem' })).toBeTruthy();
  });

  it('opens the Sentry feedback dialog when the SDK and integration are available', async () => {
    const appendToDom = vi.fn();
    const open = vi.fn();
    const createForm = vi.fn().mockResolvedValue({ appendToDom, open });
    getFeedbackMock.mockReturnValue({ createForm });

    render(<ReportProblemButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

    await waitFor(() => expect(createForm).toHaveBeenCalled());
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(appendToDom).toHaveBeenCalled();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it('falls back to mailto + a toast when Sentry.getFeedback() returns undefined (SDK unavailable)', async () => {
    getFeedbackMock.mockReturnValue(undefined);

    render(<ReportProblemButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

    await waitFor(() => expect(toastInfoMock).toHaveBeenCalled());
    expect(window.location.href).toContain('mailto:admin@helmsportslabs.com');
  });

  it('falls back to mailto + a toast when createForm() resolves to nothing', async () => {
    getFeedbackMock.mockReturnValue({ createForm: vi.fn().mockResolvedValue(undefined) });

    render(<ReportProblemButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

    await waitFor(() => expect(toastInfoMock).toHaveBeenCalled());
    expect(window.location.href).toContain('mailto:admin@helmsportslabs.com');
  });

  it('never throws and still falls back when createForm() rejects', async () => {
    getFeedbackMock.mockReturnValue({
      createForm: vi.fn().mockRejectedValue(new Error('widget failed to load')),
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ReportProblemButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

    await waitFor(() => expect(toastInfoMock).toHaveBeenCalled());
    expect(window.location.href).toContain('mailto:admin@helmsportslabs.com');
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('never throws when Sentry.getFeedback itself is undefined (SDK failed to init)', async () => {
    getFeedbackMock.mockImplementation(() => {
      throw new Error('client not initialized');
    });

    render(<ReportProblemButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

    await waitFor(() => expect(toastInfoMock).toHaveBeenCalled());
    expect(window.location.href).toContain('mailto:admin@helmsportslabs.com');
  });
});
