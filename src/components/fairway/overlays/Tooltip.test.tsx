// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- The trigger/child here is a FIXTURE,
   not a product surface: the point of these cases is that the wrapper
   accepts an arbitrary element and does not reach into it. Swapping in the
   design-system <Button> would test that component's markup instead of this
   one's contract. The rule stands everywhere the user can actually see. */
/**
 * ============================================================================
 * Tooltip — desktop-only discoverability hint (Radix Tooltip)
 * ----------------------------------------------------------------------------
 * `open` (controlled) renders the chip deterministically, independent of
 * Radix's own hover-intent timers. Real hover timing is Radix's own
 * well-tested concern, not this wrapper's — this file pins the wrapper's own
 * contract: content/role/classes when open, and the hover-capability gate.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { Tooltip } from './Tooltip';

function mockHover(canHover: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(hover: hover)' ? canHover : false,
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

afterEach(() => {
  // Restore the global (hover: hover) → false default from src/test/setup.tsx.
  mockHover(false);
});

describe('Tooltip — hover-capable pointer', () => {
  it('renders the chip with role="tooltip" and the label text when open', () => {
    mockHover(true);
    render(
      <Tooltip content="Duplicate event" open>
        <button>Duplicate</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Duplicate event');
  });

  it('renders no chip when closed', () => {
    mockHover(true);
    render(
      <Tooltip content="Duplicate event">
        <button>Duplicate</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('uses the ink-chip recipe: opaque, no arrow', () => {
    mockHover(true);
    render(
      <Tooltip content="Rename" open>
        <button>Rename</button>
      </Tooltip>,
    );
    const chip = screen.getByRole('tooltip');
    expect(chip.className).toContain('bg-text-primary');
    expect(chip.className).toContain('text-elevated');
    expect(chip.className).toContain('shadow-soft');
    expect(chip.querySelector('svg')).toBeNull();
  });
});

describe('Tooltip — no hover surface (coarse pointer / touch)', () => {
  it('renders only the trigger, with no Radix wiring at all', () => {
    mockHover(false);
    render(
      <Tooltip content="Duplicate event" open>
        <button>Duplicate</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
