import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { enterStyle, ENTER_STAGGER_CAP, ENTER_STAGGER_MS } from '../motion';

/**
 * Every class in the calendar material vocabulary that moves (animation or a
 * transform/position transition) must be switched off under
 * `prefers-reduced-motion: reduce`. A new animated class added without a
 * reduced-motion line fails here instead of shipping.
 */
const css = readFileSync(resolve(__dirname, '../CalendarSurfaces.module.css'), 'utf8');

function classesWithMotion(source: string): string[] {
  const names = new Set<string>();
  const rule = /\.([a-zA-Z0-9_-]+)(?::[a-z-]+)?\s*\{([^}]*)\}/g;
  for (const match of source.matchAll(rule)) {
    const [, name, body] = match;
    if (/\b(animation|transition)\s*:/.test(body ?? '') && !/\b(animation|transition)\s*:\s*none/.test(body ?? '')) {
      names.add(name!);
    }
  }
  return [...names].sort();
}

describe('CalendarSurfaces reduced motion', () => {
  const reducedBlock = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const outsideReduced = css.replace(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/, '');

  it('has a reduced-motion block', () => {
    expect(reducedBlock.trim().length).toBeGreaterThan(0);
  });

  it('switches off every animated or transitioned class', () => {
    const moving = classesWithMotion(outsideReduced);
    expect(moving.length).toBeGreaterThan(0);
    for (const name of moving) {
      const off = new RegExp(`\\.${name}\\s*\\{[^}]*\\b(animation|transition)\\s*:\\s*none`);
      expect(reducedBlock, `.${name} is not disabled under prefers-reduced-motion`).toMatch(off);
    }
  });

  it('keeps the drag readout usable without transparency', () => {
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)/);
    expect(css).toMatch(/\.lensLabel \{[^}]*backdrop-filter: none/);
  });
});

describe('enterStyle stagger', () => {
  it('returns nothing for a row rendered alone', () => {
    expect(enterStyle(undefined)).toBeUndefined();
  });
  it('staggers 30ms per row and caps the delay', () => {
    expect(enterStyle(0)).toEqual({ animationDelay: '0ms' });
    expect(enterStyle(3)).toEqual({ animationDelay: `${3 * ENTER_STAGGER_MS}ms` });
    expect(enterStyle(40)).toEqual({ animationDelay: `${ENTER_STAGGER_CAP * ENTER_STAGGER_MS}ms` });
  });
});
