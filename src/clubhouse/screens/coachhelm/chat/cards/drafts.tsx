'use client';

import type { AskBriefData, AskHandoffData } from '../../../../data/coachhelm-chat-thread';
import { formatWith } from '../../../../lib/dates';
import { Bubble, People, Quote, Thing } from './kit';
import type { CardDensity, CardPerson } from './types';

/**
 * The bodies of the drafts and hand-offs (CAPABILITIES.md, section B): cards that write nothing. Each one shows the draft
 * as the place it is going will show it, and says the one true thing in the foot's quiet line (nothing is sent until the
 * coach presses Send in Messages). The button that opens Messages is the shell's.
 */

const NOTHING: Record<AskHandoffData['kind'], string> = {
  message: 'Nothing is sent until you press Send in Messages.',
  poll: 'Nothing is posted until you press Send in Messages.',
  board: 'Nothing is sent until you press Send in Messages.',
};

function Nothing({ line }: { line: string }) {
  return (
    <div className="ch-akc-foot">
      <p className="ch-akc-told">{line}</p>
    </div>
  );
}

/** When a poll closes, on the team's clock when the shell gives its zone; else on the viewer's. */
function closesWords(iso: string | undefined, timeZone?: string): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return 'Stays open until you close it';
  return `Closes ${formatWith(at, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })}`;
}

/** B4 to B6: a message, a poll or a board that opens in Messages. `tiles`: the board's figures, already drawn in this answer. */
export function HandoffBody({ handoff, roster = [], density, tiles, timeZone }: { handoff: AskHandoffData; roster?: readonly CardPerson[]; density: CardDensity; tiles?: ReadonlyArray<{ label: string; value: string }>; /** The team's zone, for a poll's closing time. */ timeZone?: string }) {
  const people = handoff.players.map((id) => roster.find((r) => r.id === id)).filter((p): p is CardPerson => !!p);
  const to = handoff.thread ?? handoff.title.replace(/^(Draft|Poll) for /, '');
  return (
    <div className="ch-akc" role="group" aria-label={NOTHING[handoff.kind]} data-ch-card-body={`draft_${handoff.kind}`} data-density={density}>
      {people.length > 0 && (
        <div className="ch-akc-who">
          <People people={people} density={density} />
        </div>
      )}
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
          {/* Without a zone the time is the viewer's own clock, which a server cannot know. */}
          <p className="ch-akc-meta" suppressHydrationWarning>
            {closesWords(handoff.poll.closes, timeZone)} · Names show on votes
          </p>
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
      <Nothing line={NOTHING[handoff.kind]} />
    </div>
  );
}

/** B1: the questions before a practice plan. The read's own answer is already picked; its source is the hint. */
export function BriefBody({ brief, density }: { brief: AskBriefData; density: CardDensity }) {
  const line = 'Nothing is drafted until you answer. Tap to change a choice.';
  return (
    <div className="ch-akc" role="group" aria-label={line} data-ch-card-body="ask_practice_brief" data-density={density}>
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
      <Nothing line={line} />
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
      <Thing title={doc.title} meta={[DOC_KIND[doc.kind]]} />
      <Quote text={doc.body} density={density} what="document" />
      <Nothing line={line} />
    </div>
  );
}
