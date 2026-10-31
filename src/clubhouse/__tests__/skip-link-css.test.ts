import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** F-0065: Skip to content is in view on the frame focus lands (no slide in), and keeps its eased exit. */
describe('skip link', () => {
  const shell = readFileSync(join(ROOT, 'styles/shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('appears at once on focus', () => {
    expect(shell).toMatch(/\.ch-skip:focus-visible\s*\{[^}]*transform: none;[^}]*transition: none;/);
  });
  it('still eases away when focus leaves', () => {
    expect(shell).toMatch(/\.ch-skip\s*\{[^}]*transition: transform var\(--ch-dur-quick\) var\(--ch-ease\);/);
  });
});
