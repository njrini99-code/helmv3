import { describe, expect, it } from 'vitest';
import { BlockWithholder, withholdBlocks } from '../stream-blocks';

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

describe('withholdBlocks (the player stream stage)', () => {
  type C = { type: string; id?: string; delta?: string };
  async function run(chunks: C[], onText?: (d: string) => void): Promise<C[]> {
    const src = new ReadableStream<C>({ start: (c) => { chunks.forEach((x) => c.enqueue(x)); c.close(); } });
    const out: C[] = [];
    await src.pipeThrough(withholdBlocks<C>(PAIRS, onText)).pipeTo(new WritableStream({ write: (c) => void out.push(c) }));
    return out;
  }
  const delta = (d: string): C => ({ type: 'text-delta', id: 't1', delta: d });
  const text = (cs: C[]) => cs.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('');

  it('drops the block, passes every other chunk, and releases the held tail before text-end', async () => {
    const cites = '<<<CITES>>>[{"v":"1"}]<<<END_CITES>>>';
    const all = `You putt 32.6 per round.${cites}`;
    const parts = all.match(/.{1,5}/g)!.map(delta);
    const out = await run([{ type: 'start' }, { type: 'text-start', id: 't1' }, ...parts, { type: 'text-end', id: 't1' }, { type: 'finish' }]);
    expect(text(out)).toBe('You putt 32.6 per round.');
    expect(out.map((c) => c.type).filter((t) => t !== 'text-delta')).toEqual(['start', 'text-start', 'text-end', 'finish']);
  });

  it('a held tail that was never an opener arrives before its text-end, not after', async () => {
    const out = await run([{ type: 'text-start', id: 't1' }, delta('ends with <<<CIT'), { type: 'text-end', id: 't1' }]);
    expect(text(out)).toBe('ends with <<<CIT');
    expect(out[out.length - 1]).toEqual({ type: 'text-end', id: 't1' });
  });

  it('onText sees the raw text, blocks included', async () => {
    let raw = '';
    await run([delta('a<<<CITES>>>[]<<<END_CITES>>>')], (d) => (raw += d));
    expect(raw).toBe('a<<<CITES>>>[]<<<END_CITES>>>');
  });
});
