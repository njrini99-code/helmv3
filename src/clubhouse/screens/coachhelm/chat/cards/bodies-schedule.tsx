'use client';

import { Bus, Car, MapPin, Plane, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ActionProposal, ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Badge, type BadgeTone } from '../../../../ui/Badge';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import type { CardCopy } from './catalog';
import { clockRange, countedFact, dayWords, daysBetween, factOf, namesIn, peopleOf, plural, restOf, stampWords, valueOf } from './facts';
import { Body, Change, DateTile, Fold, NoWords, Notice, People, ReachRow, Rows, Warning, tense } from './kit';
import { isOpen, isSaved, type CardBodyProps, type CardPerson } from './types';

/** The bodies of the tasks that put something on the calendar or act on an event (CAPABILITIES.md A1 to A7, A19 to A22). */
export type BodyProps = CardBodyProps & { copy: CardCopy };

const ask = (p: BodyProps) => (isOpen(p.phase) ? p.onAsk : undefined);
/** Facts the plan marks missing that are not rows of their own ("Measurable target"). */
export function missingRows(p: ActionProposal): ProposalFact[] {
  return p.missing.filter((m) => !p.facts.some((f) => f.label === m)).map((label) => ({ label, value: 'Not set', missing: true }));
}
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={invited} total={n} density={density} everyone={!!roster?.length && invited.length === roster.length} />
      </ReachRow>
      {cal && (
        <div className="ch-akc-event" data-pending={phase === 'held' || phase === 'undoing' || phase === 'committing' ? '' : undefined}>
          <DateTile iso={cal.date} />
          <div className="ch-akc-event__tx">
            <b className="ch-num">{allDay ? 'All day' : clockRange(cal.start, cal.end)}</b>
            <span>{dayWords(cal.date, true)}</span>
            <span className="ch-akc-event__where">
              <Icon icon={MapPin} size={13} />
              {cal.where ?? 'No place set'}
            </span>
          </div>
          {valueOf(p, 'Type') && <Badge>{titleCase(valueOf(p, 'Type')!)}</Badge>}
        </div>
      )}
      {copy.reach === 'sends' && <NoWords channel={p.notifications.join(' ')} phase={phase} />}
      <Fold density={density}>
        <Rows facts={restOf(p, ['When', 'Type', 'Where', 'Invited'])} density={density} subject={p.summary} onAsk={ask(props)} />
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
                <span className="ch-akc-tile is-day" data-tone={d.edge ? 'edge' : undefined} role="img" aria-label={d.words}>
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
  const dates = (valueOf(p, 'Dates') ?? '').split(' · ').filter(Boolean);
  const lede =
    copy.reach === 'sends'
      ? tense(phase, { will: `Sends to ${plural(n, 'player')} and asks each for a reply`, did: `Sent to ${plural(n, 'player')}, who are asked to reply`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` })
      : `On ${plural(people.length, 'player')}’ calendars. Nobody is told.`;
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} density={density} everyone={!!roster?.length && people.length === roster.length} />
      </ReachRow>
      <div className="ch-akc-series">
        <p className="ch-akc-series__rule">{valueOf(p, 'Repeats')}</p>
        <DayTiles dates={dates} limit={density === 'compact' ? 4 : null} />
      </div>
      {copy.reach === 'sends' && <NoWords channel={`${p.notifications.join('. ')}.`} phase={phase} />}
      <Fold density={density}>
        <Rows facts={restOf(p, ['Repeats', 'Dates', 'Occurrences', 'Invites'])} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A3 to A5. The quiet calendar marks: blocked time, a break, a term
// ---------------------------------------------------------------------------------------------------------------------

export function BlockedBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const [day, hours] = (valueOf(p, 'When') ?? '').split(', ');
  const [from, to] = (hours ?? '').split(' to ');
  const lede = 'Only you see this. It is not on any player’s calendar.';
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      <div className="ch-akc-event">
        {day && <DateTile iso={day} />}
        <div className="ch-akc-event__tx">
          <b className="ch-num">{to ? clockRange(from, to) : 'All day'}</b>
          {day && <span>{dayWords(day, true)}</span>}
        </div>
      </div>
      <Rows facts={restOf(p, ['When'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

export function BreakBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const [first, last] = (valueOf(p, 'Dates') ?? '').split(' to ');
  const lede = p.notifications[0] ?? 'Nobody is told.';
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      <div className="ch-akc-span">
        {first && last && (
          <div className="ch-akc-span__run" role="img" aria-label={`${dayWords(first, true)} to ${dayWords(last, true)}, ${plural(daysBetween(first, last), 'day')}`}>
            <DateTile iso={first} tone="edge" />
            <span className="ch-akc-span__rule" aria-hidden="true">
              <i />
              <em className="ch-num">{plural(daysBetween(first, last), 'day')}</em>
              <i />
            </span>
            <DateTile iso={last} tone="edge" />
          </div>
        )}
      </div>
      <Rows facts={restOf(p, ['Dates'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

export function TermBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const [start, end] = (valueOf(p, 'Classes') ?? '').split(' to ');
  const exams = valueOf(p, 'Exams end');
  const lede = p.notifications[0] ?? 'Nobody is told.';
  const classDays = start && end ? daysBetween(start, end) : 0;
  const examDays = end && exams ? Math.max(1, daysBetween(end, exams) - 1) : 0;
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      <div className="ch-akc-term">
        {start && end && exams && (
          <>
            <div className="ch-akc-term__bar" aria-hidden="true">
              <i style={{ flexGrow: classDays }} />
              <i className="is-exams" style={{ flexGrow: examDays }} />
            </div>
            <dl className="ch-akc-term__dates">
              <div>
                <dt>Classes start</dt>
                <dd className="ch-num">{dayWords(start)}</dd>
              </div>
              <div>
                <dt>Classes end</dt>
                <dd className="ch-num">{dayWords(end)}</dd>
              </div>
              <div>
                <dt>Exams end</dt>
                <dd className="ch-num">{dayWords(exams)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
      <Rows facts={restOf(p, ['Classes', 'Exams end'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A6. A trip
// ---------------------------------------------------------------------------------------------------------------------

const HOW: Record<string, { icon: LucideIcon; word: string }> = { bus: { icon: Bus, word: 'Bus' }, van: { icon: Car, word: 'Van' }, flight: { icon: Plane, word: 'Flight' }, carpool: { icon: Users, word: 'Carpool' } };

export function TripBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const trip = p.visual?.kind === 'trip' ? p.visual : null;
  const how = HOW[trip?.how ?? ''] ?? { icon: Bus, word: titleCase(trip?.how ?? 'Transport') };
  const gear = namesIn(valueOf(p, 'Gear'));
  const told = p.notifications[0] ?? '';
  const lede = 'Players see it as new travel. Nobody is told.';
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      {trip && (
        <div className="ch-akc-trip">
          <div className="ch-akc-trip__route" role="img" aria-label={`${how.word} from ${trip.from ?? 'a place not set'} to ${trip.to}`}>
            <span className="ch-akc-trip__end">
              <small>From</small>
              <b data-unset={trip.from ? undefined : ''}>{trip.from ?? 'Not set'}</b>
            </span>
            <span className="ch-akc-trip__leg" aria-hidden="true">
              <i />
              <em>
                <Icon icon={how.icon} size={14} />
                {how.word}
              </em>
              <i />
            </span>
            <span className="ch-akc-trip__end is-to">
              <small>To</small>
              <b>{trip.to}</b>
            </span>
          </div>
          <dl className="ch-akc-trip__when">
            <div>
              <dt>Leaves</dt>
              <dd className="ch-num">{stampWords(valueOf(p, 'Leaves')) || 'Not set'}</dd>
            </div>
            <div>
              <dt>Back</dt>
              <dd className="ch-num" data-unset={valueOf(p, 'Back') ? undefined : ''}>{stampWords(valueOf(p, 'Back')) || 'No return set'}</dd>
            </div>
          </dl>
        </div>
      )}
      <Fold density={density}>
        <Rows facts={restOf(p, ['Leaves', 'How', 'From', 'Back', 'Gear']).filter((f) => f.value !== 'Not set')} density={density} subject={p.summary} onAsk={ask(props)} />
        {gear.length > 0 && (
          <div className="ch-akc-chips">
            <small>Gear</small>
            <ul>
              {gear.map((g) => (
                <li key={g}>
                  <Badge>{g}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
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
  const extra: ProposalFact[] = q?.deadline ? [{ label: 'Entry deadline', value: dayWords(q.deadline) }] : [];
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={field} total={q?.field} density={density} />
      </ReachRow>
      {q && (
        <div className="ch-akc-qual">
          <p className="ch-akc-subject">{[plural(q.rounds, 'round'), `from ${dayWords(q.start)}`, `${plural(q.field, 'player')} in the field`].join(' · ')}</p>
          <div className="ch-akc-qual__seats" role="img" aria-label={`${earned} qualify on score, ${plural(q.picks, 'coach pick')}`}>
            {Array.from({ length: q.total }, (_, i) => (
              <i key={i} data-pick={i >= earned ? '' : undefined} />
            ))}
            <span>
              <b className="ch-num">{earned}</b> qualify on score{q.picks > 0 && (
                <>
                  , <b className="ch-num">{q.picks}</b> coach {q.picks === 1 ? 'pick' : 'picks'}
                </>
              )}
            </span>
          </div>
        </div>
      )}
      <NoWords channel={p.notifications.join(' ')} phase={phase} />
      <Fold density={density}>
        <Rows facts={[...restOf(p, ['Starts', 'Rounds', 'Squad', 'Players']).filter((f) => f.value !== 'Not set'), ...extra]} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A19, A20. A lineup, and locking it
// ---------------------------------------------------------------------------------------------------------------------

export function LineupBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const seats = p.visual?.kind === 'lineup' ? p.visual.seats : [];
  const lede = p.notifications[0] ?? 'Nobody is told.';
  const playing = seats.filter((s) => !s.alternate);
  const alternates = seats.filter((s) => s.alternate);
  const Seat = ({ s }: { s: (typeof seats)[number] }) => (
    <li>
      <span className="ch-akc-lineup__n ch-num">{s.slot ?? '–'}</span>
      <Avatar name={s.name} id={personFor(roster, s.name).id} size="xs" />
      <span>{s.name}</span>
    </li>
  );
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      <div className="ch-akc-lineup">
        <ol aria-label="Lineup">
          {playing.map((s) => (
            <Seat key={s.name} s={s} />
          ))}
        </ol>
        {alternates.length > 0 && (
          <>
            <small>{alternates.length === 1 ? 'Alternate' : 'Alternates'}</small>
            <ol aria-label="Alternates">
              {alternates.map((s) => (
                <Seat key={s.name} s={s} />
              ))}
            </ol>
          </>
        )}
      </div>
      <p className="ch-akc-gap">The plan does not say which tournament, or what lineup this replaces.</p>
    </Body>
  );
}

export function LockBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const blind = (factOf(p, 'Tournament')?.value ?? 'As set') === 'As set';
  const lede = isSaved(phase) ? 'Locked. Nobody was told.' : 'Nobody is told.';
  return (
    <Body label="This locks the moment you press. There is no Undo." phase={phase} density={density} tool={props.tool}>
      {!isSaved(phase) && (
        <Warning first>
          <b>This locks the moment you press.</b> There is no Undo.
        </Warning>
      )}
      <ReachRow copy={copy} phase={phase} lede={lede} />
      {p.notifications[0] && <p className="ch-akc-meta">{p.notifications[0]}</p>}
      {blind && <p className="ch-akc-gap">The plan does not show the lineup. Open the tournament to check it first.</p>}
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A21. An event reminder: every recipient, and the words
// ---------------------------------------------------------------------------------------------------------------------

export function ReminderBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const to = countedFact(p, 'To');
  const people = peopleOf(p, roster, to?.fact.value);
  const n = to?.count ?? people.length;
  const [title, ...rest] = (valueOf(p, 'They see') ?? '').split('\n');
  const missed = valueOf(p, 'Will not get it');
  const lede = tense(phase, { will: `Sends to ${plural(n, 'player')}, in the app`, did: `Sent to ${plural(n, 'player')}, in the app`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` });
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} total={n} density={density} />
        {missed && (
          <p className="ch-akc-missed">
            <b>Will not get it:</b> {missed}
          </p>
        )}
      </ReachRow>
      {title && <Notice title={title} body={rest.join('\n')} caption={tense(phase, { will: 'What each of them gets', did: 'What each of them got', not: 'What they would have got' })} density={density} />}
      <Fold density={density}>
        <Rows facts={restOf(p, ['To', 'Will not get it', 'They see', 'When'])} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A22. Attendance: the roll
// ---------------------------------------------------------------------------------------------------------------------

const MARKS: ReadonlyArray<{ word: string; tone: BadgeTone }> = [
  { word: 'Present', tone: 'positive' },
  { word: 'Late', tone: 'warning' },
  { word: 'No-show', tone: 'neutral' },
];

export function AttendanceBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const lede = 'Nothing is sent to players.';
  const changes = valueOf(p, 'Changes a mark already recorded');
  const left = valueOf(p, 'Not marked');
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      {valueOf(p, 'Event') && <p className="ch-akc-subject">{valueOf(p, 'Event')}</p>}
      <div className="ch-akc-roll">
        {MARKS.map(({ word, tone }) => {
          const group = countedFact(p, word);
          if (!group) return null;
          return (
            <section key={word} aria-label={`${word}, ${group.count}`}>
              <h4>
                <Badge tone={tone}>{word}</Badge>
                <span className="ch-num">{group.count}</span>
              </h4>
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
