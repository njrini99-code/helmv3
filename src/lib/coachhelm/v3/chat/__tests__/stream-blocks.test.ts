import { describe, expect, it } from 'vitest';
import { BlockWithholder } from '../stream-blocks';

const PAIRS = [['<<<CLAIMS>>>', '<<<END_CLAIMS>>>'], ['<<<CITES>>>', '<<<END_CITES>>>']] as const;

/** Feed `text` in chunks of `size` and collect what would be shown. */
function shown(text: string, size: number): string {
  const w = new BlockWithholder(PAIRS);
  let out = '';
  for (let i = 0; i < text.length; i += size) out += w.push(text.slice(i, i + size));
  return out + w.flush();
}

describe('BlockWithholder', () => {
  const prose = 'Owen is below the team average.';
  const claims = '<<<CLAIMS>>>[{"claim_id":"c1","value":-4.16}]<<<END_CLAIMS>>>';
  const cites = '<<<CITES>>>[{"v":"-4.16","ref":"e3","key":"sg_approach","subject":"p1"}]<<<END_CITES>>>';

  it.each([1, 2, 3, 5, 7, 13, 1000])('shows only the prose, at any chunk size (%i)', (size) => {
    expect(shown(`${prose}\n${claims}\n${cites}`, size)).toBe(`${prose}\n\n`);
    expect(shown(`${prose}${cites}${claims}`, size)).toBe(prose);
  });

  it('text after a closer resumes, so the live text and the stored content agree', () => {
    expect(shown(`before ${cites} after`, 4)).toBe('before  after');
  });

  it('an unterminated opener shows nothing from the opener on', () => {
    expect(shown(`${prose}<<<CITES>>>[{"v":"-4.1`, 3)).toBe(prose);
  });

  it('a lookalike that never becomes an opener is shown in full', () => {
    expect(shown('a <<<NOT a block> b', 2)).toBe('a <<<NOT a block> b');
    expect(shown('ends with <<<CIT', 3)).toBe('ends with <<<CIT');
  });

  it('inside reports whether a block is open', () => {
    const w = new BlockWithholder(PAIRS);
    w.push('x <<<CITES>>>[');
    expect(w.inside).toBe(true);
    w.push(']<<<END_CITES>>>');
    expect(w.inside).toBe(false);
  });
});
