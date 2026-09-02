/**
 * ============================================================================
 * Badge / Chip — wrapped labels must not spill out of the pill (2026-08-26)
 * ----------------------------------------------------------------------------
 * Both primitives are `whitespace-nowrap` by default, but several call sites
 * legitimately override that (`whitespace-normal`) because their pill sits in
 * a ~165px grid column where the label cannot fit on one line — e.g.
 * `TeamCategoryLeakBand`'s "1 of 7 need work".
 *
 * With a FIXED height (`h-5`/`h-6`) the wrapped second line rendered OUTSIDE
 * the rounded background: on the coach Brief, "work" printed on the champagne
 * card behind the amber pill (owner device report). The sizes are therefore
 * `min-h-*`, which is byte-identical for every single-line badge and lets a
 * wrapping one grow.
 *
 * jsdom cannot measure layout, so this pins the class contract that produces
 * it — the same way the ModalShell z-index regression is pinned. A future edit
 * back to a fixed height fails here.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, Chip } from './badge';

describe('Badge sizing allows a wrapped label to grow the pill', () => {
  it.each(['sm', 'md'] as const)('size=%s uses a minimum height, not a fixed one', (size) => {
    render(
      <Badge size={size} className="whitespace-normal">
        1 of 7 need work
      </Badge>,
    );
    const badge = screen.getByText('1 of 7 need work');

    expect(badge.className).toMatch(/\bmin-h-\d/);
    // A bare `h-5`/`h-6` is what clipped the wrapped line. `min-h-*` must not
    // be accompanied by a fixed height, or the clip comes straight back.
    expect(badge.className).not.toMatch(/(?:^|\s)h-\d/);
  });

  it('keeps the caller-supplied whitespace-normal override', () => {
    render(<Badge className="whitespace-normal">2 of 7 need work</Badge>);
    expect(screen.getByText('2 of 7 need work').className).toMatch(/\bwhitespace-normal\b/);
  });
});

describe('Chip sizing follows the same rule', () => {
  // Chip queries its ROOT by data-slot: unlike Badge it wraps its label in an
  // inner `truncate` span, so `getByText` returns that span, not the pill.
  // That inner truncate is also why Chip clips rather than spilling — the
  // min-height here is defensive parity with Badge, not a live bug fix.
  it.each(['sm', 'md'] as const)('size=%s uses a minimum height, not a fixed one', (size) => {
    const { container } = render(
      <Chip size={size}>A label long enough to wrap</Chip>,
    );
    const chip = container.querySelector('[data-slot="fw-chip"]');

    expect(chip).not.toBeNull();
    expect(chip?.className).toMatch(/\bmin-h-\d/);
    expect(chip?.className).not.toMatch(/(?:^|\s)h-\d/);
  });

  it('keeps the remove button on a FIXED square — that is the WCAG hit area', () => {
    const { container } = render(
      <Chip onRemove={() => {}}>Removable</Chip>,
    );
    const remove = container.querySelector('button');
    expect(remove?.className).toMatch(/\bh-7\b/);
    expect(remove?.className).toMatch(/\bw-7\b/);
  });
});
