import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W31 (preview walk, 11 Nov): Tournament was a heavy black pill, Practice grey, Qualifier outlined green; the black pill
// was the loudest thing on the page. One chip now, three tints at one weight.

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds.css'), 'utf8');
const rule = (sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  if (at < 0) throw new Error(`no rule ${sel}`);
  return css.slice(at, css.indexOf('}', at));
};

describe('W31 the round type chips share one weight', () => {
  it('tournament is a green tint with forest ink, not a black fill', () => {
    const t = rule('.ch-rd-pill.is-tournament');
    expect(t).toContain('background: var(--ch-green-100)');
    expect(t).toContain('color: var(--ch-forest-800)');
    expect(t).not.toMatch(/ink-900|ivory/);
  });

  it('no type adds a ring of its own', () => {
    expect(rule('.ch-rd-pill.is-qualifier')).not.toContain('box-shadow');
    expect(rule('.ch-rd-pill.is-tournament')).not.toContain('box-shadow');
    expect(css).not.toMatch(/\.ch-rd-pill\.is-qualifier \{[^}]*box-shadow/);
  });
});
