import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyReportButton } from '@/app/admin/_components/CopyReportButton';

describe('CopyReportButton', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('labeled variant copies the exact report string on click', async () => {
    const report = '# report body\nfull text';
    render(<CopyReportButton report={report} label="Copy report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(report));
  });

  it('labeled variant shows a transient "Copied" state that reverts after ~1.5s', async () => {
    render(<CopyReportButton report="x" label="Copy report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Copied'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Copy report'), {
      timeout: 3000,
    });
  });

  it('icon variant requires an accessible name and flips it to "Copied to clipboard" transiently', async () => {
    render(<CopyReportButton report="icon report" variant="icon" label="Copy incident report: Foo" />);
    const button = screen.getByRole('button', { name: 'Copy incident report: Foo' });
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('icon report'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied to clipboard' })).toBeInTheDocument());
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Copy incident report: Foo' })).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('falls back to document.execCommand when navigator.clipboard is unavailable (iOS Safari)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    // jsdom does not implement execCommand.
    (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;

    render(<CopyReportButton report="fallback text" label="Copy report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
  });

  it('does not throw and stays in the un-copied state when the clipboard write is denied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(false);
    (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;

    render(<CopyReportButton report="denied text" label="Copy report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalled());
    expect(screen.getByRole('button')).toHaveTextContent('Copy report');
  });

  it('is keyboard accessible (a native button responds to Enter via click semantics)', () => {
    render(<CopyReportButton report="x" label="Copy report" />);
    const button = screen.getByRole('button', { name: 'Copy report' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });
});
