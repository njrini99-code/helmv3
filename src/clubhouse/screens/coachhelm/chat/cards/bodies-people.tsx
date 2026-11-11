'use client';

import { Circle, Clock } from 'lucide-react';
import type { ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Badge } from '../../../../ui/Badge';
import { Icon } from '../../../../ui/Icon';
import { missingRows, type BodyProps } from './bodies-schedule';
import { count, dayWords, factOf, peopleOf, plural, restOf, valueOf } from './facts';
import { Body, Bubble, Change, Clamp, Fold, Meta, NoWords, Notice, People, Quote, ReachRow, Rows, tense } from './kit';
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
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
            <small>Target</small>
            <b className="ch-num">{g.target}</b>
            <span>
              <Icon icon={Clock} size={13} />
              in {plural(g.days, 'day')}
            </span>
          </p>
          <p className="ch-akc-gap">The plan does not say where {name.split(' ')[0]} stands on this now.</p>
        </div>
      )}
      <NoWords channel={p.notifications.join(' ')} />
      <Rows facts={restOf(p, ['Player', 'Target', 'By', 'How'])} density={density} subject={p.summary} onAsk={ask(props)} />
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} density={density} />
      </ReachRow>
      <div className="ch-akc-focus">
        {valueOf(p, 'Area') && <Badge>{titleCase(valueOf(p, 'Area')!)}</Badge>}
        <b>{valueOf(p, 'Focus') ?? p.summary}</b>
        {valueOf(p, 'Target') && <p className="ch-num">{titleCase(valueOf(p, 'Target')!)}</p>}
      </div>
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} density={density} everyone={everyone} />
      </ReachRow>
      <div className="ch-akc-task">
        <Icon icon={Circle} size={20} className="ch-akc-task__box" />
        <div>
          <b>{t?.title ?? valueOf(p, 'Task') ?? p.summary}</b>
          <Meta parts={[t?.due ? `Due ${dayWords(t.due)}` : null, priority && priority !== 'medium' ? `${titleCase(priority)} priority` : null]} />
        </div>
      </div>
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} density={density} everyone={everyone} />
      </ReachRow>
      <Notice title={valueOf(p, 'Title') ?? p.summary} body={valueOf(p, 'Message')} caption={tense(phase, { will: 'What each of them gets', did: 'What each of them got', not: 'What they would have got' })} density={density} />
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      {earlier && <Quote text={earlier} caption="Already on the round" quiet density={density} />}
      <Quote text={note?.note ?? valueOf(p, 'Adding') ?? ''} caption={earlier ? 'Adding under it' : 'Adding'} density={density} />
      {earlier && <Change>The earlier note stays. This goes under it.</Change>}
      <p className="ch-akc-gap">The plan does not say which round: no course, date or score.</p>
    </Body>
  );
}

export function AvailabilityBody(props: BodyProps) {
  const { proposal: p, copy, phase, density } = props;
  const name = p.summary.replace(/^Availability note for /, '');
  const replaces = valueOf(p, 'Replaces');
  const lede = `Coaches only. ${name.split(' ')[0]} never sees this.`;
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede} />
      <div className="ch-akc-drill">
        <div className="ch-akc-drill__hd">
          {valueOf(p, 'Area') && <Badge tone="accent">{valueOf(p, 'Area')}</Badge>}
          <span className="ch-num">{valueOf(p, 'Length')}</span>
        </div>
        <b>{p.summary}</b>
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
  const people = (pub?.coins ?? []).map((c) => who(roster, c.name));
  const lede = tense(phase, { will: `Sends to ${tells}`, did: `Sent to ${tells}`, not: `Not sent. It would have gone to ${tells}.` });
  const details: ProposalFact[] = [
    ...['When', 'Where'].map((l) => factOf(p, l)).filter((f): f is ProposalFact => !!f),
    ...(pub ? [{ label: 'Filed in', value: pub.folder }, { label: 'Team chat', value: pub.teamChat ? 'Also posts in Team chat, with no second push' : 'Not posted in Team chat' }] : []),
  ];
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} total={people.length + (pub?.coinsMore ?? 0)} density={density} />
      </ReachRow>
      {pub?.sample ? (
        <Notice title={pub.sample.title} body={pub.sample.body} caption={`What ${pub.sample.player} gets. Each player sees their own start.`} density={density} />
      ) : (
        valueOf(p, 'What they get') && <Notice title={p.summary} body={valueOf(p, 'What they get')} caption="What they get" density={density} />
      )}
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
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={`${lede} Nobody gets a notification.`} />
      <article className="ch-akc-page">
        <header>
          <small>{valueOf(p, 'Goes to') ?? 'Documents'}</small>
          <b>{p.summary}</b>
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
  const { proposal: p, copy, phase, density } = props;
  const msg = p.visual?.kind === 'msg' ? p.visual : null;
  const thread = msg?.thread ?? valueOf(p, 'Thread') ?? 'this thread';
  const n = msg?.count ?? copy.told;
  const lede = tense(phase, { will: `Sends as you to ${plural(n, 'player')} in ${thread}`, did: `Sent as you to ${plural(n, 'player')} in ${thread}`, not: `Not sent. Nothing went to ${thread}.` });
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <p className="ch-akc-people__gap">The plan does not list who is in {thread}: {count(n)} {n === 1 ? 'player' : 'players'}.</p>
      </ReachRow>
      <Bubble text={msg?.draft ?? valueOf(p, 'Message') ?? ''} before={msg?.last} caption={thread} density={density} />
      <Rows facts={restOf(p, ['Thread', 'Message'])} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A task this lane has not met: its reach from the plan's own line, and every fact as a row
// ---------------------------------------------------------------------------------------------------------------------

export function GenericBody(props: BodyProps) {
  const { proposal: p, copy, phase, density, roster } = props;
  const people = peopleOf(p, roster);
  const lede = p.notifications.length ? p.notifications.join(' ') : 'Nothing is sent.';
  return (
    <Body label={lede} phase={phase} density={density} tool={props.tool}>
      <ReachRow copy={copy} phase={phase} lede={lede}>
        <People people={people} density={density} />
      </ReachRow>
      {copy.reach === 'sends' && people.length === 0 && <NoWords channel={lede} />}
      <Rows facts={[...missingRows(p), ...p.facts]} density={density} subject={p.summary} onAsk={ask(props)} />
    </Body>
  );
}
