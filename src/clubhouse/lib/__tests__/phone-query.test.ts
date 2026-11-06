import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH_DESK_QUERY, CH_PHONE_QUERY } from '../phone-query';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

describe('the phone query', () => {
  it('keeps an iPhone turned sideways on the phone layout (MOB-SHELL-8)', () => {
    expect(CH_PHONE_QUERY).toContain('(max-height: 500px) and (pointer: coarse)');
    expect(CH_DESK_QUERY).toContain('(pointer: fine)');
  });
  it('no stylesheet tests the phone by width alone, so CSS and useChPhone agree', () => {
    const bare = walk('src/clubhouse').flatMap((f) => (readFileSync(f, 'utf8').match(new RegExp('@media \\(m(?:ax|in)-width: 82[01]px\\) \\{', 'g')) ?? []).map(() => f));
    expect(bare).toEqual([]);
  });
});
