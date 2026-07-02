import { describe, it, expect } from 'vitest';
import { pressableClass } from './pressable';

describe('pressableClass — interaction-layer press/hover physics', () => {
  it('defaults to team ink, tint on, lift off', () => {
    const cls = pressableClass();
    expect(cls).toContain('active:scale-[0.98]');
    expect(cls).toContain('hover:bg-grade-plus/[0.05]');
    expect(cls).toContain('focus-visible:ring-grade-plus');
    expect(cls).not.toContain('hover:-translate-y-px');
  });

  it('switches ink to pursuit (clay) for the War Room lane', () => {
    const cls = pressableClass({ ink: 'pursuit' });
    expect(cls).toContain('hover:bg-pursuit/[0.05]');
    expect(cls).toContain('focus-visible:ring-pursuit');
    expect(cls).not.toContain('grade-plus');
  });

  it('drops the hover tint when tint=false', () => {
    const cls = pressableClass({ tint: false });
    expect(cls).not.toContain('hover:bg-grade-plus/[0.05]');
    // Press-down + focus ring stay regardless.
    expect(cls).toContain('active:scale-[0.98]');
    expect(cls).toContain('focus-visible:ring-grade-plus');
  });

  it('adds the hover-only lift class when lift=true', () => {
    const cls = pressableClass({ lift: true });
    expect(cls).toContain('[@media(hover:hover)]:hover:-translate-y-px');
  });

  it('merges a caller className via cn() without dropping the base classes', () => {
    const cls = pressableClass({ className: 'rounded-fw-md' });
    expect(cls).toContain('rounded-fw-md');
    expect(cls).toContain('active:scale-[0.98]');
  });

  it('always includes the focus-visible ring width, never a naked ring color', () => {
    const cls = pressableClass();
    expect(cls).toContain('focus-visible:ring-2');
  });
});
