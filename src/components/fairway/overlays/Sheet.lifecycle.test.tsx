/**
 * Sheet lifecycle additions (audit W3, MOT-06): `onExited` fires once after
 * every close path, including a parent flipping `open`; `customTitle` leaves
 * exactly one dialog title.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

function Controlled({ onExited }: { onExited: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Open
      </Button>
      <Button type="button" onClick={() => setOpen(false)} data-testid="parent-close">
        Parent close
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Filters" onExited={onExited}>
        <Sheet.Body>
          <Button type="button">Field</Button>
        </Sheet.Body>
      </Sheet>
    </>
  );
}

describe('Sheet — onExited', () => {
  it('does not fire on mount while closed', async () => {
    const onExited = vi.fn();
    render(<Controlled onExited={onExited} />);
    await new Promise((r) => setTimeout(r, 700));
    expect(onExited).not.toHaveBeenCalled();
  });

  it('fires once after an Escape close', async () => {
    const onExited = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onExited={onExited} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog', { name: 'Filters' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1), { timeout: 1500 });
    await new Promise((r) => setTimeout(r, 700));
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('fires after a controlled close from the parent (no Escape, no scrim)', async () => {
    const onExited = vi.fn();
    const { rerender } = render(
      <Sheet open title="Filters" onExited={onExited}>
        <Sheet.Body>Body</Sheet.Body>
      </Sheet>,
    );
    await screen.findByRole('dialog', { name: 'Filters' });
    rerender(
      <Sheet open={false} title="Filters" onExited={onExited}>
        <Sheet.Body>Body</Sheet.Body>
      </Sheet>,
    );
    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1), { timeout: 1500 });
  });

  it('does not fire when re-opened before the exit finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onExited = vi.fn();
      const view = (open: boolean) => (
        <Sheet open={open} title="Filters" onExited={onExited}>
          <Sheet.Body>Body</Sheet.Body>
        </Sheet>
      );
      const { rerender } = render(view(true));
      rerender(view(false));
      act(() => {
        vi.advanceTimersByTime(200);
      });
      rerender(view(true));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onExited).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Sheet — customTitle', () => {
  it('renders exactly one dialog title: the caller’s own', async () => {
    render(
      <Sheet open title="Class detail" customTitle>
        <Sheet.Title>Biology 101</Sheet.Title>
        <Sheet.Body>Body</Sheet.Body>
      </Sheet>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Biology 101' });
    expect(dialog.querySelectorAll('[data-slot="sheet-title"]')).toHaveLength(1);
    expect(screen.queryByText('Class detail')).not.toBeInTheDocument();
    expect(screen.queryByText('Sheet')).not.toBeInTheDocument();
  });

  it('without customTitle, the automatic title still labels the dialog', async () => {
    render(
      <Sheet open title="Filters">
        <Sheet.Body>Body</Sheet.Body>
      </Sheet>,
    );
    expect(await screen.findByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });
});
