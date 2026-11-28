import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * Motion roles (dsx-07, design lab foundation 6): a rule names what moves (press, popup, sheet, page), and the role
 * carries the beat and the curve from the vocabulary (MOTION-AND-VISUAL 3.2). Under Reduce Motion the travelling roles
 * become the quick fade (3.11); the press keeps its beats, since a scale is not travel.
 */
const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const ROLES: Record<string, string> = {
  'press-in': 'var(--ch-dur-press) var(--ch-ease-out)',
  'press-out': 'var(--ch-dur-release) var(--ch-ease-ios)',
  'popup-in': 'var(--ch-dur-quick) var(--ch-ease-ios)',
  'popup-out': 'var(--ch-dur-press) var(--ch-ease-out)',
  'sheet-in': 'var(--ch-dur-reveal) var(--ch-ease-ios)',
  'sheet-out': 'var(--ch-dur-release) var(--ch-ease-out)',
  page: 'var(--ch-dur-reveal) var(--ch-ease-ios)',
};
const FADE = 'var(--ch-dur-quick) var(--ch-ease-out)';

describe('motion roles (dsx-07)', () => {
  it.each(Object.entries(ROLES))('--ch-motion-%s is %s', (role, value) => {
    expect(tokens).toContain(`--ch-motion-${role}: ${value};`);
  });
  it('Reduce Motion turns every travelling role into the quick fade and leaves the press alone', () => {
    const at = tokens.indexOf('@media (prefers-reduced-motion: reduce) {\n  [data-ui=\'clubhouse\'] {\n    --ch-motion-');
    expect(at).toBeGreaterThan(-1);
    const block = tokens.slice(at, tokens.indexOf('\n}\n', at));
    for (const role of ['popup-in', 'popup-out', 'sheet-in', 'sheet-out', 'page']) expect(block).toContain(`--ch-motion-${role}: ${FADE};`);
    expect(block).not.toMatch(/--ch-motion-press/);
  });
});
