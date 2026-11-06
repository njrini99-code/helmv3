import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('confirm card fields on a phone', () => {
  it('share a label column as wide as the longest label, so a long one never runs into its value', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-ask-v2.css'), 'utf8');
    expect(css).toContain('.conf:not(.is-pub) .evd .ls { grid-template-columns: max-content minmax(0, 1fr);');
    expect(css).toContain('.conf:not(.is-pub) .evd .f { grid-column: 1 / -1; grid-template-columns: subgrid; }');
  });
});
