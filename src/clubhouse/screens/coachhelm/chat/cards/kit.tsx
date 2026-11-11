'use client';

import { ArrowDown, ArrowLeftRight, Bell, ChevronDown, Eye, LockKeyhole, Pencil, Send, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionProposal, ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Badge, type BadgeTone } from '../../../../ui/Badge';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { Segmented } from '../../../../ui/Segmented';
import { Select } from '../../../../ui/Select';
import type { CardCopy } from './catalog';
import { EditForm } from './edit';
import { count, dayParts, dayWords } from './facts';
import { channelChip, channelWords, editableOf, recipientWords } from './truth';
import { isSaved, isWithdrawn, type CardBodyProps, type CardDensity, type CardPerson, type CardPhase, type Reach } from './types';

/**
 * The parts every card body is made of (CAPABILITIES.md 0.2 to 0.5): reach, people, words in the reader's frame, the
 * detail rows, what changes, and the warning. Nothing here moves: a body is drawn whole, and a disclosure changes its
 * height in one frame on the coach's own tap.
 */

const REACH_ICON: Record<Reach, LucideIcon> = { sends: Send, visible: Eye, private: LockKeyhole };
const REACH_TONE: Record<Reach, BadgeTone> = { sends: 'accent', visible: 'info', private: 'neutral' };

/** The words for a state: what will happen, what did, or that it did not. */
export function tense(phase: CardPhase, words: { will: string; did?: string; not?: string }): string {
  if (isWithdrawn(phase)) return words.not ?? words.will;
  if (isSaved(phase)) return words.did ?? words.will;
  return words.will;
}

/** The reach sentence: from the plan when it lists who is sent something, else the body's own reading of an older card. */
export function reachLine(copy: CardCopy, phase: CardPhase, proposal: ActionProposal | undefined, lede: string): string {
  if (proposal?.recipients === undefined) return (copy.reach !== 'sends' && proposal?.visible_note) || lede;
  if (copy.reach !== 'sends') return proposal.visible_note ?? lede;
  const who = recipientWords(proposal.recipients);
  const how = proposal.delivery?.channels.length ? `: ${channelWords(proposal.delivery.channels)}` : '';
  return tense(phase, { will: `Sends to ${who}${how}`, did: `Sent to ${who}${how}`, not: `Not sent. It would have gone to ${who}.` });
}

/**
 * Who is affected and how far it travels. Always the first thing in a body. The mark says which of the three levels it
 * is, and turns neutral once nothing went anywhere. With a plan that lists its recipients, the sentence, the people and
 * anyone who will not be reached are the plan's; without one, `lede` and `children` are the body's reading of the card.
 */
export function ReachRow({ copy, phase, lede, proposal, density = 'full', children }: { copy: CardCopy; phase: CardPhase; lede: string; proposal?: ActionProposal; density?: CardDensity; children?: ReactNode }) {
  const withdrawn = isWithdrawn(phase) && copy.reach === 'sends';
  const mark = withdrawn ? 'Not sent' : copy.reach === 'sends' && isSaved(phase) ? 'Sent' : copy.mark;
  const listed = proposal?.recipients;
  return (
    <div className="ch-akc-reach" data-reach={copy.reach} data-withdrawn={withdrawn ? '' : undefined}>
      <div className="ch-akc-reach__top">
        <Badge tone={withdrawn ? 'neutral' : REACH_TONE[copy.reach]}>
          <Icon icon={REACH_ICON[copy.reach]} size={12} />
          {mark}
        </Badge>
        <p className="ch-akc-reach__lede">{reachLine(copy, phase, proposal, lede)}</p>
      </div>
      {listed === undefined ? children : listed.length > 0 && <People people={listed} density={density} label={listed.some((p) => p.role === 'coach') ? 'people' : 'players'} />}
      {proposal?.not_reached?.map((n) => (
        <p key={n.id} className="ch-akc-missed">
          <b>Will not get it:</b> {n.name} ({n.reason})
        </p>
      ))}
    </div>
  );
}

function nameLine(people: readonly CardPerson[], total: number): string {
  const n = people.length;
  if (n === 0) return '';
  if (n === 1 && total <= 1) return people[0]!.name;
  if (total <= 3 && n === total) return `${people.slice(0, -1).map((p) => p.name).join(', ')} and ${people[n - 1]!.name}`;
  const shown = people.slice(0, 2).map((p) => p.name).join(', ');
  return `${shown} and ${count(total - 2)} more`;
}

/**
 * People by name: coins, a line of names, and every name one tap away. `total` is the plan's count when it names fewer
 * people than it counts; the gap is said, never filled in.
 */
export function People({ people, total, density, label = 'players', everyone = false }: { people: readonly CardPerson[]; total?: number; density: CardDensity; label?: string; /** The whole roster: "All 7 players". */ everyone?: boolean }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const all = Math.max(total ?? 0, people.length);
  const coins = density === 'compact' ? 3 : 5;
  if (people.length === 0) {
    return all > 0 ? <p className="ch-akc-people__gap">The plan does not list who: {count(all)} {label}.</p> : null;
  }
  const unnamed = all - people.length;
  const expandable = people.length > 3;
  const line = everyone ? `All ${count(all)} ${label}` : nameLine(people, all);
  const inner = (
    <>
      <span className="ch-akc-people__coins" aria-hidden="true">
        {people.slice(0, coins).map((p) => (
          <Avatar key={p.id} name={p.name} id={p.id} size="xs" />
        ))}
        {all > coins && <span className="ch-akc-people__more ch-num">+{count(all - coins)}</span>}
      </span>
      <span className="ch-akc-people__names">{line}</span>
    </>
  );
  return (
    <div className="ch-akc-people">
      {expandable ? (
        // One control for the whole line, as the work line's summary is: the names are the key that opens the names.
        <button type="button" className="ch-akc-people__line is-key" data-ch-press="" aria-expanded={open} aria-controls={listId} aria-label={`${line}. ${open ? 'Hide the list' : `Show all ${count(people.length)}`}`} onClick={() => setOpen((v) => !v)}>
          {inner}
          <Icon icon={ChevronDown} size={15} className="ch-akc-people__chev" />
        </button>
      ) : (
        <div className="ch-akc-people__line">{inner}</div>
      )}
      {open && (
        <ul id={listId} className="ch-akc-people__all">
          {people.map((p) => (
            <li key={p.id}>
              <Avatar name={p.name} id={p.id} size="xs" />
              <span>{p.name}</span>
            </li>
          ))}
        </ul>
      )}
      {unnamed > 0 && <p className="ch-akc-people__gap">{count(unnamed)} more are not named in the plan.</p>}
    </div>
  );
}

/** Roughly how many characters a line holds at each density; the clamp is CSS, this only decides whether to offer the key. */
const PER_LINE: Record<CardDensity, number> = { full: 62, compact: 40 };

/**
 * Text held to a few lines with the rest one tap away. The whole text is always in the DOM (the clamp is CSS), so a
 * screen reader reads all of it, and the key says how much there is before the coach confirms.
 */
export function Clamp({ text, lines, density, what = 'message', className, textClass }: { text: string; lines: number; density: CardDensity; /** "message", "note", "document": the key's noun. */ what?: string; className?: string; /** A frame the words themselves wear (a bubble), so the key sits outside it. */ textClass?: string }) {
  const [open, setOpen] = useState(false);
  // Whether the text really runs past the clamp, once it has been laid out. Before that (and where nothing is laid out) the guess from its length stands.
  const [cut, setCut] = useState<boolean | null>(null);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open || el.clientHeight === 0) return;
    setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text, lines, density, open]);
  const long = cut ?? (text.length > lines * PER_LINE[density] || text.split('\n').length > lines);
  return (
    <div className={'ch-akc-clamp' + (className ? ` ${className}` : '')} data-open={open || !long ? '' : undefined} style={{ ['--ch-akc-lines' as string]: lines }}>
      <p ref={ref} id={id} className={'ch-akc-clamp__t' + (textClass ? ` ${textClass}` : '')}>
        {text}
      </p>
      {long && (
        <Button variant="ghost" size="sm" aria={{ expanded: open, controls: id }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : `Show the whole ${what} · ${count(text.length)} characters`}
        </Button>
      )}
    </div>
  );
}

/** Words that are sent keep four lines even in quick chat: two lines of a message is not enough to approve it. */
const linesFor = (density: CardDensity, full = 6): number => (density === 'compact' ? Math.min(full, 4) : full);

/** A notification as a phone shows it: the app's glyph, a bold title, the body. The words are the plan's, never a summary. */
export function Notice({ title, body, caption, density }: { title: string; body?: string | null; caption?: string; density: CardDensity }) {
  return (
    <figure className="ch-akc-words">
      {caption && <figcaption>{caption}</figcaption>}
      <div className="ch-akc-notice">
        <span className="ch-akc-notice__app" aria-hidden="true">
          <Icon icon={Bell} size={14} />
        </span>
        <div className="ch-akc-notice__tx">
          <b>{title}</b>
          {body && <Clamp text={body} lines={linesFor(density)} density={density} />}
        </div>
      </div>
    </figure>
  );
}

/** The coach's own sent bubble, as Messages draws it, with the thread's last message above it when the plan has one. */
export function Bubble({ text, before, caption, density }: { text: string; before?: string | null; caption?: string; density: CardDensity }) {
  return (
    <figure className="ch-akc-words">
      {caption && <figcaption>{caption}</figcaption>}
      <div className="ch-akc-thread">
        {before && <p className="ch-akc-thread__before">{before}</p>}
        <Clamp text={text} lines={linesFor(density)} density={density} className="ch-akc-thread__mine" textClass="ch-akc-bubble" />
      </div>
    </figure>
  );
}

/** A note as it will sit under the thing it is on. `quiet`: words already there, which stay. */
export function Quote({ text, caption, quiet = false, struck = false, density, what = 'note' }: { text: string; caption?: string; quiet?: boolean; struck?: boolean; density: CardDensity; what?: string }) {
  return (
    <figure className={'ch-akc-words ch-akc-quote' + (quiet ? ' is-quiet' : '') + (struck ? ' is-struck' : '')}>
      {caption && <figcaption>{caption}</figcaption>}
      <blockquote>
        <Clamp text={text} lines={linesFor(density, quiet ? 3 : 6)} density={density} what={what} />
      </blockquote>
    </figure>
  );
}

/** The plan names the channel and not the words: said plainly, in the place the words would be. Once the card is decided the reach line carries it. */
export function NoWords({ channel, phase }: { channel: string; phase: CardPhase }) {
  if (isSaved(phase) || isWithdrawn(phase)) return null;
  return (
    <div className="ch-akc-nowords">
      <p>{channel}</p>
      <small>The exact wording is not shown here.</small>
    </div>
  );
}

/** A calendar day as a tile: weekday, day, month. */
export function DateTile({ iso, tone }: { iso: string; tone?: 'edge' | 'pending' }) {
  const parts = dayParts(iso);
  if (!parts) return null;
  return (
    <span className="ch-akc-tile" data-tone={tone} role="img" aria-label={dayWords(iso, true)}>
      <small aria-hidden="true">{parts.weekday}</small>
      <b className="ch-num" aria-hidden="true">
        {parts.day}
      </b>
      <small aria-hidden="true">{parts.month}</small>
    </span>
  );
}

/**
 * The remaining facts as label and value. A value the coach still has to give reads "Not set" in amber and, while the
 * card is open, asks for it. A value the engine assumed says so, with where it came from.
 */
export function Rows({ facts, density, subject, onAsk }: { facts: readonly ProposalFact[]; density: CardDensity; /** What the card is about, for the sentence a row sends. */ subject: string; onAsk?: (text: string) => void }) {
  if (facts.length === 0) return null;
  return (
    <dl className="ch-akc-rows">
      {facts.map((f) => (
        <div key={f.label} className="ch-akc-row" data-missing={f.missing ? '' : undefined}>
          <dt>{f.label}</dt>
          <dd>
            {f.missing ? (
              <span className="ch-akc-row__unset">
                <span>{f.value && f.value !== 'Not set' ? f.value : 'Not set'}</span>
                {onAsk && (
                  <Button variant="secondary" size="sm" onClick={() => onAsk(`Set the ${f.label.toLowerCase()} on ${subject}`)}>
                    Set it
                  </Button>
                )}
              </span>
            ) : f.value.length > 120 ? (
              <Clamp text={f.value} lines={density === 'compact' ? 1 : 3} density={density} what="text" />
            ) : (
              <span>{f.value}</span>
            )}
            {f.source && !f.missing && (
              <span className="ch-akc-row__src">
                <Badge tone="warning">Assumed</Badge>
                <small>{f.source}</small>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What this replaces, or leaves alone. */
export function Change({ children }: { children: ReactNode }) {
  return (
    <p className="ch-akc-change">
      <Icon icon={ArrowLeftRight} size={14} />
      <span>{children}</span>
    </p>
  );
}

/** Something that cannot be taken back, or that the plan does not show. Amber, never red. */
export function Warning({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <p className={'ch-akc-warn' + (first ? ' is-first' : '')} role="note">
      <Icon icon={TriangleAlert} size={15} />
      <span>{children}</span>
    </p>
  );
}

/** One line of secondary facts, joined by the middle dot. Empty parts are dropped. */
export function Meta({ parts }: { parts: ReadonlyArray<string | null | undefined | false> }) {
  const shown = parts.filter((p): p is string => !!p);
  return shown.length ? <p className="ch-akc-meta">{shown.join(' · ')}</p> : null;
}

/** In quick chat the secondary rows wait behind one key; in Ask they are simply there. */
export function Fold({ density, label = 'details', children }: { density: CardDensity; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (density === 'full') return <>{children}</>;
  return (
    <div className="ch-akc-fold">
      <Button variant="ghost" size="sm" aria={{ expanded: open, controls: id }} onClick={() => setOpen((v) => !v)}>
        {open ? `Hide ${label}` : `Show ${label}`}
      </Button>
      {open && <div id={id}>{children}</div>}
    </div>
  );
}

/**
 * What a recipient receives, exactly: the plan's own `delivery`, built by the code that sends it. Where a channel words
 * it differently the coach can switch channel; where each person gets their own words, whose. `children` is what an
 * older card without `delivery` draws in its place. A plan that says nothing is sent draws nothing here.
 */
export function Delivery({ proposal, phase, density, children }: { proposal: ActionProposal; phase: CardPhase; density: CardDensity; children?: ReactNode }) {
  const d = proposal.delivery;
  const [channel, setChannel] = useState('0');
  const [whose, setWhose] = useState<string | null>(null);
  if (d === undefined) return <>{children}</>;
  if (d === null) return null;
  const forms = [{ channel: d.channels[0] ?? 'in_app', title: d.title, body: d.body }, ...(d.variants ?? [])];
  const form = forms[Number(channel)] ?? forms[0]!;
  const each = d.each ?? [];
  const person = each.find((e) => e.id === whose) ?? each[0];
  const first = (proposal.recipients?.[0]?.name ?? '').split(' ')[0];
  const who = person ? person.name.split(' ')[0] : proposal.recipients?.length === 1 ? first : null;
  const caption = who ? tense(phase, { will: `What ${who} gets`, did: `What ${who} got`, not: `What ${who} would have got` }) : tense(phase, { will: 'What each of them gets', did: 'What each of them got', not: 'What they would have got' });
  return (
    <figure className="ch-akc-words ch-akc-delivery">
      <figcaption>
        {caption}
        {each.length > 1 && '. Each person’s is their own.'}
      </figcaption>
      {forms.length > 1 ? (
        <Segmented label="How it arrives" size="sm" value={channel} options={forms.map((f, i) => ({ value: String(i), label: channelChip(f.channel) }))} onChange={setChannel} />
      ) : (
        d.channels.length > 0 && (
          <ul className="ch-akc-delivery__how" aria-label="How it arrives">
            {d.channels.map((c) => (
              <li key={c}>
                <Badge>{channelChip(c)}</Badge>
              </li>
            ))}
          </ul>
        )
      )}
      {each.length > 1 && <Select label="Whose words" value={person?.id ?? ''} options={each.map((e) => ({ value: e.id, label: e.name }))} onChange={setWhose} />}
      <div className="ch-akc-notice">
        <span className="ch-akc-notice__app" aria-hidden="true">
          <Icon icon={Bell} size={14} />
        </span>
        <div className="ch-akc-notice__tx">
          <b>{form.title}</b>
          <Clamp text={channel === '0' && person ? person.body : form.body} lines={linesFor(density)} density={density} />
        </div>
      </div>
      {d.note && <p className="ch-akc-meta">{d.note}</p>}
    </figure>
  );
}

/** What changes: how it stands now, and how it will stand. The one place a card shows both. */
export function Diff({ now, after }: { now: string; after: string }) {
  return (
    <div className="ch-akc-diff" role="group" aria-label="What changes">
      <p className="is-now">
        <small>Now</small>
        <span>{now}</span>
      </p>
      <Icon icon={ArrowDown} size={14} />
      <p className="is-after">
        <small>After</small>
        <b>{after}</b>
      </p>
    </div>
  );
}

const lowerList = (labels: readonly string[]): string => {
  const l = labels.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
};

/**
 * The frame of every body: one group, named by its reach sentence, in the density and state it is drawn in. It also
 * holds what every card says the same way when the plan carries it: that a write has no Undo (first), how it is taken
 * back afterwards (last), who a send missed, and the way into edit mode.
 */
export function Body({ label, card, children }: { label: string; card: CardBodyProps & { copy: CardCopy }; children: ReactNode }) {
  const { proposal: p, phase, density, receipt } = card;
  const fields = editableOf(p);
  const canEdit = phase === 'proposed' && !!card.onEdit && fields.length > 0;
  // Open for one version of the plan: the server's re-planned card closes the form by being a new version; a refused edit does not.
  const version = `${p.idempotency_key}:${(p as { revision?: number }).revision ?? 0}`;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = canEdit && openFor === version;
  const setOpen = (next: boolean) => {
    setOpenFor(next ? version : null);
    card.onEditOpen?.(next);
  };
  const missed = receipt?.missed ?? [];
  return (
    <div className="ch-akc" role="group" aria-label={reachLine(card.copy, phase, p, label)} data-ch-card-body={card.tool} data-density={density} data-phase={phase} data-editing={open ? '' : undefined}>
      {p.undo?.window === false && !isSaved(phase) && !isWithdrawn(phase) && (
        <Warning first>
          <b>This happens the moment you press.</b> There is no Undo.
        </Warning>
      )}
      {children}
      {missed.length > 0 && (
        <p className="ch-akc-missed">
          <b>Did not get it:</b> {missed.map((m) => `${m.name} (${m.reason})`).join(', ')}
        </p>
      )}
      {p.undo?.after && !isWithdrawn(phase) && (
        <p className="ch-akc-after">
          <Icon icon={Undo2} size={14} />
          <span>
            <b>{p.undo.window ? 'After the 8 seconds:' : 'Afterwards:'}</b> {p.undo.after}
          </span>
        </p>
      )}
      {canEdit && !open && (
        <div className="ch-akc-editkey">
          <Button variant="secondary" size="sm" leftIcon={Pencil} onClick={() => setOpen(true)}>
            Edit
          </Button>
          <small>You can change the {lowerList(fields.map((f) => f.label))}.</small>
        </div>
      )}
      {open && <EditForm fields={fields} busy={!!card.editing} error={card.editError ?? null} onSubmit={(patch) => card.onEdit?.(patch)} onClose={() => setOpen(false)} />}
    </div>
  );
}
