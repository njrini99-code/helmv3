// @vitest-environment jsdom
/**
 * ============================================================================
 * InstrumentCluster — className passthrough (2026-09-10, primitives follow-up)
 * ----------------------------------------------------------------------------
 * `InstrumentCluster` already spread `...props` (including `className`,
 * merged via `cn(...)`) onto its root. This pins that contract distinctly
 * from `InstrumentCluster.tertiary.test.tsx`, which only asserts the
 * tertiary foot-row's own phone-tier classes.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InstrumentCluster } from '../InstrumentCluster';

describe('InstrumentCluster — className passthrough', () => {
  it('merges a caller className onto the root alongside the default classes', () => {
    const { container } = render(
      <InstrumentCluster primary={<div>primary</div>} className="my-custom-marker" />,
    );
    const root = container.querySelector('[data-slot="instrument-cluster"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toContain('my-custom-marker');
    expect(root.className).toContain('flex');
  });

  it('lets a conflicting caller utility win over the component default (last wins)', () => {
    const { container } = render(
      <InstrumentCluster primary={<div>primary</div>} className="gap-2" />,
    );
    const root = container.querySelector('[data-slot="instrument-cluster"]') as HTMLElement;
    // Default is `gap-5 sm:gap-6`; tailwind-merge keeps only the caller's
    // bare `gap-2` for the unprefixed gap slot.
    expect(root.className).toContain('gap-2');
    expect(root.className).not.toMatch(/(^|\s)gap-5(\s|$)/);
  });

  it('passes through other standard HTML attributes via the same spread', () => {
    const { container } = render(
      <InstrumentCluster primary={<div>primary</div>} data-testid="cockpit" />,
    );
    expect(container.querySelector('[data-testid="cockpit"]')).not.toBeNull();
  });

  it('renders byte-identical default classes when className is omitted', () => {
    const { container } = render(<InstrumentCluster primary={<div>primary</div>} />);
    const root = container.querySelector('[data-slot="instrument-cluster"]') as HTMLElement;
    expect(root.className).toContain('flex');
    expect(root.className).toContain('flex-col');
    expect(root.className).toContain('gap-5');
    expect(root.className).toContain('sm:gap-6');
  });
});
