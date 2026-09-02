import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FieldCopy } from '@/app/admin/errors/_components/FieldCopy';

describe('FieldCopy', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  it('renders an explicit em-dash and no copy control when the value is absent', () => {
    render(<FieldCopy label="Request id" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('treats an empty string the same as absent — dash, no button', () => {
    render(<FieldCopy label="Request id" value="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the value and a labelled copy button when present', () => {
    render(<FieldCopy label="Request id" value="req-abc123" />);
    expect(screen.getByText('req-abc123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Request id' })).toBeInTheDocument();
  });

  it('copies the exact value on click and shows a transient copied state', async () => {
    render(<FieldCopy label="Trace id" value="trace-xyz789" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Trace id' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('trace-xyz789'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied Trace id' })).toBeInTheDocument(),
    );
  });
});
