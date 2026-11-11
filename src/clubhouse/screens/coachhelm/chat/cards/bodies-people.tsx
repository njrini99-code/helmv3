'use client';

import { Circle, Clock } from 'lucide-react';
import type { ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Badge } from '../../../../ui/Badge';
import { Icon } from '../../../../ui/Icon';
import { missingRows, type BodyProps } from './bodies-schedule';
import { count, dayWords, factOf, peopleOf, plural, restOf, valueOf } from './facts';
import { Body, Bubble, Change, Clamp, Delivery, Diff, Fold, Meta, NoWords, Notice, People, Quote, ReachRow, Rows, tense } from './kit';
import { isOpen, type CardPerson } from './types';

/** The bodies of the tasks about a player, words that are sent, and things that are published (CAPABILITIES.md A8 to A18). */

const ask = (p: BodyProps) => (isOpen(p.phase) ? p.onAsk : undefined);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
const who = (roster: readonly CardPerson[] = [], name: string): CardPerson => roster.find((r) => r.name === name) ?? { id: name, name };

// ---------------------------------------------------------------------------------------------------------------------
// A8. A goal
// ---------------------------------------------------------------------------------------------------------------------

export function GoalBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const g = p.visual?.kind === 'goal' ? p.visual : null;
  const name = g?.player ?? valueOf(p, 'Player') ?? 'the player';
  const lede = tense(phase, { will: `Sends to ${name}: a push`, did: `Sent to ${name}: a push`, not: `Not sent. ${name} was not told.` });
  const how = valueOf(p, 'How');
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density} />
      {g && (
        <div className="ch-akc-goal">
          <div className="ch-akc-goal__who">
            <Avatar name={name} id={who(roster, name).id} size="md" />
            <span>
              <b>{name}</b>
              <small>{g.stat}</small>
            </span>
            {how && <Badge tone={how === 'Assigned' ? 'accent' : 'neutral'}>{how}</Badge>}
          </div>
          <p className="ch-akc-goal__target">
            {g.current != null && (
              <>
                <small>Now</small>
                <span className="ch-akc-goal__now ch-num">{g.current}</span>
              </>
            )}
            <small>Target</small>
            <b className="ch-num">
              {g.target}
              {g.unit && <span className="ch-akc-goal__unit"> {g.unit}</span>}
            </b>
            <span>
              <Icon icon={Clock} size={13} />
              in {plural(g.days, 'day')}
            </span>
          </p>
          {g.better && <p className="ch-akc-meta">{g.better === 'up' ? 'Higher is better.' : 'Lower is better.'}</p>}
          {g.current === null && <p className="ch-akc-meta">No rounds yet in the 90 days a goal is measured from, so there is no figure for now.</p>}
          {g.current === undefined && <p className="ch-akc-gap">The plan does not say where {name.split(' ')[0]} stands on this now.</p>}
        </div>
      )}
      <Delivery proposal={p} phase={phase} density={density}>
        <NoWords channel={p.notifications.join(' ')} phase={phase} />
      </Delivery>
      <Rows facts={restOf(p, ['Player', 'Target', 'By', 'How', 'Goal', 'Now', 'Better is'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A9. A focus area
// ---------------------------------------------------------------------------------------------------------------------

export function FocusBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const people = peopleOf(p, roster, valueOf(p, 'Player'));
  const name = people[0]?.name ?? 'the player';
  const lede = tense(phase, { will: `Sends to ${name}, who is asked to accept it`, did: `Sent to ${name}, who is asked to accept it`, not: `Not sent. ${name} was not told.` });
  const status = valueOf(p, 'Status');
  const window: ProposalFact[] = [factOf(p, 'By'), factOf(p, 'Over')].filter((f): f is ProposalFact => !!f);
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density}>
        <People people={people} density={density} />
      </ReachRow>
      <div className="ch-akc-focus">
        {valueOf(p, 'Area') && <Badge>{titleCase(valueOf(p, 'Area')!)}</Badge>}
        <b>{valueOf(p, 'Focus') ?? p.summary}</b>
        {valueOf(p, 'Target') && <p className="ch-num">{titleCase(valueOf(p, 'Target')!)}</p>}
      </div>
      <Delivery proposal={p} phase={phase} density={density}>
        <NoWords channel={`${p.notifications.join('. ')}.`} phase={phase} />
      </Delivery>
      <Rows facts={[...missingRows(p), ...window, ...restOf(p, ['Player', 'Focus', 'Area', 'Target', 'By', 'Over', 'Status'])]} density={density} subject={p.summary} onAsk={ask(props)} />
      {status && <Change>{status}.</Change>}
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
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density}>
        <People people={people} density={density} everyone={everyone} />
      </ReachRow>
      <div className="ch-akc-task">
        <Icon icon={Circle} size={20} className="ch-akc-task__box" />
        <div>
          <b>{t?.title ?? valueOf(p, 'Task') ?? p.summary}</b>
          <Meta parts={[t?.due ? `Due ${dayWords(t.due)}` : null, priority && priority !== 'medium' ? `${titleCase(priority)} priority` : null]} />
        </div>
      </div>
      <Delivery proposal={p} phase={phase} density={density}>
        <NoWords channel={`${p.notifications.join('. ')}.`} phase={phase} />
      </Delivery>
      <Rows facts={[...(due?.missing ? [{ ...due, label: 'Due date', value: 'Not set' }] : []), ...restOf(p, ['Task', 'Assigned to', 'Due', 'Priority'])]} density={density} subject={p.summary} onAsk={ask(props)} />
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
  const details: ProposalFact[] = [
    ...(urgency && urgency !== 'normal' ? [{ label: 'Urgency', value: titleCase(urgency) }] : []),
    ...(valueOf(p, 'Acknowledgement') === 'Required' ? [{ label: 'Acknowledgement', value: 'Each player must acknowledge it' }] : []),
    ...restOf(p, ['Title', 'Message', 'To', 'Urgency', 'Acknowledgement']),
  ];
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density}>
        <People people={people} density={density} everyone={everyone} />
      </ReachRow>
      <Delivery proposal={p} phase={phase} density={density}>
        <Notice title={valueOf(p, 'Title') ?? p.summary} body={valueOf(p, 'Message')} caption={tense(phase, { will: 'What each of them gets', did: 'What each of them got', not: 'What they would have got' })} density={density} />
      </Delivery>
      <Rows facts={details} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A12, A13. Notes: on a round (the player reads it), on availability (coaches only)
// ---------------------------------------------------------------------------------------------------------------------

export function RoundNoteBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const note = p.visual?.kind === 'note' ? p.visual : null;
  const name = note?.player ?? 'The player';
  const earlier = valueOf(p, 'Earlier note');
  const lede = tense(phase, { will: `${name} will see this note on the round. No notification is sent.`, did: `${name} can see this note on the round.`, not: `Not added. ${name} sees nothing new.` });
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density} />
      {earlier && <Quote text={earlier} caption="Already on the round" quiet density={density} />}
      <Quote text={note?.note ?? valueOf(p, 'Adding') ?? ''} caption={earlier ? 'Adding under it' : 'Adding'} density={density} />
      {earlier && <Change>The earlier note stays. This goes under it.</Change>}
      {note?.round ? (
        <p className="ch-akc-subject">{[note.round.course, note.round.date ? dayWords(note.round.date) : null, note.round.score != null ? `${note.round.score}` : null].filter(Boolean).join(' · ') || 'This round'}</p>
      ) : (
        <p className="ch-akc-gap">The plan does not say which round: no course, date or score.</p>
      )}
    </Body>
  );
}

export function AvailabilityBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const name = p.summary.replace(/^Availability note for /, '');
  const replaces = valueOf(p, 'Replaces');
  const lede = `Coaches only. ${name.split(' ')[0]} never sees this.`;
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density} />
      <Quote text={valueOf(p, 'Note') ?? ''} caption={`On ${name}`} density={density} />
      {replaces && <Quote text={replaces} caption="Replaces" quiet struck density={density} />}
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A14, A15. A recruit, a drill
// ---------------------------------------------------------------------------------------------------------------------

export function RecruitBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const year = valueOf(p, 'Grad year');
  const status = valueOf(p, 'Status');
  const lede = 'Coaches only. Players never see recruits.';
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density} />
      <div className="ch-akc-goal__who">
        <Avatar name={p.summary} size="md" />
        <span>
          <b>{p.summary}</b>
          <small>{[year ? `Class of ${year}` : null, valueOf(p, 'Hometown')].filter(Boolean).join(' · ') || 'No class or hometown given'}</small>
        </span>
        {status && <Badge>{titleCase(status)}</Badge>}
      </div>
      <Rows facts={restOf(p, ['Grad year', 'Status', 'Hometown'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

export function DrillBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const setup = valueOf(p, 'Setup');
  const goal = valueOf(p, 'Goal');
  const lede = 'Players see it only when a published plan uses it.';
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density} />
      <div className="ch-akc-drill">
        <div className="ch-akc-drill__hd">
          {valueOf(p, 'Area') && <Badge tone="accent">{valueOf(p, 'Area')}</Badge>}
          <span className="ch-num">{valueOf(p, 'Length')}</span>
        </div>
        {setup && <Clamp text={setup} lines={density === 'compact' ? 2 : 4} density={density} what="setup" />}
        {goal && (
          <p className="ch-akc-drill__goal">
            <small>Goal</small>
            {goal}
          </p>
        )}
      </div>
      <Rows facts={restOf(p, ['Area', 'Length', 'Setup', 'Goal'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A16, A17. Publishing: a practice plan (people are told), a document (nobody is)
// ---------------------------------------------------------------------------------------------------------------------

export function PublishPlanBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const pub = p.publish;
  const tells = pub?.tellsLine ?? valueOf(p, 'Tells') ?? '';
  const everyone = pub?.people;
  const people = everyone ? everyone.map((x) => ({ id: x.id ?? x.name, name: x.name })) : (pub?.coins ?? []).map((c) => who(roster, c.name));
  const lede = tense(phase, { will: `Sends to ${tells}`, did: `Sent to ${tells}`, not: `Not sent. It would have gone to ${tells}.` });
  const details: ProposalFact[] = [
    ...['When', 'Where'].map((l) => factOf(p, l)).filter((f): f is ProposalFact => !!f),
    ...(pub ? [{ label: 'Filed in', value: pub.folder }, { label: 'Team chat', value: pub.teamChat ? 'Also posts in Team chat, with no second push' : 'Not posted in Team chat' }] : []),
  ];
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density}>
        <People people={people} total={everyone ? people.length : people.length + (pub?.coinsMore ?? 0)} density={density} label="people" />
      </ReachRow>
      <Delivery proposal={p} phase={phase} density={density}>
        {pub?.sample ? (
          <Notice title={pub.sample.title} body={pub.sample.body} caption={`What ${pub.sample.player} gets. Each player sees their own start.`} density={density} />
        ) : (
          valueOf(p, 'What they get') && <Notice title={p.summary} body={valueOf(p, 'What they get')} caption="What they get" density={density} />
        )}
      </Delivery>
      {pub?.chatPost && <Bubble text={pub.chatPost} caption="Also posts in Team chat, with no second push" density={density} />}
      <Fold density={density}>
        <Rows facts={details} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}

export function PublishDocBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const words = valueOf(p, 'Words') ?? '';
  const lede = (valueOf(p, 'Who can see it') ?? 'Players can open it in Documents.').replace(/\s*:\s*/, ': ');
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={`${lede} proposal={p} density={density} Nobody gets a notification.`} />
      <article className="ch-akc-page">
        <header>
          <small>{valueOf(p, 'Goes to') ?? 'Documents'}</small>
        </header>
        <Clamp text={words} lines={density === 'compact' ? 3 : 6} density={density} what="document" />
      </article>
      <Rows facts={restOf(p, ['Who can see it', 'Goes to', 'Words'])} density={density} subject={p.summary} onAsk={ask(props)} />
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
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density}>
        {msg?.members?.length ? (
          <People people={msg.members.map((name) => who(roster, name))} total={n} density={density} label="people" />
        ) : (
          <p className="ch-akc-people__gap">The plan does not list who is in {thread}: {count(n)} {n === 1 ? 'player' : 'players'}.</p>
        )}
      </ReachRow>
      <Bubble text={msg?.draft ?? valueOf(p, 'Message') ?? ''} before={msg?.last} caption={thread} density={density} />
      <Rows facts={restOf(p, ['Thread', 'Message', 'To'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan itself, for a task with no drawing of its own: its reach, what changes, the words, every other fact
// ---------------------------------------------------------------------------------------------------------------------

/** Facts the frame and its parts already say (who is told, the words, when it goes), so they are not said twice as rows. */
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
  return (
    <Body label={lede} card={props}>
      <ReachRow copy={copy} phase={phase} lede={lede} proposal={p} density={density}>
        {copy.reach === 'sends' && <People people={people} density={density} />}
      </ReachRow>
      {subject && <p className="ch-akc-subject">{subject}</p>}
      {now && after && <Diff now={now} after={after} />}
      <Delivery proposal={p} phase={phase} density={density}>
        {copy.reach === 'sends' && (title ? <Notice title={title} body={rest.join('\n')} caption="What each of them gets" density={density} /> : <NoWords channel={lede} phase={phase} />)}
      </Delivery>
      <Fold density={density}>
        <Rows facts={[...missingRows(p), ...restOf(p, [...SAID, ...(subject ? ['Event', 'Focus area', 'Goal', 'Signal', 'Task', 'Qualifier'] : []), ...(now && after ? ['Now', 'After'] : [])])]} density={density} subject={p.summary} onAsk={ask(props)} />
      </Fold>
    </Body>
  );
}
