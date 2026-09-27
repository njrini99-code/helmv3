import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cn, __CUSTOM_RADIUS_TOKENS, __CUSTOM_SHADOW_TOKENS, __CUSTOM_SCALE_TOKENS } from '../utils';

/**
 * `cn()` and the custom radius / shadow tokens.
 *
 * Radius: stock tailwind-merge does not recognise `rounded-card`, so it kept
 * it BESIDE a conflicting radius and the stylesheet decided. Tailwind v3 emits
 * same-plugin rules alphabetically, so `rounded-full` beat `rounded-card` and
 * `<Button className="rounded-card">` rendered as a pill.
 *
 * Shadow: stock tailwind-merge took `shadow-soft` for a shadow COLOUR, so a
 * real colour (`shadow-black/5`) deleted it and `shadow-none` could not
 * replace it.
 */

describe('cn — custom radius tokens conflict with every other radius', () => {
  it.each(['rounded-card', 'rounded-fw-sm', 'rounded-fw-md', 'rounded-fw-lg'])(
    'a later %s replaces the base rounded-full (the Fairway Button case)',
    (token) => {
      expect(cn('rounded-full', token)).toBe(token);
    },
  );

  it('a later default radius still replaces a custom one', () => {
    expect(cn('rounded-card', 'rounded-full')).toBe('rounded-full');
    expect(cn('rounded-fw-md', 'rounded-xl')).toBe('rounded-xl');
    expect(cn('rounded-card', 'rounded-[18px]')).toBe('rounded-[18px]');
  });

  it('custom radii replace each other', () => {
    expect(cn('rounded-card', 'rounded-fw-lg')).toBe('rounded-fw-lg');
  });

  it('side groups know the tokens too', () => {
    expect(cn('rounded-t-xl', 'rounded-t-card')).toBe('rounded-t-card');
    expect(cn('rounded-t-card', 'rounded-card')).toBe('rounded-card');
    // A side radius after a full one is a refinement, not a conflict.
    expect(cn('rounded-card', 'rounded-b-none')).toBe('rounded-card rounded-b-none');
  });

  it('variants stay separate', () => {
    expect(cn('rounded-full', 'sm:rounded-card')).toBe('rounded-full sm:rounded-card');
  });

  it('the Fairway Button honours a custom radius', () => {
    // Mirrors button.tsx: base 'rounded-full' ... then the caller className.
    const out = cn('relative inline-flex rounded-full border', 'min-h-[44px] px-5', 'rounded-card').split(' ');
    expect(out).toContain('rounded-card');
    expect(out).not.toContain('rounded-full');
  });
});

describe('cn — custom shadow tokens merge as shadows, not colours', () => {
  it('keeps a custom shadow alongside a shadow colour', () => {
    expect(cn('shadow-soft', 'shadow-black/5')).toBe('shadow-soft shadow-black/5');
    expect(cn('shadow-fw-modal', 'shadow-accent-500/20')).toBe('shadow-fw-modal shadow-accent-500/20');
  });

  it('shadow-none (and default sizes) replace a custom shadow, and vice versa', () => {
    expect(cn('shadow-soft', 'shadow-none')).toBe('shadow-none');
    expect(cn('shadow-sm', 'shadow-raise')).toBe('shadow-raise');
    expect(cn('shadow-flat', 'shadow-lg')).toBe('shadow-lg');
  });

  it('custom shadows replace each other', () => {
    expect(cn('shadow-card', 'shadow-soft')).toBe('shadow-soft');
    expect(cn('hover:shadow-soft', 'hover:shadow-raise')).toBe('hover:shadow-raise');
  });

  it('two colours still collapse to the last', () => {
    expect(cn('shadow-black/5', 'shadow-black/10')).toBe('shadow-black/10');
  });
});

describe('cn — the other custom scales', () => {
  it('a background gradient survives a background colour, in either order', () => {
    expect(cn('bg-canvas', 'bg-canvas-gradient')).toBe('bg-canvas bg-canvas-gradient');
    expect(cn('bg-canvas-gradient', 'bg-canvas')).toBe('bg-canvas-gradient bg-canvas');
    expect(cn('bg-shimmer', 'bg-none')).toBe('bg-none');
  });

  it.each([
    ['z-modal', 'z-50', 'z-50'],
    ['z-10', 'z-toast', 'z-toast'],
    ['duration-fast', 'duration-base', 'duration-base'],
    ['duration-300', 'duration-cinematic', 'duration-cinematic'],
    ['ease-ios', 'ease-out', 'ease-out'],
    ['ease-in-out', 'ease-ios-spring', 'ease-ios-spring'],
    ['animate-spin', 'animate-fade-up', 'animate-fade-up'],
    ['animate-shimmer', 'animate-none', 'animate-none'],
    ['backdrop-blur-sm', 'backdrop-blur-glass', 'backdrop-blur-glass'],
    ['tracking-tight', 'tracking-tightest', 'tracking-tightest'],
  ])('%s then %s keeps only %s', (a, b, winner) => {
    expect(cn(a, b)).toBe(winner);
  });

  it('backdrop-blur tokens do not leak into the blur filter', () => {
    expect(cn('blur-sm', 'backdrop-blur-glass')).toBe('blur-sm backdrop-blur-glass');
  });
});

describe('cn — the registered lists must not drift from tailwind.config.ts', () => {
  /** Top-level keys of `theme.extend.<block>`, read from the real config. */
  function configKeys(block: string): string[] {
    const source = readFileSync(resolve(__dirname, '../../../tailwind.config.ts'), 'utf8');
    const start = source.indexOf(`${block}: {`);
    expect(start).toBeGreaterThan(-1);
    const open = source.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const keys: string[] = [];
    for (const line of source.slice(open + 1, end).split('\n')) {
      const match = /^\s*'?([A-Za-z0-9-]+)'?\s*:/.exec(line);
      if (match) keys.push(match[1]!);
    }
    return keys;
  }

  // Keys tailwind-merge already recognises (t-shirt sizes, `full`, DEFAULT).
  const KNOWN = new Set([
    'DEFAULT', 'none', 'full', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl',
    'out', 'tighter', 'tight',
  ]);
  const isKnown = (key: string) => KNOWN.has(key) || /^\d+$/.test(key);

  it.each([
    ['borderRadius', __CUSTOM_RADIUS_TOKENS],
    ['boxShadow', __CUSTOM_SHADOW_TOKENS],
    ['backgroundImage', __CUSTOM_SCALE_TOKENS['bg-image']],
    ['zIndex', __CUSTOM_SCALE_TOKENS.z],
    ['transitionDuration', __CUSTOM_SCALE_TOKENS.duration],
    ['transitionTimingFunction', __CUSTOM_SCALE_TOKENS.ease],
    ['animation', __CUSTOM_SCALE_TOKENS.animate],
    ['backdropBlur', __CUSTOM_SCALE_TOKENS['backdrop-blur']],
    ['letterSpacing', __CUSTOM_SCALE_TOKENS.tracking],
  ] as const)('%s: every custom key is registered, and nothing stale', (block, registered) => {
    const custom = configKeys(block).filter((key) => !isKnown(key));
    expect([...registered].sort()).toEqual([...custom].sort());
  });
});
