'use client';

import Link from 'next/link';
import { Fragment, useMemo } from 'react';
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
export function AskProse({ text, lead = false, playersByName, streaming = false }: { text: string; lead?: boolean; playersByName: Record<string, string>; streaming?: boolean }) {
  const names = useMemo(() => Object.keys(playersByName), [playersByName]);
  const blocks = useMemo(() => parseProse(text), [text]);
  const inline = (s: string) =>
    splitInline(s, names).map((seg, i) => {
      const id = seg.mention ? playersByName[seg.mention] : undefined;
      const href = id ? playerStatsHref(id) : null;
      const body = href ? (
        <Link href={href} className="ch-th-mention">
          {seg.text}
        </Link>
      ) : (
        seg.text
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
        ) : b.kind === 'list' ? (
          <ul key={i} className="ch-th-list">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          // Only the first paragraph of a lead block is the takeaway: a lead that runs to four paragraphs is an answer, not a headline.
          <p key={i} className={lead && i === 0 ? 'ch-th-p ch-th-p--lead' : 'ch-th-p'}>
            {inline(b.text)}
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
