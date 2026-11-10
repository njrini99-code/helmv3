/**
 * Keeps machine-readable blocks the model appends to its prose (`<<<CLAIMS>>>…<<<END_CLAIMS>>>`, `<<<CITES>>>…<<<END_CITES>>>`) out of
 * the text a coach or player reads, while the text streams. Pure and chunk-boundary safe.
 *
 * `push` takes each text delta and returns what can be shown now. A delta can end half way through an opener (a provider flushes at any
 * byte), so the last `longestOpener - 1` characters of otherwise showable text are held back until the next delta says what they are.
 * Once an opener is found everything is held, never shown, until its closer; text after the closer resumes, as it did before this was
 * a helper (a coach must not see less live than the stored `content` holds). `flush` returns the held tail when the text part ends, and
 * nothing while inside a block: an unterminated opener shows nothing from the opener on.
 */
export class BlockWithholder {
  private pending = '';
  private body = '';
  private block: readonly [open: string, close: string] | null = null;
  private readonly keep: number;

  constructor(private readonly pairs: ReadonlyArray<readonly [open: string, close: string]>) {
    this.keep = Math.max(...pairs.map(([open]) => open.length)) - 1;
  }

  /** True while inside a block that has not closed. */
  get inside(): boolean {
    return this.block !== null;
  }

  push(delta: string): string {
    let shown = '';
    let remaining: string | null = delta;
    while (remaining !== null) {
      if (!this.block) {
        this.pending += remaining;
        remaining = null;
        let at = -1;
        let found: readonly [string, string] | null = null;
        for (const pair of this.pairs) {
          const i = this.pending.indexOf(pair[0]);
          if (i !== -1 && (at === -1 || i < at)) {
            at = i;
            found = pair;
          }
        }
        if (found) {
          shown += this.pending.slice(0, at);
          this.block = found;
          this.body = this.pending.slice(at + found[0].length);
          this.pending = '';
          remaining = ''; // look at once for a closer in what followed the opener
          continue;
        }
        const safe = Math.max(0, this.pending.length - this.keep);
        if (safe > 0) {
          shown += this.pending.slice(0, safe);
          this.pending = this.pending.slice(safe);
        }
      } else {
        this.body += remaining;
        remaining = null;
        const close = this.body.indexOf(this.block[1]);
        if (close !== -1) {
          remaining = this.body.slice(close + this.block[1].length);
          this.body = '';
          this.block = null;
        }
      }
    }
    return shown;
  }

  /** The held-back tail, when the text part ends. Empty inside an unterminated block. */
  flush(): string {
    if (this.block) return '';
    const out = this.pending;
    this.pending = '';
    return out;
  }
}

/**
 * `BlockWithholder` as a stream stage, for a UI message stream that is merged as it is: text deltas lose the blocks, a part's held tail
 * is released just before its `text-end` (a delta after its part has ended is rejected by the ai SDK), every other chunk passes untouched.
 * `onText` sees each raw delta, blocks included, for the caller that audits the whole text.
 */
export function withholdBlocks<T extends { type?: string; id?: string; delta?: unknown }>(pairs: ReadonlyArray<readonly [open: string, close: string]>, onText?: (delta: string) => void): TransformStream<T, T> {
  const held = new BlockWithholder(pairs);
  return new TransformStream<T, T>({
    transform(chunk, controller) {
      if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
        onText?.(chunk.delta);
        const shown = held.push(chunk.delta);
        if (shown) controller.enqueue({ ...chunk, delta: shown });
        return;
      }
      if (chunk.type === 'text-end') {
        const tail = held.flush();
        if (tail) controller.enqueue({ type: 'text-delta', id: chunk.id, delta: tail } as T);
      }
      controller.enqueue(chunk);
    },
  });
}
