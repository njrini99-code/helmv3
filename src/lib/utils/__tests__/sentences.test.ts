import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAUSAL } from '@/lib/coachhelm/reads/player-cause';
import { splitSentences, splitSentencesBefore } from '../sentences';

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!['__tests__', 'test'].includes(name)) sources(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('sentences without a lookbehind', () => {
  it('splits after a stop, keeping the stop and decimals', () => {
    expect(splitSentences('Up 0.9 strokes. Why? Pace!')).toEqual(['Up 0.9 strokes.', 'Why?', 'Pace!']);
  });
  it('keeps a closing mark on its sentence', () => {
    expect(splitSentences('He said "go." Then left.', '"”’)')).toEqual(['He said "go."', 'Then left.']);
  });
  it('splits only before an allowed start', () => {
    expect(splitSentencesBefore('About ~0.6. then more. Next one', 'A-Z')).toEqual(['About ~0.6. then more.', 'Next one']);
  });
  it('"points to" after a figure is a measure, not a cause', () => {
    expect(CAUSAL.test('23 points to the Tour')).toBe(false);
    expect(CAUSAL.test('That points to pace control')).toBe(true);
    expect(CAUSAL.test('Driven by pace')).toBe(true);
  });
  it('iOS before 16.4 can parse every script: no lookbehind in app source', () => {
    const hits = sources(join(process.cwd(), 'src')).filter((f) => /\(\?<[!=]/.test(readFileSync(f, 'utf8')));
    expect(hits.filter((f) => !f.endsWith('src/lib/utils/__tests__/sentences.test.ts'))).toEqual([]);
  });
});
