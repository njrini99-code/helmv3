'use client';

import { missingRows, unsetOf, type BodyProps } from './bodies-schedule';
import { count, dayWords, factOf, peopleOf, plural, restOf, valueOf } from './facts';
import { Body, Bubble, Change, Clamp, Delivery, Diff, Meta, Notice, People, Quote, Thing, Who, sentence, tense } from './kit';
import type { CardPerson } from './types';
import { pluralWord } from '../../../../lib/plural';

/**
 * The bodies of the tasks about a player, words that are sent, and things that are published (CAPABILITIES.md A8 to A18).
 * Each one reads the same way: who it is for, the thing itself as that person will see it, the words that are sent, and
 * any fact left over as a plain line. Who is told and where it appears is the frame's one line at the foot (`Body`).
 */

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
const who = (roster: readonly CardPerson[] = [], name: string): CardPerson => roster.find((r) => r.name === name) ?? { id: name, name };

// ---------------------------------------------------------------------------------------------------------------------
// A8. A goal
// ---------------------------------------------------------------------------------------------------------------------

export function GoalBody(props: BodyProps) {
  const { proposal: p, phase, density, roster } = props;
  const g = p.visual?.kind === 'goal' ? p.visual : null;
  const name = g?.player ?? valueOf(p, 'Player') ?? 'the player';
  const lede = tense(phase, { will: `Sends to ${name}: a push`, did: `Sent to ${name}: a push`, not: `Not sent. ${name} was not told.` });
  const how = valueOf(p, 'How');
  return (
    <Body label={lede} card={props} rows={restOf(p, ['Player', 'Target', 'By', 'How', 'Goal', 'Now', 'Better is'])} wordless>
      <Who proposal={p} density={density}>
        {(g?.player || valueOf(p, 'Player')) && <People people={[who(roster, name)]} density={density} />}
      </Who>
      {g ? (
        <Thing
          title={g.stat}
          lines={[
            <>
              Reach{' '}
              <b className="ch-num">
                {g.target}
                {g.unit && <span className="ch-akc-goal__unit"> {g.unit}</span>}
              </b>{' '}
              in {plural(g.days, 'day')}
            </>,
          ]}
        >
          <p className="ch-akc-meta">
            {g.current != null && (
              <>
                Now <span className="ch-akc-goal__now ch-num">{g.current}</span>
                {(g.better || how) && ' · '}
              </>
            )}
            {[g.better ? (g.better === 'up' ? 'Higher is better' : 'Lower is better') : null, how].filter(Boolean).join(' · ')}
          </p>
          {g.current === null && <p className="ch-akc-meta">No rounds yet in the 90 days a goal is measured from, so there is no figure for now.</p>}
          {g.current === undefined && <p className="ch-akc-gap">The plan does not say where {name.split(' ')[0]} stands on this now.</p>}
        </Thing>
      ) : (
        <Thing title={valueOf(p, 'Goal') ?? p.summary} />
      )}
      <Delivery proposal={p} phase={phase} density={density} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A9. A focus area: the focus as the player's Home will show it
// ---------------------------------------------------------------------------------------------------------------------

/** The facts of a focus that the body sets in its own words. One the coach still has to give is asked for as a line. */
const FOCUS_SET = ['Goal', 'Target', 'Review on', 'Review', 'By', 'Over'];

export function FocusBody(props: BodyProps) {
  const { proposal: p, phase, density, roster } = props;
  const people = peopleOf(p, roster, valueOf(p, 'Player'));
  const name = people[0]?.name ?? 'the player';
  const lede = tense(phase, { will: `Sends to ${name}, who is asked to accept it`, did: `Sent to ${name}, who is asked to accept it`, not: `Not sent. ${name} was not told.` });
  const status = valueOf(p, 'Status');
  const area = valueOf(p, 'Area');
  const target = valueOf(p, 'Target');
  const review = valueOf(p, 'Review on') ?? valueOf(p, 'Review');
  const by = valueOf(p, 'By');
  const over = valueOf(p, 'Over');
  return (
    <Body label={lede} card={props} rows={[...missingRows(p), ...unsetOf(p, FOCUS_SET), ...restOf(p, ['Player', 'Focus', 'Area', 'Status', ...FOCUS_SET])]} wordless>
      <Who proposal={p} density={density}>
        <People people={people} density={density} />
      </Who>
      <Thing
        title={valueOf(p, 'Focus') ?? p.summary}
        lines={[valueOf(p, 'Goal'), target && titleCase(target)]}
        meta={[review && `Review ${review}`, by && `By ${by}`, over && `Over ${over}`, area && titleCase(area)]}
      />
      <Delivery proposal={p} phase={phase} density={density} />
      {status && <Change>{sentence(status)}</Change>}
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A10. A task, as Tasks shows it
// ---------------------------------------------------------------------------------------------------------------------

export function TaskBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const t = p.visual?.kind === 'task' ? p.visual : null;
  const people = peopleOf(p, roster);
  const n = copy.told || people.length;
  const everyone = /^All \d+/.test(valueOf(p, 'Assigned to') ?? '');
  const lede = tense(phase, { will: `Sends to ${plural(n, 'player')}, in the app`, did: `Sent to ${plural(n, 'player')}, in the app`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` });
  const due = factOf(p, 'Due');
  const priority = valueOf(p, 'Priority');
  return (
    <Body label={lede} card={props} rows={[...(due?.missing ? [{ ...due, label: 'Due date', value: 'Not set' }] : []), ...restOf(p, ['Task', 'Assigned to', 'Due', 'Priority'])]} wordless>
      <Who proposal={p} density={density}>
        <People people={people} density={density} everyone={everyone} />
      </Who>
      <Thing title={t?.title ?? valueOf(p, 'Task') ?? p.summary} meta={[t?.due ? `Due ${dayWords(t.due)}` : null, priority && priority !== 'medium' ? `${titleCase(priority)} priority` : null]} />
      <Delivery proposal={p} phase={phase} density={density} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A11. A team announcement: the words, exactly
// ---------------------------------------------------------------------------------------------------------------------

export function AnnouncementBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const people = peopleOf(p, roster);
  const n = copy.told || people.length;
  const everyone = /^Everyone/.test(valueOf(p, 'To') ?? '');
  const lede = tense(phase, { will: everyone ? `Sends to all ${plural(n, 'player')}` : `Sends to ${plural(n, 'player')}`, did: `Sent to ${plural(n, 'player')}`, not: `Not sent. It would have gone to ${plural(n, 'player')}.` });
  const urgency = valueOf(p, 'Urgency');
  // How it arrives is part of the announcement: one line under its words, not a fact behind Details.
  const marked = [urgency && urgency !== 'normal' ? `Marked ${urgency.replace(/_/g, ' ')}` : null, valueOf(p, 'Acknowledgement') === 'Required' ? 'Each player must acknowledge it' : null];
  return (
    <Body label={lede} card={props} rows={restOf(p, ['Title', 'Message', 'To', 'Urgency', 'Acknowledgement'])}>
      <Who proposal={p} density={density}>
        <People people={people} density={density} everyone={everyone} />
      </Who>
      <Delivery proposal={p} phase={phase} density={density}>
        <Notice title={valueOf(p, 'Title') ?? p.summary} body={valueOf(p, 'Message')} caption={tense(phase, { will: 'What each of them gets', did: 'What each of them got', not: 'What they would have got' })} density={density} />
      </Delivery>
      <Meta parts={marked} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A12, A13. Notes: on a round (the player reads it), on availability (coaches only)
// ---------------------------------------------------------------------------------------------------------------------

export function RoundNoteBody(props: BodyProps) {
  const { proposal: p, phase, density, roster } = props;
  const note = p.visual?.kind === 'note' ? p.visual : null;
  const name = note?.player ?? 'The player';
  const earlier = valueOf(p, 'Earlier note');
  const lede = tense(phase, { will: `${name} will see this note on the round. No notification is sent.`, did: `${name} can see this note on the round.`, not: `Not added. ${name} sees nothing new.` });
  const round = note?.round;
  return (
    <Body label={lede} card={props}>
      <Who density={density}>{note?.player && <People people={[who(roster, note.player)]} density={density} />}</Who>
      {round ? (
        <Thing title={round.course ?? 'This round'} meta={[round.date ? dayWords(round.date) : null, round.score != null ? `${round.score}` : null]} />
      ) : (
        <p className="ch-akc-gap">The plan does not say which round: no course, date or score.</p>
      )}
      {earlier && <Quote text={earlier} caption="Already on the round" quiet density={density} />}
      <Quote text={note?.note ?? valueOf(p, 'Adding') ?? ''} caption={earlier ? 'Adding under it' : 'The note'} density={density} />
      {earlier && <Change>The earlier note stays. This goes under it.</Change>}
    </Body>
  );
}

export function AvailabilityBody(props: BodyProps) {
  const { proposal: p, density } = props;
  const name = p.summary.replace(/^Availability note for /, '');
  const replaces = valueOf(p, 'Replaces');
  const lede = `Coaches only. ${name.split(' ')[0]} never sees this.`;
  return (
    <Body label={lede} card={props}>
      <Thing title={name} />
      <Quote text={valueOf(p, 'Note') ?? ''} caption="The note" density={density} />
      {replaces && <Quote text={replaces} caption="Replaces" quiet struck density={density} />}
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A14, A15. A recruit, a drill
// ---------------------------------------------------------------------------------------------------------------------

export function RecruitBody(props: BodyProps) {
  const { proposal: p } = props;
  const year = valueOf(p, 'Grad year');
  const status = valueOf(p, 'Status');
  const lede = 'Coaches only. Players never see recruits.';
  return (
    <Body label={lede} card={props} rows={restOf(p, ['Grad year', 'Status', 'Hometown'])}>
      <Thing title={p.summary} lines={[[year ? `Class of ${year}` : null, valueOf(p, 'Hometown')].filter(Boolean).join(' · ') || 'No class or hometown given']} meta={[status && titleCase(status)]} />
    </Body>
  );
}

export function DrillBody(props: BodyProps) {
  const { proposal: p, density } = props;
  const setup = valueOf(p, 'Setup');
  const lede = 'Players see it only when a published plan uses it.';
  return (
    <Body label={lede} card={props} rows={restOf(p, ['Area', 'Length', 'Setup', 'Goal'])}>
      <Thing title={p.summary} meta={[valueOf(p, 'Area'), valueOf(p, 'Length')]}>
        {setup && <Clamp text={setup} lines={density === 'compact' ? 2 : 4} density={density} what="setup" />}
        {valueOf(p, 'Goal') && <p className="ch-akc-thing__l">{valueOf(p, 'Goal')}</p>}
      </Thing>
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A16, A17. Publishing: a practice plan (people are told), a document (nobody is)
// ---------------------------------------------------------------------------------------------------------------------

export function PublishPlanBody(props: BodyProps) {
  const { proposal: p, phase, density, roster } = props;
  const pub = p.publish;
  const tells = pub?.tellsLine ?? valueOf(p, 'Tells') ?? '';
  const everyone = pub?.people;
  const people = everyone ? everyone.map((x) => ({ id: x.id ?? x.name, name: x.name })) : (pub?.coins ?? []).map((c) => who(roster, c.name));
  const lede = tense(phase, { will: `Sends to ${tells}`, did: `Sent to ${tells}`, not: `Not sent. It would have gone to ${tells}.` });
  return (
    <Body label={lede} card={props}>
      <Who proposal={p} density={density}>
        <People people={people} total={everyone ? people.length : people.length + (pub?.coinsMore ?? 0)} density={density} label="people" />
      </Who>
      <Thing
        title={p.summary}
        lines={[[valueOf(p, 'When'), valueOf(p, 'Where')].filter(Boolean).join(' · ')]}
        meta={pub ? [`Filed in ${pub.folder}`, pub.chatPost ? null : pub.teamChat ? 'Also posts in Team chat, with no second push' : 'Not posted in Team chat'] : []}
      />
      <Delivery proposal={p} phase={phase} density={density}>
        {pub?.sample ? (
          <Notice title={pub.sample.title} body={pub.sample.body} caption={`What ${pub.sample.player} gets. Each player sees their own start.`} density={density} />
        ) : (
          valueOf(p, 'What they get') && <Notice title={p.summary} body={valueOf(p, 'What they get')} caption="What they get" density={density} />
        )}
      </Delivery>
      {pub?.chatPost && <Bubble text={pub.chatPost} caption="Also posts in Team chat, with no second push" density={density} />}
    </Body>
  );
}

export function PublishDocBody(props: BodyProps) {
  const { proposal: p, density } = props;
  const words = valueOf(p, 'Words') ?? '';
  const lede = `${sentence((valueOf(p, 'Who can see it') ?? 'Players can open it in Documents').replace(/\s*:\s*/, ': '))} Nobody gets a notification.`;
  return (
    <Body label={lede} card={props} rows={restOf(p, ['Who can see it', 'Goes to', 'Words'])}>
      <Thing title={p.summary} meta={[valueOf(p, 'Goes to') ?? 'Documents']} />
      <Quote text={words} caption="The document" density={density} what="document" />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A18. A message, as Messages draws it
// ---------------------------------------------------------------------------------------------------------------------

export function MessageBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const msg = p.visual?.kind === 'msg' ? p.visual : null;
  const thread = msg?.thread ?? valueOf(p, 'Thread') ?? 'this thread';
  const n = msg?.count ?? copy.told;
  const lede = tense(phase, { will: `Sends as you to ${plural(n, 'player')} in ${thread}`, did: `Sent as you to ${plural(n, 'player')} in ${thread}`, not: `Not sent. Nothing went to ${thread}.` });
  return (
    <Body label={lede} card={props} rows={restOf(p, ['Thread', 'Message', 'To'])}>
      <Who proposal={p} density={density}>
        {msg?.members?.length ? (
          <People people={msg.members.map((name) => who(roster, name))} total={n} density={density} label="people" />
        ) : (
          <p className="ch-akc-people__gap">The plan does not list who is in {thread}: {count(n)} {pluralWord(n, 'player')}.</p>
        )}
      </Who>
      <Bubble text={msg?.draft ?? valueOf(p, 'Message') ?? ''} before={msg?.last} caption={thread} density={density} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan itself, for a task with no drawing of its own: its reach, what changes, the words, every other fact
// ---------------------------------------------------------------------------------------------------------------------

/** Facts the frame and its parts already say (who is told, the words, when it goes), so they are not said twice as lines. */
const SAID = ['To', 'Told', 'Will not get it', 'Will not be told', 'They see', 'In the app they see', 'By e-mail they get', 'When', 'How', 'The player sees', 'Players see', 'Players are told', 'Who gets it'];

/**
 * Any task, drawn from what its plan says for certain: who it reaches, how the thing stands now and after (when the plan
 * has both), exactly what is sent, and every remaining fact. It is the body of the tasks that change something that
 * already exists, and of any task this lane has not met yet, so a new tool has a true card on its first day.
 */
export function PlanBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const people = peopleOf(p, roster);
  const lede = p.visible_note ?? (p.notifications.length ? p.notifications.join(' ') : 'Nothing is sent.');
  const now = valueOf(p, 'Now');
  const after = valueOf(p, 'After');
  const subject = ['Event', 'Focus area', 'Goal', 'Signal', 'Task', 'Qualifier'].map((l) => valueOf(p, l)).find(Boolean);
  const sees = factOf(p, 'They see') ?? factOf(p, 'In the app they see');
  const [title, ...rest] = (sees?.value ?? '').split('\n');
  // How far a change to one date of a series goes is said in view: it is what the change leaves alone.
  const series = valueOf(p, 'Series');
  return (
    <Body label={lede} card={props} rows={[...missingRows(p), ...restOf(p, [...SAID, ...(series ? ['Series'] : []), ...(subject ? ['Event', 'Focus area', 'Goal', 'Signal', 'Task', 'Qualifier'] : []), ...(now && after ? ['Now', 'After'] : [])])]} wordless={!title}>
      <Who proposal={p} density={density}>
        {copy.reach === 'sends' && <People people={people} density={density} />}
      </Who>
      {subject && <p className="ch-akc-subject">{subject}</p>}
      {now && after && <Diff now={now} after={after} />}
      <Delivery proposal={p} phase={phase} density={density}>
        {copy.reach === 'sends' && title && <Notice title={title} body={rest.join('\n')} caption="What each of them gets" density={density} />}
      </Delivery>
      {series && <Change>{sentence(series)}</Change>}
    </Body>
  );
}
