'use client';


import { useState } from 'react';
import type { ActionProposal, ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Button } from '../../../../ui/Button';
import type { CardCopy } from './catalog';
import { clockRange, countedFact, dayWords, daysBetween, factOf, namesIn, peopleOf, plural, restOf, stampWords, valueOf } from './facts';
import { Body, Change, Delivery, Fold, Notice, People, Rows, Thing, Warning, Who, tense } from './kit';
import { isOpen, isSaved, type CardBodyProps, type CardPerson } from './types';

/** The bodies of the tasks that put something on the calendar or act on an event (CAPABILITIES.md A1 to A7, A19 to A22). */
export type BodyProps = CardBodyProps & { copy: CardCopy };

const ask = (p: BodyProps) => (isOpen(p.phase) ? p.onAsk : undefined);
/** Facts the plan marks missing that are not rows of their own ("Measurable target"). */
export function missingRows(p: ActionProposal): ProposalFact[] {
  return p.missing.filter((m) => !p.facts.some((f) => f.label === m)).map((label) => ({ label, value: 'Not set', missing: true }));
}
/** The facts a body sets in its own words that the coach still has to give: each is asked for as a line. */
export const unsetOf = (p: ActionProposal, labels: readonly string[]): ProposalFact[] => p.facts.filter((f) => f.missing && labels.includes(f.label));
const personFor = (roster: readonly CardPerson[] = [], name: string): CardPerson => roster.find((r) => r.name === name) ?? { id: name, name };
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

// ---------------------------------------------------------------------------------------------------------------------
// A1. One event
// ---------------------------------------------------------------------------------------------------------------------

export function EventBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const cal = p.visual?.kind === 'cal' ? p.visual : null;
  const invited = peopleOf(p, roster, valueOf(p, 'Invited'));
  const n = copy.told || invited.length;
  const allDay = !cal?.start;
  const lede =
    copy.reach === 'sends'
      ? tense(phase, { will: `Sends to ${plural(n, 'player')} and asks each for a reply`, did: `Sent to ${plural(n, 'player')}, who are asked to reply`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` })
      : invited.length
        ? `On ${plural(invited.length, 'player')}’ calendars. Nobody is told.`
        : 'On the team’s calendar. Nobody is told.';
  return (
    <Body label={lede} card={props} wordless={copy.reach === 'sends'}>
      <Who proposal={p} density={density}>
        <People people={invited} total={n} density={density} everyone={!!roster?.length && invited.length === roster.length} />
      </Who>
      <Thing
        title={cal?.title ?? p.summary}
        lines={cal ? [<span className="ch-num">{[dayWords(cal.date, true), allDay ? 'All day' : clockRange(cal.start, cal.end)].join(' · ')}</span>, cal.where ?? <span data-unset="">No place set</span>] : []}
        meta={[valueOf(p, 'Type') && titleCase(valueOf(p, 'Type')!)]}
      />
      <Delivery proposal={p} phase={phase} density={density} />
      <Fold density={density}>
        <Rows facts={restOf(p, ['When', 'Type', 'Where', 'Invited', ...(p.not_reached ? ['Will not get it'] : [])])} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A2. A repeating practice: every date as a tile
// ---------------------------------------------------------------------------------------------------------------------

/** "Tue, Nov 11" as the planner writes a date. Anything else is drawn as text. */
const DATE_WORDS = /^(\w{3}), (\w{3}) (\d{1,2})$/;

function DayTiles({ dates, limit }: { dates: string[]; limit: number | null }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? dates.slice(0, limit) : dates;
  // One row a month, the month said once at its head: a coach counts across a row, and a month's end is a row's end.
  const months: Array<{ month: string; days: Array<{ words: string; weekday: string; day: string; edge: boolean }> }> = [];
  const loose: string[] = [];
  shown.forEach((d, i) => {
    const m = d.match(DATE_WORDS);
    if (!m) return void loose.push(d);
    const last = months[months.length - 1];
    const group = last && last.month === m[2] ? last : (months.push({ month: m[2]!, days: [] }), months[months.length - 1]!);
    group.days.push({ words: d, weekday: m[1]!, day: m[3]!, edge: i === 0 || i === dates.length - 1 });
  });
  return (
    <div className="ch-akc-days" role="group" aria-label={`${dates.length} dates`}>
      {months.map((g) => (
        <div key={g.month + g.days[0]!.day} className="ch-akc-days__month">
          <small>{g.month}</small>
          <ol>
            {g.days.map((d) => (
              <li key={d.words}>
                <span className="ch-akc-tile" data-tone={d.edge ? 'edge' : undefined} role="img" aria-label={d.words}>
                  <small aria-hidden="true">{d.weekday}</small>
                  <b className="ch-num" aria-hidden="true">
                    {d.day}
                  </b>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {loose.length > 0 && <p className="ch-akc-days__text">{loose.join(' · ')}</p>}
      {limit && !all && dates.length > limit && (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
          {`Show all ${dates.length}`}
        </Button>
      )}
    </div>
  );
}

export function SeriesBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const people = peopleOf(p, roster);
  const n = copy.told || people.length;
  // The plan's own list of days when it carries one; else the planner's sentence of dates, read back.
  const series = p.visual?.kind === 'series' ? p.visual : null;
  const dates = series ? series.dates.map((d) => dayWords(d)) : (valueOf(p, 'Dates') ?? '').split(' · ').filter(Boolean);
  const lede =
    copy.reach === 'sends'
      ? tense(phase, { will: `Sends to ${plural(n, 'player')} and asks each for a reply`, did: `Sent to ${plural(n, 'player')}, who are asked to reply`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` })
      : `On ${plural(people.length, 'player')}’ calendars. Nobody is told.`;
  return (
    <Body label={lede} card={props} wordless={copy.reach === 'sends'}>
      <Who proposal={p} density={density}>
        <People people={people} density={density} everyone={!!roster?.length && people.length === roster.length} />
      </Who>
      <Thing title={series?.title ?? p.summary} lines={[valueOf(p, 'Repeats'), series && <span className="ch-num">{[clockRange(series.start, series.end), series.where].filter(Boolean).join(' · ')}</span>]}>
        <DayTiles dates={dates} limit={density === 'compact' ? 4 : null} />
      </Thing>
      <Delivery proposal={p} phase={phase} density={density} />
      <Fold density={density}>
        <Rows facts={restOf(p, ['Repeats', 'Dates', 'Occurrences', 'Invites', ...(p.not_reached ? ['Will not get it'] : [])])} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A3 to A5. The quiet calendar marks: blocked time, a break, a term
// ---------------------------------------------------------------------------------------------------------------------

export function BlockedBody(props: BodyProps) {
  const { proposal: p, density } = props;
  // "2026-11-13, 13:00 to 15:00", or with a last day: "2026-11-13 to 2026-11-14, all day".
  const [days = '', hours] = (valueOf(p, 'When') ?? '').split(', ');
  const [day, lastDay] = days.split(' to ');
  const [from, to] = (hours ?? '').split(' to ');
  const lede = 'Only you see this. It is not on any player’s calendar.';
  return (
    <Body label={lede} card={props}>
      <Thing title={p.summary} lines={[day && <span className="ch-num">{[lastDay ? `${dayWords(day)} to ${dayWords(lastDay)}` : dayWords(day, true), to ? clockRange(from, to) : 'All day'].join(' · ')}</span>]} />
      <Rows facts={restOf(p, ['When'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

export function BreakBody(props: BodyProps) {
  const { proposal: p, density } = props;
  const [first, last] = (valueOf(p, 'Dates') ?? '').split(' to ');
  const lede = p.notifications[0] ?? 'Nobody is told.';
  return (
    <Body label={lede} card={props}>
      <Thing title={p.summary} lines={[first && last && <span className="ch-num">{`${dayWords(first, true)} to ${dayWords(last, true)}`}</span>]} meta={[first && last && plural(daysBetween(first, last), 'day')]} />
      <Rows facts={restOf(p, ['Dates'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

export function TermBody(props: BodyProps) {
  const { proposal: p, density } = props;
  const [start, end] = (valueOf(p, 'Classes') ?? '').split(' to ');
  const exams = valueOf(p, 'Exams end');
  const lede = p.notifications[0] ?? 'Nobody is told.';
  return (
    <Body label={lede} card={props}>
      <Thing title={p.summary} lines={[start && end && <span className="ch-num">{`Classes run ${dayWords(start)} to ${dayWords(end)}`}</span>, exams && <span className="ch-num">{`Exams end ${dayWords(exams)}`}</span>]} />
      <Rows facts={restOf(p, ['Classes', 'Exams end'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A6. A trip
// ---------------------------------------------------------------------------------------------------------------------

const HOW: Record<string, string> = { bus: 'Bus', van: 'Van', flight: 'Flight', carpool: 'Carpool' };

export function TripBody(props: BodyProps) {
  const { proposal: p, density } = props;
  const trip = p.visual?.kind === 'trip' ? p.visual : null;
  const how = HOW[trip?.how ?? ''] ?? titleCase(trip?.how ?? 'Transport');
  const told = p.notifications[0] ?? '';
  const lede = 'Players see it as new travel. Nobody is told.';
  const back = stampWords(valueOf(p, 'Back'));
  return (
    <Body label={lede} card={props}>
      {trip ? (
        <Thing
          title={p.summary}
          lines={[
            <>
              {how} from {trip.from ?? <span data-unset="">a place not set</span>} to {trip.to}
            </>,
            <span className="ch-num">{[`Leaves ${stampWords(valueOf(p, 'Leaves')) || 'at a time not set'}`, back ? `Back ${back}` : 'No return set'].join(' · ')}</span>,
          ]}
        />
      ) : (
        <Thing title={p.summary} />
      )}
      <Fold density={density}>
        <Rows facts={restOf(p, ['Leaves', 'How', 'From', 'Back']).filter((f) => f.value !== 'Not set')} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
      {/confirmation number/i.test(told) && <Warning>Every team member can read the hotel confirmation number.</Warning>}
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A7. A qualifier
// ---------------------------------------------------------------------------------------------------------------------

export function QualifierBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const q = p.visual?.kind === 'qual' ? p.visual : null;
  const field = peopleOf(p, roster, valueOf(p, 'Players'));
  const n = copy.told || field.length;
  const lede = tense(phase, { will: `Sends to ${plural(n, 'player')}: a push and an email`, did: `Sent to ${plural(n, 'player')}: a push and an email`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` });
  const earned = q ? Math.max(0, q.total - q.picks) : 0;
  const extra: ProposalFact[] = q?.deadline && !factOf(p, 'Entry deadline') ? [{ label: 'Entry deadline', value: dayWords(q.deadline) }] : [];
  return (
    <Body label={lede} card={props} wordless>
      <Who proposal={p} density={density}>
        <People people={field} total={q?.field} density={density} />
      </Who>
      {q ? (
        <Thing
          title={q.title || p.summary}
          lines={[
            <span className="ch-num">{[plural(q.rounds, 'round'), `from ${dayWords(q.start)}`, `${plural(q.field, 'player')} in the field`].join(' · ')}</span>,
            <span className="ch-num" role="img" aria-label={`${earned} qualify on score, ${plural(q.picks, 'coach pick')}`}>
              {`${plural(q.total, 'seat')}: ${earned} on score${q.picks > 0 ? `, ${plural(q.picks, 'coach pick')}` : ''}`}
            </span>,
          ]}
        />
      ) : (
        <Thing title={p.summary} />
      )}
      <Delivery proposal={p} phase={phase} density={density} />
      <Fold density={density}>
        <Rows facts={[...restOf(p, ['Starts', 'Rounds', 'Squad', 'Players', ...(p.not_reached ? ['Will not get it'] : [])]).filter((f) => f.value !== 'Not set'), ...extra]} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A19, A20. A lineup, and locking it
// ---------------------------------------------------------------------------------------------------------------------

type Seats = Extract<NonNullable<ActionProposal['visual']>, { kind: 'lineup' }>;

function SeatList({ seats, roster, label }: { seats: Seats['seats']; roster?: readonly CardPerson[]; label: string }) {
  return (
    <ol aria-label={label}>
      {seats.map((s) => (
        <li key={s.name}>
          <span className="ch-akc-lineup__n ch-num">{s.slot ?? '–'}</span>
          <Avatar name={s.name} id={s.id ?? personFor(roster, s.name).id} size="xs" />
          <span>
            {s.name}
            {s.role === 'individual' && <small> · individual</small>}
            {s.reasoning && <small className="ch-akc-lineup__why">{s.reasoning}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Seating({ visual, roster, fallback }: { visual: Seats; roster?: readonly CardPerson[]; /** The card's own name, when the plan does not carry the tournament. */ fallback: string }) {
  const playing = visual.seats.filter((s) => !s.alternate);
  const alternates = visual.seats.filter((s) => s.alternate);
  return (
    <div className="ch-akc-lineup">
      <Thing title={visual.tournament?.name ?? fallback} meta={[visual.tournament && (visual.tournament.end ? `${dayWords(visual.tournament.date)} to ${dayWords(visual.tournament.end)}` : dayWords(visual.tournament.date))]} />
      <SeatList seats={playing} roster={roster} label="Lineup" />
      {alternates.length > 0 && (
        <>
          <small>{alternates.length === 1 ? 'Alternate' : 'Alternates'}</small>
          <SeatList seats={alternates} roster={roster} label="Alternates" />
        </>
      )}
    </div>
  );
}

export function LineupBody(props: BodyProps) {
  const { proposal: p, roster } = props;
  const visual = p.visual?.kind === 'lineup' ? p.visual : null;
  const lede = p.notifications[0] ?? 'Nobody is told.';
  // Who comes in and who goes out, when the plan carries the lineup saved now.
  const before = visual?.replaces;
  const names = (list: ReadonlyArray<{ name: string; alternate: boolean }>) => list.filter((s) => !s.alternate).map((s) => s.name);
  const comesIn = visual && before ? names(visual.seats).filter((n) => !names(before).includes(n)) : [];
  const goesOut = visual && before ? names(before).filter((n) => !names(visual.seats).includes(n)) : [];
  return (
    <Body label={lede} card={props}>
      {visual ? <Seating visual={visual} roster={roster} fallback={p.summary} /> : <Thing title={p.summary} />}
      {before && before.length === 0 && <Change>No lineup is saved yet. This is the first.</Change>}
      {before && before.length > 0 && (
        <Change>
          <b>Replaces the lineup saved now.</b> {comesIn.length || goesOut.length ? [comesIn.length ? `In: ${comesIn.join(', ')}.` : null, goesOut.length ? `Out: ${goesOut.join(', ')}.` : null].filter(Boolean).join(' ') : 'The same players, in a new order.'}
        </Change>
      )}
      {!visual?.tournament && <p className="ch-akc-gap">The plan does not say which tournament, or what lineup this replaces.</p>}
    </Body>
  );
}

export function LockBody(props: BodyProps) {
  const { proposal: p, phase, roster } = props;
  const visual = p.visual?.kind === 'lineup' ? p.visual : null;
  const lede = isSaved(phase) ? 'Locked. Nobody was told.' : 'Nobody is told.';
  return (
    <Body label={lede} card={props}>
      {/* A card whose plan carries `undo` gets this warning from the frame; an older one gets it here. */}
      {!p.undo && !isSaved(phase) && (
        <Warning first>
          <b>This locks the moment you press.</b> There is no Undo.
        </Warning>
      )}
      {visual && <Seating visual={visual} roster={roster} fallback="The lineup" />}
      {p.impact ? <p className="ch-akc-meta">{p.impact}</p> : p.notifications[0] && <p className="ch-akc-meta">{p.notifications[0]}</p>}
      {!visual && <p className="ch-akc-gap">The plan does not show the lineup. Open the tournament to check it first.</p>}
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A21. An event reminder: every recipient, and the words
// ---------------------------------------------------------------------------------------------------------------------

export function ReminderBody(props: BodyProps) {
  const { proposal: p, phase, density, roster } = props;
  const to = countedFact(p, 'To');
  const people = peopleOf(p, roster, to?.fact.value);
  const n = to?.count ?? people.length;
  const [title, ...rest] = (valueOf(p, 'They see') ?? '').split('\n');
  const missed = valueOf(p, 'Will not get it');
  const lede = tense(phase, { will: `Sends to ${plural(n, 'player')}, in the app`, did: `Sent to ${plural(n, 'player')}, in the app`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` });
  return (
    <Body label={lede} card={props} wordless={!title}>
      <Who proposal={p} density={density}>
        <People people={people} total={n} density={density} />
        {missed && !p.not_reached && <p className="ch-akc-missed">Will not get it: {missed}</p>}
      </Who>
      {valueOf(p, 'Event') && <p className="ch-akc-subject">{valueOf(p, 'Event')}</p>}
      <Delivery proposal={p} phase={phase} density={density}>
        {title && <Notice title={title} body={rest.join('\n')} caption={tense(phase, { will: 'What each of them gets', did: 'What each of them got', not: 'What they would have got' })} density={density} />}
      </Delivery>
      <Fold density={density}>
        <Rows facts={restOf(p, ['To', 'Will not get it', 'They see', 'When', 'Event'])} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A22. Attendance: the roll
// ---------------------------------------------------------------------------------------------------------------------

const MARKS = ['Present', 'Late', 'No-show'] as const;

export function AttendanceBody(props: BodyProps) {
  const { proposal: p, density, roster } = props;
  const lede = 'Nothing is sent to players.';
  const changes = valueOf(p, 'Changes a mark already recorded');
  const left = valueOf(p, 'Not marked');
  // "Short-game practice · Thu, Nov 12, 3:00 PM": the event's name is the title, when it is the quiet line under it.
  const event = (valueOf(p, 'Event') ?? '').split(' · ').filter(Boolean);
  return (
    <Body label={lede} card={props}>
      <Thing title={event[0] ?? p.summary} meta={[event.slice(1).join(' · ')]} />
      <div className="ch-akc-roll">
        {MARKS.map((word) => {
          const group = countedFact(p, word);
          if (!group) return null;
          return (
            <section key={word} aria-label={`${word}, ${group.count}`}>
              <h5>
                {word} <span className="ch-num">{group.count}</span>
              </h5>
              <People people={namesIn(group.fact.value).map((name) => personFor(roster, name))} density={density} />
            </section>
          );
        })}
      </div>
      {changes && (
        <Change>
          <b>Changes a mark already recorded.</b> {changes}
        </Change>
      )}
      {left && <p className="ch-akc-meta">{left}</p>}
    </Body>
  );
}
