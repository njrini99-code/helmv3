import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * Lane B leftover: the type codemod gave these fixed-height pills their step's 13px leading in place of a leading equal
 * to the box (11px/20px and /24px on main), so their one line sat at the top of the box. They centre it instead.
 */
const rule = (file: string, sel: string) => {
  const src = readFileSync(join(ROOT, 'styles', file), 'utf8');
  const at = src.indexOf(`\n${sel} {`);
  return src.slice(at, src.indexOf('}', at));
};

describe('one-line boxes centre their line', () => {
  it.each([
    ['rounds.css', '.ch-rd-pill', '20px'],
    ['hub.css', '.ch-hb-steps li', '24px'],
  ])('%s %s', (file, sel, h) => {
    const body = rule(file, sel);
    expect(body).toContain(`height: ${h};`);
    expect(body).toMatch(/display: inline-flex;\s*align-items: center;/);
  });
});
