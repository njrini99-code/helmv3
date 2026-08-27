import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cn, __CUSTOM_FONT_SIZE_TOKENS } from '../utils';

/**
 * `cn()` silently dropped this project's custom font-size tokens.
 *
 * tailwind-merge keeps one class per conflict group. It ships knowing the
 * DEFAULT scale, so `text-xs` lands in font-size and `text-warm-500` in
 * text-color and both survive. It has never heard of `text-caption`, so it
 * guesses from the `text-` prefix, files it under text-COLOR, and
 * `text-warm-500` supersedes it:
 *
 *     cn('text-caption', 'text-warm-500')  ->  'text-warm-500'
 *
 * The failure is invisible twice over — the JSX still reads correctly, and the
 * element still renders, just at inherited size. It affected every custom token
 * including `text-eyebrow` inside the shared <Eyebrow> primitive, so one
 * mis-grouping quietly unstyled that component everywhere it appears.
 *
 * These tests pin both halves: that the merge now preserves size+colour, and
 * that the token list has not drifted from the Tailwind config — because a
 * token added to the config and forgotten here is the exact same silent bug
 * returning.
 */

describe('cn — custom font-size tokens survive a merge with a text colour', () => {
  it.each([
    ['text-caption', 'text-warm-500'],
    ['text-eyebrow', 'text-warm-500'],
    ['text-h3', 'text-warm-900'],
    ['text-body', 'text-warm-600'],
    ['text-stat-xl', 'text-fw-danger'],
    ['text-microlabel', 'text-warm-400'],
  ])('keeps %s alongside %s', (size, colour) => {
    const out = cn(size, colour).split(' ');
    expect(out).toContain(size);
    expect(out).toContain(colour);
  });

  it('keeps the DEFAULT scale working exactly as before', () => {
    // The regression guard for the fix itself: registering custom tokens must
    // not disturb the sizes tailwind-merge already grouped correctly.
    const out = cn('text-xs', 'text-warm-500').split(' ');
    expect(out).toContain('text-xs');
    expect(out).toContain('text-warm-500');
  });

  it('still lets a later custom size override an earlier one', () => {
    // Conflict resolution must survive too — these belong to ONE group, so the
    // last wins. If both were kept, the fix would have traded a silent drop for
    // a silent double-declaration.
    expect(cn('text-caption', 'text-h3')).toBe('text-h3');
  });

  it('still lets a later colour override an earlier colour', () => {
    expect(cn('text-warm-500', 'text-warm-900')).toBe('text-warm-900');
  });

  it('resolves a custom size against a DEFAULT size as one group', () => {
    // `text-caption` and `text-sm` are both font sizes; keeping both would emit
    // two competing sizes and let CSS order decide.
    expect(cn('text-sm', 'text-caption')).toBe('text-caption');
    expect(cn('text-caption', 'text-sm')).toBe('text-sm');
  });
});

describe('cn — the token list must not drift from tailwind.config.ts', () => {
  /** Top-level keys of `theme.extend.fontSize`, read from the real config. */
  function configFontSizeTokens(): string[] {
    const source = readFileSync(resolve(__dirname, '../../../tailwind.config.ts'), 'utf8');
    const start = source.indexOf('fontSize: {');
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
    expect(end).toBeGreaterThan(open);

    const block = source.slice(open, end);
    const keys: string[] = [];
    let level = 0;
    for (const line of block.split('\n')) {
      const match = /^\s*'?([A-Za-z0-9-]+)'?\s*:/.exec(line);
      if (level === 1 && match) keys.push(match[1]!);
      level += (line.split('{').length - 1) - (line.split('}').length - 1);
    }
    return keys;
  }

  it('registers every NON-default font-size token from the config', () => {
    // Sizes tailwind-merge already knows are deliberately excluded from our
    // list — re-declaring them would be a second source of truth for classes it
    // handles correctly. Everything else must be registered or it is dropped.
    const DEFAULT_SCALE = new Set([
      'xs', 'sm', 'base', 'lg', 'xl', '2xs',
      '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
    ]);

    const custom = configFontSizeTokens().filter((token) => !DEFAULT_SCALE.has(token));
    const registered = new Set<string>(__CUSTOM_FONT_SIZE_TOKENS);
    const missing = custom.filter((token) => !registered.has(token));

    expect(
      missing,
      `tailwind.config.ts declares font-size token(s) that cn() does not register, so ` +
        `text-<token> will be silently dropped when merged with a text colour: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('does not register a token the config no longer declares', () => {
    // The other direction: a stale entry is harmless at runtime but means this
    // list has stopped describing the config, which is how the first drift
    // started.
    const declared = new Set(configFontSizeTokens());
    const stale = [...__CUSTOM_FONT_SIZE_TOKENS].filter((token) => !declared.has(token));
    expect(stale, `cn() registers token(s) absent from tailwind.config.ts: ${stale.join(', ')}`).toEqual([]);
  });
});
