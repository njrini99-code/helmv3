/**
 * ============================================================================
 * Sheet (and the vaul-backed ui/drawer) — focus in on open, Escape closes,
 * focus back to the opener on close, opaque surface (UI audit 2026-09-23).
 * ----------------------------------------------------------------------------
 * Root cause: vaul's Root defaults `autoFocus` to false and its Content then
 * `preventDefault()`s Radix's open-autofocus, so focus stayed on the page
 * behind every Sheet/Drawer (More, Log progress, calendar event detail). On
 * close, Radix returns focus to `triggerRef`, which is null for externally
 * controlled overlays, so focus fell to <body>. `useDialogFocus` + passing
 * `autoFocus` fixes both at the primitive.
 *
 * The harness unmounts nothing itself: closing flips `open` via the real
 * Escape → onOpenChange(false) path, as every caller does.
 * ============================================================================
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

function SheetHarness(props: { nav?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        leadingAction={
          props.nav ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          ) : undefined
        }
        trailingAction={props.nav ? <Button type="button">Save</Button> : undefined}
      >
        <Sheet.Body>
          <Button type="button">First field</Button>
          <Button type="button">Second field</Button>
        </Sheet.Body>
      </Sheet>
    </>
  );
}

function DrawerHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Log progress
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerTitle>Log progress</DrawerTitle>
          <Button type="button">Value</Button>
        </DrawerContent>
      </Drawer>
    </>
  );
}

const realMatchMedia = window.matchMedia;
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: realMatchMedia });
});

function mockCoarsePointer() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('Sheet — dialog focus contract', () => {
  it('moves focus into the sheet on open (first tabbable, fine pointer)', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));

    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
    expect(screen.getByRole('button', { name: 'First field' })).toHaveFocus();
  });

  it('on a coarse pointer, focuses the sheet container (no keyboard pop on open)', async () => {
    mockCoarsePointer();
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));

    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    await waitFor(() => {
      expect(dialog).toHaveFocus();
    });
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    const opener = screen.getByRole('button', { name: 'Open sheet' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Filters' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('is an opaque surface, never glass', async () => {
    render(
      <Sheet open title="Opaque">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Opaque' });
    expect(dialog.className).toContain('bg-surface');
    expect(dialog.className).not.toMatch(/glass|backdrop-blur|surface-lift/);
    // Sheet bodies contain their own scroll — no chaining to the page.
    expect(dialog.querySelector('[data-slot="sheet-body"]')!.className).toContain(
      'overscroll-contain',
    );
  });

  it('HIG header: leading Cancel + trailing primary replace the corner close button', async () => {
    const user = userEvent.setup();
    render(<SheetHarness nav />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(dialog.querySelector('[data-slot="sheet-grabber"]')).not.toBeNull();
  });
});

describe('Sheet — Escape is one level per keypress', () => {
  it('does not close while a nested popup is open; the next Escape does', async () => {
    const user = userEvent.setup();
    function PopupHarness() {
      const [open, setOpen] = React.useState(true);
      const [popupOpen, setPopupOpen] = React.useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen} title="With popup">
          <Sheet.Body>
            {/* Base UI stamps data-popup-open on a trigger while its popup is open. */}
            <Button
              type="button"
              data-popup-open={popupOpen ? '' : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setPopupOpen(false);
              }}
            >
              Stat
            </Button>
          </Sheet.Body>
        </Sheet>
      );
    }
    render(<PopupHarness />);
    const dialog = await screen.findByRole('dialog', { name: 'With popup' });
    screen.getByRole('button', { name: 'Stat' }).focus();

    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stat' })).not.toHaveAttribute('data-popup-open');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'With popup' })).not.toBeInTheDocument();
    });
  });
});

describe('ui/drawer — dialog focus contract', () => {
  it('moves focus into the drawer on open', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    await user.click(screen.getByRole('button', { name: 'Log progress' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const opener = screen.getByRole('button', { name: 'Log progress' });
    await user.click(opener);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });
});
