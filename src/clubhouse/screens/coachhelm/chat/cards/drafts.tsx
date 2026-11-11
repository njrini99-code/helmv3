'use client';

import { Badge } from '../../../../ui/Badge';
import type { AskBriefData, AskHandoffData } from '../../../../data/coachhelm-chat-thread';
import { formatWith } from '../../../../lib/dates';
import { Bubble, Clamp, People } from './kit';
import type { CardDensity, CardPerson } from './types';

/**
 * The bodies of the drafts and hand-offs (CAPABILITIES.md, section B): cards that write nothing. Each one says the one
 * true thing in the reach position (nothing is sent until the coach presses Send in Messages) and then shows the draft
 * as the place it is going will show it. The button that opens Messages is the shell's.
 */

const NOTHING: Record<AskHandoffData['kind'], string> = {
  message: 'Nothing is sent until you press Send in Messages.',
  poll: 'Nothing is posted until you press Send in Messages.',
  board: 'Nothing is sent until you press Send in Messages.',
};

function Nothing({ line }: { line: string }) {
  return (
    <div className="ch-akc-reach" data-reach="private">
      <div className="ch-akc-reach__top">
        <Badge>Draft</Badge>
        <p className="ch-akc-reach__lede">{line}</p>
      </div>
    </div>
  );
}

function closesWords(iso: string | undefined): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return 'Stays open until you close it';
  return `Closes ${formatWith(at, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

/** B4 to B6: a message, a poll or a board that opens in Messages. `tiles`: the board's figures, already drawn in this answer. */
export function HandoffBody({ handoff, roster = [], density, tiles }: { handoff: AskHandoffData; roster?: readonly CardPerson[]; density: CardDensity; tiles?: ReadonlyArray<{ label: string; value: string }> }) {
  const people = handoff.players.map((id) => roster.find((r) => r.id === id)).filter((p): p is CardPerson => !!p);
  const to = handoff.thread ?? handoff.title.replace(/^(Draft|Poll) for /, '');
  return (
    <div className="ch-akc" role="group" aria-label={NOTHING[handoff.kind]} data-ch-card-body={`draft_${handoff.kind}`} data-density={density}>
      <Nothing line={NOTHING[handoff.kind]} />
      {people.length > 0 && <People people={people} density={density} />}
      {handoff.kind === 'message' && <Bubble text={handoff.draft} caption={people.length ? `To ${people.length === 1 ? people[0]!.name : `${people.length} players`}` : to} density={density} />}
      {handoff.kind === 'poll' && handoff.poll && (
        <div className="ch-akc-poll" data-multi={handoff.poll.multi ? '' : undefined}>
          <small>Poll · {handoff.poll.multi ? 'Choose any' : 'Choose one'} · in {to}</small>
          <b>{handoff.poll.question}</b>
          <ul>
            {handoff.poll.options.map((o) => (
              <li key={o}>
                <i aria-hidden="true" />
                <span>{o}</span>
                <span className="ch-num">0</span>
              </li>
            ))}
          </ul>
          <p className="ch-akc-meta">{closesWords(handoff.poll.closes)} · Names show on votes</p>
        </div>
      )}
      {handoff.kind === 'board' && (
        <div className="ch-akc-board" role="img" aria-label={`A board with ${tiles?.length ?? 0} figures${handoff.draft ? ` and your note: ${handoff.draft}` : ''}`}>
          {handoff.draft && <p>{handoff.draft}</p>}
          {(tiles ?? []).map((t) => (
            <div key={t.label}>
              <small>{t.label}</small>
              <b className="ch-num">{t.value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** B1: the questions before a practice plan. The read's own answer is already picked; its source is the hint. */
export function BriefBody({ brief, density }: { brief: AskBriefData; density: CardDensity }) {
  const line = 'Nothing is drafted until you answer. Tap to change a choice.';
  return (
    <div className="ch-akc" role="group" aria-label={line} data-ch-card-body="ask_practice_brief" data-density={density}>
      <Nothing line={line} />
      <div className="ch-akc-brief">
        {brief.questions.map((q) => (
          <section key={q.id} aria-label={q.title}>
            <h4>{q.title}</h4>
            {q.why && <p className="ch-akc-meta">{q.why}</p>}
            <ul>
              {q.options.map((o) => (
                <li key={o.id} data-on={q.pick?.includes(o.id) ? '' : undefined}>
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** What `write_artifact` puts on its part. */
export interface DocDraft {
  kind: 'player_report' | 'lineup' | 'round_recap';
  title: string;
  body: string;
  at: string;
}
const DOC_KIND: Record<DocDraft['kind'], string> = { player_report: 'Player report', lineup: 'Lineup', round_recap: 'Round recap' };

/** B3: a long piece beside the chat. It stays in this chat until the coach publishes it (A17). */
export function DocBody({ doc, density }: { doc: DocDraft; density: CardDensity }) {
  const line = 'It stays in this chat until you publish it.';
  return (
    <div className="ch-akc" role="group" aria-label={line} data-ch-card-body="write_artifact" data-density={density}>
      <Nothing line={line} />
      <article className="ch-akc-page">
        <header>
          <small>{DOC_KIND[doc.kind]}</small>
          <b>{doc.title}</b>
        </header>
        <Clamp text={doc.body} lines={density === 'compact' ? 3 : 6} density={density} what="document" />
      </article>
    </div>
  );
}
