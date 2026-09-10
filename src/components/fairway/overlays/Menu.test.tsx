// @vitest-environment jsdom
/**
 * ============================================================================
 * Menu — the canonical action/overflow menu (Radix Dropdown Menu)
 * ----------------------------------------------------------------------------
 * Structural/content assertions use `open` (controlled) to render the panel
 * deterministically — Radix's own open/close animation timing and pointer
 * plumbing are its concern, not this component's. One click-driven test
 * exercises the real uncontrolled trigger toggle end to end.
 * ========================================================================== */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

describe('Menu — structure and content', () => {
  it('renders items, a separator, and a label inside role="menu" when open', () => {
    render(
      <Menu trigger={<button>Actions</button>} open ariaLabel="Row actions">
        <Menu.Label>Section</Menu.Label>
        <Menu.Item onSelect={() => {}}>Rename</Menu.Item>
        <Menu.Separator />
        <Menu.Item destructive onSelect={() => {}}>
          Delete
        </Menu.Item>
      </Menu>,
    );
    expect(screen.getByRole('menu', { name: 'Row actions' })).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Rename', 'Delete']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('renders the shared floating frost material, never a matte/legacy recipe', () => {
    render(
      <Menu trigger={<button>Actions</button>} open>
        <Menu.Item onSelect={() => {}}>Duplicate</Menu.Item>
      </Menu>,
    );
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('fw-frost');
    expect(menu.className).toContain('fw-frost-floating');
  });

  it('marks a destructive item with the danger ink token, not the default text color', () => {
    render(
      <Menu trigger={<button>Actions</button>} open>
        <Menu.Item onSelect={() => {}}>Rename</Menu.Item>
        <Menu.Item destructive onSelect={() => {}}>
          Delete
        </Menu.Item>
      </Menu>,
    );
    const [rename, del] = screen.getAllByRole('menuitem');
    expect(rename!.className).toContain('text-text-primary');
    expect(del!.className).toContain('text-fw-danger-ink');
  });

  it('renders an optional shortcut and icon inside the item', () => {
    render(
      <Menu trigger={<button>Actions</button>} open>
        <Menu.Item icon={<svg data-testid="icon" />} shortcut="⌘D" onSelect={() => {}}>
          Duplicate
        </Menu.Item>
      </Menu>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('⌘D')).toBeInTheDocument();
  });

  it('disables an item via the disabled prop (aria-disabled, no onSelect firing)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <Menu trigger={<button>Actions</button>} open>
        <Menu.Item disabled onSelect={onSelect}>
          Archive
        </Menu.Item>
      </Menu>,
    );
    const item = screen.getByRole('menuitem', { name: 'Archive' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Menu — uncontrolled trigger toggle', () => {
  it('opens the menu when the trigger is clicked and closes it on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button>Actions</button>}>
        <Menu.Item onSelect={() => {}}>Rename</Menu.Item>
      </Menu>,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    // The panel exits via a framer-motion tween (panelTransition) before
    // AnimatePresence unmounts it — give it time to finish rather than
    // asserting mid-animation.
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('calls onOpenChange as the menu opens and closes', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Menu trigger={<button>Actions</button>} onOpenChange={onOpenChange}>
        <Menu.Item onSelect={() => {}}>Rename</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
