'use client';

import Link from 'next/link';
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { splitReadMarkers } from '@/lib/coachhelm/v3/chat/read-markers';
import { parseProse, splitAtMentions, splitInline, type ProseBlock } from '../../../data/coachhelm-chat-thread';
import { settledText } from './turn-timing';
import { rebuiltHref } from '../../../shell/nav';
import { ScrollRegion } from '../../../ui/ScrollRegion';

/** A roster name goes to that player's stats when Stats is rebuilt; until then it is plain text, never a dead link. */
export const playerStatsHref = (id: string) => rebuiltHref(`/golf/dashboard/stats?player=${id}`);

type Chip = { known: ReadonlySet<string>; draw: (ref: string) => ReactNode };

/** A read's chip keeps the word before it: a no-break space in place of the space the model wrote, so a chip never starts a line alone. */
const NBSP = '\u00a0';

/**
 * One block of an answer (a paragraph, a list, a table, a heading). Memoised on its own text, so while an answer streams only
 * the block being written re-renders: the paragraphs above it are finished and are not touched again.
 */
const ProseBlockView = memo(function ProseBlockView({ sig, lead, streaming, tail, chip, playersByName }: { /** The block, serialised: the memo key and the source. */ sig: string; lead: boolean; streaming: boolean; /** The live dot goes after this block's last word. */ tail: boolean; chip?: Chip; playersByName: Record<string, string> }) {
  const b = useMemo(() => JSON.parse(sig) as ProseBlock, [sig]);
  const names = useMemo(() => Object.keys(playersByName), [playersByName]);
  // A read's chip is drawn once in a paragraph, list or table: six bullets from one read are one source, not six chips.
  const seen = new Set<string>();
  // While it streams, each word is its own inline box that fades in once, when it first exists (MOTION MO-5-1). The keys hold, so
  // a word already in never replays; words that arrive in one burst mount in one frame and so fade as one group.
  const words = (t: string): ReactNode => (streaming ? t.split(/(\s+)/).map((w, k) => (/\S/.test(w) ? <span key={k} className="w">{w}</span> : w)) : t);
  const plainInline = (s: string) =>
    splitInline(s, names).map((seg, i) => {
      const id = seg.mention ? playersByName[seg.mention] : undefined;
      const href = id ? playerStatsHref(id) : null;
      const body = href ? (
        <Link href={href} className="ch-th-mention">
          {words(seg.text)}
        </Link>
      ) : (
        words(seg.text)
      );
      return seg.bold ? <strong key={i}>{body}</strong> : <Fragment key={i}>{body}</Fragment>;
    });
  const inline = (s: string): ReactNode => {
    if (!chip) return plainInline(s);
    const segs = splitReadMarkers(s, chip.known);
    // The punctuation that closes a sentence after its chip belongs to the chip's line: it is drawn with the chip, unbreakable.
    const closing = (i: number) => {
      const next = segs[i + 1];
      return next && !('ref' in next) ? (/^[,.;:!?)]+/.exec(next.text)?.[0] ?? '') : '';
    };
    return segs.map((seg, i) => {
      if (!('ref' in seg)) {
        const prev = segs[i - 1];
        let text = prev && 'ref' in prev ? seg.text.slice(closing(i - 1).length) : seg.text;
        // The space before a chip becomes a no-break space, so the chip wraps with the word it follows.
        if (segs[i + 1] && 'ref' in segs[i + 1]!) text = text.replace(/[ \t]+$/, NBSP);
        return <Fragment key={`t${i}`}>{plainInline(text)}</Fragment>;
      }
      if (seen.has(seg.ref)) return closing(i) || null;
      seen.add(seg.ref);
      return (
        <span key={`r${i}`} className="ch-ak-keep">
          {chip.draw(seg.ref)}
          {closing(i)}
        </span>
      );
    });
  };
  // Joined to the last word by a no-break space (one the face draws), so the dot never wraps to a line of its own.
  const dot = tail ? (
    <span className="ch-ak-pend" aria-hidden="true">
      {NBSP}
      <i className="ch-ak-live" />
    </span>
  ) : null;
  if (b.kind === 'table')
    return (
      // An old answer's pipe table, drawn as a table: a header row, hairline rows, figures set right on tabular numbers,
      // and on a phone it scrolls sideways inside itself instead of widening the answer.
      <ScrollRegion label="Table" className="ch-th-mdtable">
        <table className="ch-th-table">
          <thead>
            <tr>
              {b.header.map((h, c) => (
                <th key={c} scope="col" className={b.numeric[c] ? 'is-num' : undefined}>
                  {inline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, j) => (
              <tr key={j}>
                {r.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row">
                      {inline(cell)}
                    </th>
                  ) : (
                    <td key={c} className={b.numeric[c] ? 'is-num' : undefined}>
                      {inline(cell)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    );
  if (b.kind === 'heading')
    return (
      <h4 className="ch-th-h">
        {inline(b.text)}
        {dot}
      </h4>
    );
  if (b.kind === 'list') {
    const items = b.items.map((item, j) => (
      <li key={j}>
        {inline(item)}
        {j === b.items.length - 1 && dot}
      </li>
    ));
    return b.ordered ? <ol className="ch-th-list is-ordered">{items}</ol> : <ul className="ch-th-list">{items}</ul>;
  }
  return (
    <p className={lead ? 'ch-th-p ch-th-p--lead' : 'ch-th-p'}>
      {inline(b.text)}
      {dot}
    </p>
  );
});

/** A stop that ends a short word, not a sentence ("vs. Jackson", "St. Andrews"). */
const NOT_AN_END = /(?:^|\s)(?:vs|St|Mt|Dr|Mr|Ms|Mrs|No|approx|e\.g|i\.e)$/i;

/**
 * Where a paragraph's second sentence ends: a stop, a space, then the next sentence's first character. A figure's point ("+0.99")
 * has no space after it, so it is never an end. Null while the paragraph has two sentences or fewer.
 */
export function afterSecondSentence(text: string): number | null {
  const ends = /[.!?]["”’)]?\s+(?=["“(]?[A-Z0-9])/g;
  let n = 0;
  for (let m = ends.exec(text); m; m = ends.exec(text)) {
    if (NOT_AN_END.test(text.slice(0, m.index))) continue;
    n += 1;
    if (n === 2) return m.index + m[0].length;
  }
  return null;
}

/**
 * The lead (the leaf's first paragraph, set larger in coachhelm-ask-v2.css) is the answer's first two sentences: the answer and
 * the figure it turns on, as the instructions order them. The model writes its answer as one paragraph, so without this the
 * whole answer was set at the lead's size (owner's preview, 11 Nov 2026). The cut is made as the words arrive: the third
 * sentence's first word opens the body paragraph, so no word already drawn changes size.
 */
export function splitLead(blocks: ProseBlock[]): ProseBlock[] {
  const first = blocks[0];
  if (!first || first.kind !== 'paragraph') return blocks;
  const at = afterSecondSentence(first.text);
  if (at === null) return blocks;
  return [{ kind: 'paragraph', text: first.text.slice(0, at).trimEnd() }, { kind: 'paragraph', text: first.text.slice(at) }, ...blocks.slice(1)];
}

/**
 * An answer's text: paragraphs, lists, pipe tables, **bold** and roster names. Editorial, not a bubble. The
 * match is against the real roster passed in, so "Wake Forest" is never a link to nowhere.
 *
 * While the answer streams: half-written syntax is held back (`settledText`), each burst of words fades in once and never
 * moves, only the block being written re-renders, and when nothing has arrived for a moment the live dot sits after the last
 * word (`pending`). A finished or reloaded answer draws still, as plain text.
 */
export function AskProse({ text, lead = false, playersByName, streaming = false, pending = false, chip }: { /** Ask v2: draws `[e2]` as a read chip. */ chip?: Chip; text: string; lead?: boolean; playersByName: Record<string, string>; streaming?: boolean; /** The turn is live and no words have arrived for a moment. */ pending?: boolean }) {
  const shown = streaming ? settledText(text) : text;
  // The answer's opening text (`lead`) gives its first two sentences a paragraph of their own, which a leaf sets larger. The
  // paragraph's class never changes: its size comes from its place, and the cut is made as the words arrive (splitLead).
  const sigs = useMemo(() => (lead ? splitLead(parseProse(shown)) : parseProse(shown)).map((b) => JSON.stringify(b)), [shown, lead]);
  return (
    <div className="ch-th-prose" data-streaming={streaming ? '' : undefined}>
      {sigs.map((sig, i) => (
        <ProseBlockView key={i} sig={sig} lead={false} streaming={streaming} tail={pending && i === sigs.length - 1} chip={chip} playersByName={playersByName} />
      ))}
    </div>
  );
}

/** The coach's own line: "@Jonah Okafor" from the composer's picker is drawn as a mention. */
export function AskUserText({ text, names }: { text: string; names: string[] }) {
  return (
    <>
      {splitAtMentions(text, names).map((seg, i) =>
        seg.mention ? (
          <span key={i} className="ch-th-at">
            {seg.text}
          </span>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
