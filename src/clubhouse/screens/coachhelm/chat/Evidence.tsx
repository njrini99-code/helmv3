'use client';

import Link from 'next/link';
import { ChevronRight, CircleAlert } from 'lucide-react';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { evidenceBlocks, readAreaWord, type AskEvidence } from '../../../data/coachhelm-chat-thread';
import { coachReadHref } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { Icon } from '../../../ui/Icon';
import { Studio, fillComposer, fromEvidence } from './studio';

/** The table of a read's figures: the studio's (chat/studio/table.tsx), named here for the files that read it from the thread. */
export { DataTable } from './studio/table';
/** Where a reference's words go so they never sit on a line (P013 D3); it lives with the one line chart (B5). */
export { placeRefLabel } from '../../../ui/charts/Line';

const SAYS_NONE = /\b(?:on record|recorded|nothing|no [a-z ]+ (?:yet|found))\b/i;

/** Who is on the coach's team: a read about anyone else is drawn, never linked. */
type Roster = ReadonlyArray<{ id: string }>;

/**
 * One tool's evidence, as the blocks its shape calls for, each drawn by the studio (chat/studio): the one component per
 * kind, in the chat's look. In an answer's leaf each block is a ruled section of it, never a card. `roster`: the coach's
 * own players, so a read the answer names opens that player's Deep dive (CH-13914). `ask`: off where a tap could not
 * reach the composer (the evidence sheet lies over it), so nothing there looks tappable.
 */
export function AskEvidenceView({ envelope, roster = [], ask = true }: { envelope: ToolEnvelope; roster?: Roster; ask?: boolean }) {
  const blocks = evidenceBlocks(envelope);
  if (blocks.length === 0) return null;
  return (
    <div className="ch-th-evidence ch-aks-ev">
      {blocks.map((block, i) => (
        <AskEvidenceBlock key={i} block={block} roster={roster} ask={ask} />
      ))}
    </div>
  );
}

export function AskEvidenceBlock({ block, roster = [], ask = true }: { block: AskEvidence; roster?: Roster; ask?: boolean }) {
  if (block.kind === 'unavailable') {
    // A failed read is never "no data": it says it could not read this. A sentence on the paper, not a banner in it.
    return (
      <div className="ch-aks-read ch-aks-read--error" role="status" data-ch-code="CH-13250">
        <Icon icon={CircleAlert} size={15} className="ch-aks-read__icon" />
        <p>
          <b>Could not read this:</b> {block.note}
        </p>
      </div>
    );
  }
  if (block.kind === 'empty') {
    return (
      <div className="ch-aks-read" data-ch-code="CH-13350">
        <p>
          {/* A note that already says nothing is recorded is the card; the generic lead-in would say it twice. */}
          {SAYS_NONE.test(block.note) ? block.note : (
            <>
              <b>Nothing recorded for this yet.</b> {block.note}
            </>
          )}
        </p>
      </div>
    );
  }
  return <Figure block={block} roster={roster} ask={ask} />;
}

/**
 * One block: the studio's drawing under its own head, then the read's notes and its source line. There is no "Table" key
 * (owner, 11 Nov): a chart keeps its figures as a table for a screen reader (the trend's), and a block that is rows is
 * already its own table. The reads an answer names keep their own rows, since each opens a screen (no studio kind does).
 */
function Figure({ block, roster, ask }: { block: Exclude<AskEvidence, { kind: 'unavailable' | 'empty' }>; roster: Roster; ask: boolean }) {
  const phone = useChPhone();
  const part = block.kind === 'reads' ? null : fromEvidence(block);
  return (
    <figure className="ch-aks-sec ch-aks-ev__fig" data-kind={block.kind}>
      {part ? (
        <Studio part={part} size={phone ? 'compact' : 'full'} onAsk={ask ? fillComposer : undefined} />
      ) : (
        block.kind === 'reads' && (
          <>
            <figcaption className="ch-aks-title">
              <span>{block.title}</span>
            </figcaption>
            <Reads block={block} roster={roster} />
          </>
        )
      )}
      {block.note && <p className="ch-aks-ev__note">{block.note}</p>}
      {block.bench && <p className="ch-aks-ev__note">{block.bench}</p>}
      {block.source && <p className="ch-aks-src ch-num">{block.source}</p>}
    </figure>
  );
}

/**
 * The reads an answer names for one player (CH-13914): each opens that player's Deep dive on the coach Player page, on that read
 * (`?view=deep-dive&player=&insight=`). Only for a player on the coach's own team; anyone else's reads are drawn as plain rows,
 * never a link to a page that would only say "isn't on your team".
 */
function Reads({ block, roster }: { block: Extract<AskEvidence, { kind: 'reads' }>; roster: Roster }) {
  return (
    <ul className="ch-th-reads" aria-label={block.title} data-ch-code="CH-13914">
      {block.rows.map((r) => {
        const href = coachReadHref(block.playerId, r.id, roster);
        const body = (
          <>
            <span className="ch-th-reads__b">
              {r.category && <small>{readAreaWord(r.category)}</small>}
              <b>{r.title}</b>
            </span>
            {r.value && <span className="ch-th-reads__v">{r.value}</span>}
          </>
        );
        return (
          <li key={r.id}>
            {href ? (
              <Link href={href} className="ch-th-reads__r">
                {body}
                <Icon icon={ChevronRight} size={15} />
              </Link>
            ) : (
              <span className="ch-th-reads__r">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
