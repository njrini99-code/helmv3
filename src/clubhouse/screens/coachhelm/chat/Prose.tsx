'use client';

import Link from 'next/link';
import { Fragment, useMemo, type ReactNode } from 'react';
import { splitReadMarkers } from '@/lib/coachhelm/v3/chat/read-markers';
import { parseProse, splitAtMentions, splitInline } from '../../../data/coachhelm-chat-thread';
import { rebuiltHref } from '../../../shell/nav';
import { ScrollRegion } from '../../../ui/ScrollRegion';

/** A roster name goes to that player's stats when Stats is rebuilt; until then it is plain text, never a dead link. */
export const playerStatsHref = (id: string) => rebuiltHref(`/golf/dashboard/stats?player=${id}`);

/**
 * An answer's text: paragraphs, lists, pipe tables, **bold** and roster names. Editorial, not a bubble. The
 * match is against the real roster passed in, so "Wake Forest" is never a link to nowhere.
 * While the answer streams, each paragraph or list settles in as it arrives (an opacity fade on the base beat,
 * coachhelm-thread.css); a finished or reloaded answer draws still.
 */
export function AskProse({ text, lead = false, playersByName, streaming = false, chip }: { /** Ask v2: draws `[e2]` as a read chip. */ chip?: { known: ReadonlySet<string>; draw: (ref: string) => ReactNode }; text: string; lead?: boolean; playersByName: Record<string, string>; streaming?: boolean }) {
  const names = useMemo(() => Object.keys(playersByName), [playersByName]);
  const blocks = useMemo(() => parseProse(text), [text]);
  // A read's chip is drawn once in a paragraph, list or table: six bullets from one read are one source, not six chips. `drawn` is rebuilt on every render.
  const drawn = new Map<number, Set<string>>();
  const inline = (s: string, block: number): ReactNode => {
    if (!chip) return plainInline(s);
    const seen = drawn.get(block) ?? new Set<string>();
    drawn.set(block, seen);
    return splitReadMarkers(s, chip.known).map((seg, i) => {
      if (!('ref' in seg)) return <Fragment key={`t${i}`}>{plainInline(seg.text)}</Fragment>;
      if (seen.has(seg.ref)) return null;
      seen.add(seg.ref);
      return <Fragment key={`r${i}`}>{chip.draw(seg.ref)}</Fragment>;
    });
  };
  // Ask v2, while it streams: each word fades in as it arrives (M-ASK-14). The keys hold, so a word already in never replays.
  const words = (t: string): ReactNode =>
    chip && streaming ? t.split(/(\s+)/).map((w, k) => (/\S/.test(w) ? <span key={k} className="w">{w}</span> : w)) : t;
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
  return (
    <div className="ch-th-prose" data-streaming={streaming ? '' : undefined}>
      {blocks.map((b, i) =>
        b.kind === 'table' ? (
          // An old answer's pipe table, drawn as a table: a header row, hairline rows, figures set right on tabular numbers,
          // and on a phone it scrolls sideways inside itself instead of widening the answer.
          <ScrollRegion key={i} label="Table" className="ch-th-mdtable">
            <table className="ch-th-table">
              <thead>
                <tr>
                  {b.header.map((h, c) => (
                    <th key={c} scope="col" className={b.numeric[c] ? 'is-num' : undefined}>
                      {inline(h, i)}
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
                          {inline(cell, i)}
                        </th>
                      ) : (
                        <td key={c} className={b.numeric[c] ? 'is-num' : undefined}>
                          {inline(cell, i)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : b.kind === 'heading' ? (
          <h4 key={i} className="ch-th-h">
            {inline(b.text, i)}
          </h4>
        ) : b.kind === 'list' ? (
          b.ordered ? (
            <ol key={i} className="ch-th-list is-ordered">
              {b.items.map((item, j) => (
                <li key={j}>{inline(item, i)}</li>
              ))}
            </ol>
          ) : (
            <ul key={i} className="ch-th-list">
              {b.items.map((item, j) => (
                <li key={j}>{inline(item, i)}</li>
              ))}
            </ul>
          )
        ) : (
          // Only the first paragraph of a lead block is the takeaway: a lead that runs to four paragraphs is an answer, not a headline.
          <p key={i} className={lead && i === 0 ? 'ch-th-p ch-th-p--lead' : 'ch-th-p'}>
            {inline(b.text, i)}
          </p>
        ),
      )}
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
