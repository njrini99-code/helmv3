import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A19: VoiceOver reads an `aria-label` on a plain span or div unreliably, so each labelled one has a role: `img` for one
 * picture (a score, a count, a mini chart), `group` for a labelled set, `status` for a loading region.
 */

import { ScoreMark } from '../ui/ScoreMark';

const ROOT = join(process.cwd(), 'src/clubhouse');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p);
    return p.endsWith('.tsx') ? [p] : [];
  });

/** Each `<span` or `<div` opening tag, read line by line to its first `>` that is not an arrow's. */
function tags(src: string): Array<{ line: number; text: string }> {
  const lines = src.split('\n');
  const out: Array<{ line: number; text: string }> = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/<(span|div)\b/g)) {
      let text = l.slice(m.index);
      for (let j = i + 1; !/[^=]>|^>/.test(text.replace(/=>/g, '~~')) && j < Math.min(lines.length, i + 12); j++) text += `\n${lines[j]}`;
      out.push({ line: i + 1, text: text.replace(/=>/g, '~~').split(/(?<!=)>/)[0]! });
    }
  });
  return out;
}

describe('labelled spans and divs have a role (A19)', () => {
  it('no <span> or <div> carries aria-label without role', () => {
    const bare = files(ROOT).flatMap((f) =>
      tags(readFileSync(f, 'utf8'))
        .filter((t) => /aria-label=/.test(t.text) && !/\brole=/.test(t.text))
        .map((t) => `${f.slice(ROOT.length + 1)}:${t.line}`),
    );
    expect(bare).toEqual([]);
  });

  it('a score mark is an image VoiceOver reads, and a hole not played prints the em dash', () => {
    render(<ScoreMark score={3} par={4} />);
    expect(screen.getByRole('img', { name: /birdie/i }).textContent).toBe('3');
    render(<ScoreMark score={null} par={4} />);
    expect(screen.getByRole('img', { name: 'Not played' }).textContent).toBe('—');
  });
});
