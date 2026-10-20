import { describe, expect, it } from 'vitest';
import { draftCSS, exportCSS, validDraft } from '../preview/playground-tokens';

describe('playground proposals', () => {
  it('keeps untouched styles untouched and records explicit component mappings', () => {
    expect(draftCSS({})).toBe('');
    expect(exportCSS({})).toContain('No overrides');
    const css = draftCSS({ radius: 12, depth: 0, body: 16, gutter: 20, motion: 180 });
    expect(css).toContain('--ch-radius-lg: 16px');
    expect(css).toContain('--ch-type-body: 400 16px/1.5');
    expect(css).toContain('box-shadow: var(--ch-elevation-reading)');
    expect(css).toContain('rgb(28 25 18 / 0.000)');
    expect(css).not.toContain('transition: all');
    expect(css).toContain('--ch-play-duration: 180ms');
    expect(css).not.toContain('--ch-dur-base:');
  });
  it('rejects injected values, foreign keys and invalid ranges from iframe messages', () => {
    for (const value of [null, [], { radius: '12; color:red' }, { radius: NaN }, { body: 100 }, { evil: 1 }]) expect(validDraft(value)).toBe(false);
    expect(validDraft({})).toBe(true);
    expect(validDraft({ radius: 12, body: 16 })).toBe(true);
  });
});
