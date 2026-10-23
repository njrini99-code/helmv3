import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../../../styles/whats-new.css'), 'utf8');

/** B22: a row's time sits on its title's first line when the title wraps, not centred on the row. */
describe('What’s new times (B22)', () => {
  it('the time and the text share a baseline', () => {
    expect(css).toMatch(/\.ch-wn \.ch-lgr__lead,\s*\.ch-wn \.ch-lgr__txt \{\s*align-self: baseline;/);
  });
});
