'use client';

import { ChevronDown, Pencil, TriangleAlert } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionProposal, ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { Segmented } from '../../../../ui/Segmented';
import { Select } from '../../../../ui/Select';
import type { CardCopy } from './catalog';
import { EditForm } from './edit';
import { count, dayParts, dayWords, tellsSomebody } from './facts';
import { channelChip, channelWords, editableOf, recipientWords } from './truth';
import { isSaved, isWithdrawn, type CardBodyProps, type CardDensity, type CardPerson, type CardPhase } from './types';

/**
 * The parts every card body is made of (CAPABILITIES.md 0.2 to 0.5), in the order a card reads: who it is for, the thing
 * itself as the person who receives it will see it, the words that are sent set as a quote, any other fact as a plain
 * line, and one quiet line at the foot for who is told and where it appears. Nothing here is a box inside the card, a
 * chip or a table of fields (owner, 11 Nov). Nothing here moves: a body is drawn whole, and a disclosure changes its
 * height in one frame on the coach's own tap.
 */

/** The words for a state: what will happen, what did, or that it did not. */
export function tense(phase: CardPhase, words: { will: string; did?: string; not?: string }): string {
  if (isWithdrawn(phase)) return words.not ?? words.will;
  if (isSaved(phase)) return words.did ?? words.will;
  return words.will;
}

/** One sentence, ending once: a planner's line may or may not bring its own full stop. */
export function sentence(text: string): string {
  const t = text.trim().replace(/\.+$/, '');
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * The reach sentence: from the plan when it lists who is sent something, else the body's own reading of an older card.
 * A plan that lists nobody says so in the catalogue's word, whatever the older reading was.
 */
export function reachLine(copy: CardCopy, phase: CardPhase, proposal: ActionProposal | undefined, lede: string): string {
  if (proposal?.recipients === undefined) return (copy.reach !== 'sends' && proposal?.visible_note) || lede;
  if (copy.reach !== 'sends') return proposal.visible_note ?? (proposal.recipients.length === 0 && /^(Sends|Sent|Not sent)\b/.test(lede) ? copy.mark : lede);
  const people = proposal.recipients;
  const who = recipientWords(people);
  const one = people.length === 1;
  const what = proposal.delivery?.channels.length ? channelWords(proposal.delivery.channels) : null;
  if (!what) return tense(phase, { will: `${who} ${one ? 'is' : 'are'} told`, did: `${who} ${one ? 'was' : 'were'} told`, not: `Not sent. ${who} ${one ? 'was' : 'were'} not told.` });
  return tense(phase, { will: `${who} ${one ? 'gets' : 'get'} ${what}`, did: `${who} got ${what}`, not: `Not sent. ${who} would have got ${what}.` });
}

/**
 * Who it is for: the people, by name, and anyone it will not reach. The first thing in a body, and quiet: small coins and
 * a line of names, every name one tap away. With a plan that lists its recipients the people are the plan's; without
 * one, `children` is the body's reading of the card. How far it travels is the foot's one line (`Body`).
 */
export function Who({ proposal, density = 'full', children }: { proposal?: ActionProposal; density?: CardDensity; children?: ReactNode }) {
  const listed = proposal?.recipients;
  return (
    <div className="ch-akc-who">
      {listed === undefined ? children : listed.length > 0 && <People people={listed} density={density} label={listed.some((p) => p.role === 'coach') ? 'people' : 'players'} />}
      {proposal?.not_reached?.map((n) => (
        <p key={n.id} className="ch-akc-missed">
          Will not get it: {n.name} ({n.reason})
        </p>
      ))}
    </div>
  );
}

/**
 * The thing itself, set the way its home will show it: its name, then what it says in plain lines in their natural
 * order, then one quiet line. Never a label beside a value.
 */
export function Thing({ title, lines = [], meta = [], children }: { title?: string | null; lines?: ReadonlyArray<ReactNode | null | undefined | false>; meta?: ReadonlyArray<string | null | undefined | false>; children?: ReactNode }) {
  const shown = lines.filter((l) => l !== null && l !== undefined && l !== false && l !== '');
  return (
    <div className="ch-akc-thing">
      {title && <h4 className="ch-akc-thing__t">{title}</h4>}
      {shown.map((l, i) => (
        <p key={i} className="ch-akc-thing__l">
          {l}
        </p>
      ))}
      <Meta parts={meta} />
      {children}
    </div>
  );
}

function nameLine(people: readonly CardPerson[], total: number): string {
  const n = people.length;
  if (n === 0) return '';
  if (n === 1 && total <= 1) return people[0]!.name;
  if (total <= 3 && n === total) return `${people.slice(0, -1).map((p) => p.name).join(', ')} and ${people[n - 1]!.name}`;
  // More than a few: the first by name and how many more, so the line is one line on a phone. Every name is one tap away.
  return `${people[0]!.name} and ${count(total - 1)} more`;
}

/**
 * People by name: coins, a line of names, and every name one tap away. `total` is the plan's count when it names fewer
 * people than it counts; the gap is said, never filled in.
 */
export function People({ people, total, label = 'players', everyone = false }: { people: readonly CardPerson[]; total?: number; density: CardDensity; label?: string; /** The whole roster: "All 7 players". */ everyone?: boolean }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const all = Math.max(total ?? 0, people.length);
  // One line: a few coins, then the names. Everyone is one tap away.
  const coins = 3;
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

/** Words a person receives, set as a quote: the title they see, then the body. The words are the plan's, never a summary. */
export function Notice({ title, body, caption, density }: { title: string; body?: string | null; caption?: string; density: CardDensity }) {
  return (
    <figure className="ch-akc-words">
      {caption && <figcaption>{caption}</figcaption>}
      <blockquote className="ch-akc-notice">
        <b>{title}</b>
        {body && <Clamp text={body} lines={linesFor(density)} density={density} />}
      </blockquote>
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
 * The facts a body has not set in its own words, each as one quiet line that reads as a sentence ("Length: 2.5 hours"):
 * no columns, no rules between them. A value the coach still has to give reads "Not set" in amber and, while the card is
 * open, asks for it. A value the engine assumed says so in the same line, with where it came from.
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
            {f.source && !f.missing && <small className="ch-akc-row__src">Assumed. {f.source}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What this replaces, or leaves alone. */
export function Change({ children }: { children: ReactNode }) {
  return (
    <p className="ch-akc-change">{children}</p>
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
  // One way in: said in the caption's own line. Several that word it differently: the coach switches between them.
  const how = forms.length > 1 ? null : d.channels.map(channelChip).join(', ');
  return (
    <figure className="ch-akc-words ch-akc-delivery">
      <figcaption>
        {caption}
        {how && <span aria-label="How it arrives"> · {how}</span>}
        {each.length > 1 && '. Each person’s is their own.'}
      </figcaption>
      {forms.length > 1 && <Segmented label="How it arrives" size="sm" value={channel} options={forms.map((f, i) => ({ value: String(i), label: channelChip(f.channel) }))} onChange={setChannel} />}
      {each.length > 1 && <Select label="Whose words" value={person?.id ?? ''} options={each.map((e) => ({ value: e.id, label: e.name }))} onChange={setWhose} />}
      <blockquote className="ch-akc-notice">
        <b>{form.title}</b>
        <Clamp text={channel === '0' && person ? person.body : form.body} lines={linesFor(density)} density={density} />
      </blockquote>
      {d.note && <p className="ch-akc-meta">{d.note}</p>}
    </figure>
  );
}

/** What changes: how it stands now, struck through, and how it will stand under it. The one place a card shows both. */
export function Diff({ now, after }: { now: string; after: string }) {
  return (
    <div className="ch-akc-diff" role="group" aria-label="What changes">
      <p className="is-now">
        <small className="ch-sr-only">Now</small>
        <span>{now}</span>
      </p>
      <p className="is-after">
        <small className="ch-sr-only">After</small>
        <b>{after}</b>
      </p>
    </div>
  );
}

const lowerList = (labels: readonly string[]): string => {
  const l = labels.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
};

/** The words an older card cannot show, said where the words would be told. */
const NO_WORDS = 'The exact wording is not shown here.';

/**
 * The foot's one line: who is told, and where the thing appears. A plan that lists its recipients says it in the plan's
 * terms. An older card that tells somebody and carries no words says it in the planner's own sentence, and that the
 * wording is not shown. While the write is held the receipt row says who is told, so the line says only where it appears.
 */
function toldLine(card: CardBodyProps & { copy: CardCopy }, lede: string, wordless: boolean): { told: string; note: string | null } {
  const { proposal: p, phase, copy, lands } = card;
  const open = phase === 'proposed' || phase === 'confirming';
  const older = p.recipients === undefined && p.delivery === undefined;
  const bare = open && older && wordless && copy.reach === 'sends' && tellsSomebody(p);
  const told = bare ? p.notifications.map(sentence).join(' ') : sentence(reachLine(copy, phase, p, lede));
  const place = lands && !new RegExp(`\\b${lands.app}\\b`).test(told) ? lands.line : null;
  if (phase === 'held' || phase === 'undoing' || phase === 'committing') return { told: lands?.line ?? told, note: null };
  return { told: open && place ? `${told} ${place}` : told, note: bare ? NO_WORDS : null };
}

/**
 * The frame of every body: one group, named by its reach sentence, in the density and state it is drawn in. After the
 * body's own drawing it holds what every card says the same way: who a send missed, the one quiet line for who is told
 * and where it appears, how it is taken back afterwards, and the way into edit mode. A write with no Undo says so first.
 * `wordless`: the body has no words of its own to show when the plan carries none (an older card).
 */
export function Body({ label, card, wordless = false, children }: { label: string; card: CardBodyProps & { copy: CardCopy }; wordless?: boolean; children: ReactNode }) {
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
  const { told, note } = toldLine(card, label, wordless);
  return (
    <div className="ch-akc" role="group" aria-label={reachLine(card.copy, phase, p, label)} data-ch-card-body={card.tool} data-density={density} data-phase={phase} data-reach={card.copy.reach} data-editing={open ? '' : undefined}>
      {p.undo?.window === false && !isSaved(phase) && !isWithdrawn(phase) && (
        <Warning first>
          <b>This happens the moment you press.</b> There is no Undo.
        </Warning>
      )}
      {children}
      {missed.length > 0 && <p className="ch-akc-missed">Did not get it: {missed.map((m) => `${m.name} (${m.reason})`).join(', ')}</p>}
      <div className="ch-akc-foot">
        <p className="ch-akc-told" data-withdrawn={isWithdrawn(phase) ? '' : undefined}>
          {told}
          {note && <span> {note}</span>}
        </p>
        {p.undo?.after && !isWithdrawn(phase) && (
          <p className="ch-akc-after">
            {p.undo.window ? 'After the 8 seconds:' : 'Afterwards:'} {p.undo.after}
          </p>
        )}
        {canEdit && !open && (
          <div className="ch-akc-editkey">
            <Button variant="ghost" size="sm" leftIcon={Pencil} onClick={() => setOpen(true)}>
              Edit
            </Button>
            <small>You can change the {lowerList(fields.map((f) => f.label))}.</small>
          </div>
        )}
      </div>
      {open && <EditForm fields={fields} busy={!!card.editing} error={card.editError ?? null} onSubmit={(patch) => card.onEdit?.(patch)} onClose={() => setOpen(false)} />}
    </div>
  );
}
