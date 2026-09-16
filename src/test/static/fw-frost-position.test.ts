import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * globals.css is unlayered, so a bare `.fw-frost { position: relative }`
 * outranks Tailwind's `fixed` / `sticky` / `absolute` utilities on any element
 * that carries the frost class directly. That put a frost Sheet panel at the
 * bottom of the document and un-stuck sticky frost toolbars (2026-09-10).
 * The positioned default must stay behind a guard that yields to those
 * utilities.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} block exists`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('frost materials never override positioning utilities', () => {
  it('the bare .fw-frost and .fw-frost-static blocks set no position', () => {
    expect(block('.fw-frost')).not.toMatch(/position\s*:/);
    expect(block('.fw-frost-static')).not.toMatch(/position\s*:/);
  });

  it('the positioned default is guarded so fixed, sticky and absolute win', () => {
    expect(css).toMatch(
      /\.fw-frost:where\(:not\(\.fixed, \.sticky, \.absolute\)\),\s*\n\.fw-frost-static:where\(:not\(\.fixed, \.sticky, \.absolute\)\)\s*\{\s*position: relative;\s*\}/,
    );
  });
});
