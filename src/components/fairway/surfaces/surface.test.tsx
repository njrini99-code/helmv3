import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Surface } from './surface';

describe('Surface variants', () => {
  it('keeps the default card unchanged: 24 padding, hairline plus the lit-edge whisper', () => {
    const { container } = render(<Surface>Card</Surface>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('p-6');
    expect(el.className).toContain('rounded-card');
    expect(el.className).toContain('[box-shadow:var(--fw-shadow-card)]');
    expect(el.getAttribute('data-variant')).toBeNull();
  });

  it('draws the Stage as radius 20 plus a hairline only, with 16 padding', () => {
    const { container } = render(<Surface variant="stage">Stage</Surface>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-variant')).toBe('stage');
    expect(el.className).toContain('rounded-card');
    expect(el.className).toContain('border-border-subtle');
    expect(el.className).toContain('p-4');
    expect(el.className).not.toMatch(/shadow/);
  });

  it('ignores elevation on the Stage and honours an explicit padding', () => {
    const { container } = render(
      <Surface variant="stage" elevation="shadow" padding="none">
        Stage
      </Surface>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toContain('shadow-soft');
    expect(el.className).toContain('p-0');
  });
});
