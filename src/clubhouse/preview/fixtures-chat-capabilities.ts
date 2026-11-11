/**
 * Fixtures for the capabilities gallery (docs/clubhouse/coachhelm-chat-v3/CAPABILITIES.md): one stored plan per task
 * tool, written in the exact shape its planner returns (`action-planners.ts`, `create-tools.ts`, `practice-planner.ts`,
 * `practice-draft.ts`, `tasks/event-tasks.ts`: same labels, same sentences, ISO dates where the planner writes ISO),
 * and the receipts its `commit` returns. Nothing here reaches a server.
 */
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { CardPerson } from '../screens/coachhelm/chat/cards';

export const CAP_TEAM = 'Demo University Golf';

const CAST = ['Eli Brandt', 'Jonah Okafor', 'Priya Natarajan', 'Theo Marchetti', 'Sam Whitfield', 'Sofia Alvarez', 'Ava Lindqvist', 'Owen Park'];
const MORE = ['Noah Castellanos', 'Liam Abernathy', 'Mateo Rivera', 'Kai Nakamura', 'Lucas Okonkwo', 'Henry Vandersloot', 'Jack Montgomery-Reyes', 'Leo Fitzgerald', 'Miles Achterberg', 'Ezra Goldfarb', 'Caleb Stromberg', 'Isaac Petrosyan', 'Wyatt Hollingsworth', 'Julian Delacroix', 'Aaron Whitlock', 'Dylan Kowalczyk', 'Ryan Oyelaran', 'Cole Bergstrom', 'Max Ortiz', 'Finn Gallagher', 'Hugo Lemaire', 'Jude Ashworth', 'Reid Tanaka', 'Silas Moreau', 'Tate Lindholm', 'Beau Kessler', 'Rhys Calloway', 'Gus Halvorsen', 'Nico Ferrante', 'Arlo Whitcombe', 'Emmett Sandoval', 'Quinn Marlowe'];
const person = (name: string): CardPerson => ({ id: `p-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, name });

/** The active roster: eight players, as the shared preview cast. */
export const CAP_ROSTER: CardPerson[] = CAST.map(person);
/** A big roster, for the forty-recipient case. */
export const CAP_ROSTER_40: CardPerson[] = [...CAST, ...MORE].map(person);

const list = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const affects = (people: readonly CardPerson[]): ActionProposal['affects'] => people.map((p) => ({ kind: 'player', id: p.id, label: p.name }));
const AT = '2026-11-10T21:04:00.000Z';

const done = (action: string, summary: string, created: ActionReceipt['created'], notifications: ActionReceipt['notifications'] = []): ActionReceipt => ({ status: 'completed', action, summary, created, notifications, partial_failures: [], retryable: false, at: AT });
const failed = (action: string, summary: string, retryable = true): ActionReceipt => ({ status: 'failed', action, summary, created: [], notifications: [], partial_failures: [], error: summary, retryable, at: AT });

export interface CapVariant {
  label: string;
  proposal: ActionProposal;
  roster?: CardPerson[];
}

export interface CapTask {
  tool: string;
  /** The catalogue's name for it (CAPABILITIES.md). */
  name: string;
  ref: string;
  /** Where it is offered. */
  surface: 'Ask and quick chat' | 'Ask' | 'Quick chat' | 'Behind the tournaments flag';
  proposal: ActionProposal;
  saved: ActionReceipt;
  failed: ActionReceipt;
  partial?: ActionReceipt;
  variants?: Record<string, CapVariant>;
}

const six = CAP_ROSTER.slice(0, 6);
const LONG_BODY =
  'Thursday’s qualifier moves to Ridgeline because of the frost delay at the home course. Vans leave the lower lot at 6:15 AM sharp; if you are driving yourself, be on the range by 7:10.\n\nBring rain gear and a second glove. We are playing the back tees on the par 3s only. Scorecards are kept in the app, hole by hole, and your marker attests before you leave the green on 18.\n\nBreakfast is at the clubhouse from 6:45. Class excuse letters are in Documents; send yours to your professors tonight, not tomorrow morning. If you have an exam conflict, message me before 9 PM and we will find you a later time on Friday.\n\nLast thing: pace of play. Four hours ten is the target. Ready golf from the first tee.';
const DOC_BODY =
  'Eli Brandt: fall review\n\nScoring. Eli’s average over his last 8 counting rounds is 73.4, down from 75.1 over the 8 before. The gain is almost all on the greens.\n\nPutting. From 4 to 8 feet he made 61% (22 of 36), up from 47%. From outside 20 feet he three-putted 4 times in 8 rounds.\n\nApproach. He leaves it 31 feet on average from 150 to 175 yards, which is 6 feet longer than the team. This is the next place to work.\n\nPlan. Keep the short-putt ladder twice a week. Add a 150 to 175 yard distance-control block on Tuesdays through the end of the month, then re-read after the Ridgeline qualifier.';

export const CAP_TASKS: CapTask[] = [
  {
    tool: 'create_event',
    name: 'Add one event',
    ref: 'A1',
    surface: 'Ask and quick chat',
    proposal: {
      visual: { kind: 'cal', date: '2026-11-12', start: '15:00', end: '17:30', title: 'Short-game practice', where: 'Short-game area, Ridgeline GC', who: '6 players', rsvp: true },
      action: 'Add to calendar',
      summary: 'Short-game practice',
      facts: [
        { label: 'When', value: '2026-11-12, 15:00 to 17:30' },
        { label: 'Length', value: '2.5 hours', source: 'The usual practice. Tell me if it should end earlier or later.' },
        { label: 'Type', value: 'practice' },
        { label: 'Where', value: 'Short-game area, Ridgeline GC' },
        { label: 'Invited', value: six.map((p) => p.name).join(', ') },
        { label: 'Replies', value: 'Asked for' },
      ],
      affects: [],
      notifications: ['6 players get a bell, email and push once Undo closes.'],
      missing: [],
      idempotency_key: 'event:short-game-practice:2026-11-12:15:00:17:30',
    },
    saved: done('create_event', 'Short-game practice is on the calendar.', [{ kind: 'event', count: 1, href: '/golf/dashboard/calendar', label: 'Short-game practice' }]),
    failed: failed('create_event', 'The calendar did not take that. Nothing was saved.'),
    variants: {
      quiet: {
        label: 'Nobody is told',
        proposal: {
          visual: { kind: 'cal', date: '2026-11-14', start: null, end: null, title: 'Team photo day and equipment check for the spring travel squad', where: null, who: 'Not asked', rsvp: false },
          action: 'Add to calendar',
          summary: 'Team photo day and equipment check for the spring travel squad',
          facts: [
            { label: 'When', value: '2026-11-14, all day' },
            { label: 'Type', value: 'other' },
            { label: 'Where', value: 'Not set' },
            { label: 'Invited', value: 'Not set' },
            { label: 'Replies', value: 'Not asked for' },
          ],
          affects: [],
          notifications: ['Nobody is told.'],
          missing: [],
          idempotency_key: 'event:team-photo-day:2026-11-14',
        },
      },
    },
  },
  {
    tool: 'create_recurring_practice',
    name: 'A repeating practice',
    ref: 'A2',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Create a recurring practice',
      summary: '8 practices, every Tuesday and Thursday at 3:00 PM, starting Tue, Nov 11.',
      facts: [
        { label: 'Repeats', value: 'Every Tuesday and Thursday at 3:00 PM' },
        { label: 'Dates', value: 'Tue, Nov 11 · Thu, Nov 13 · Tue, Nov 18 · Thu, Nov 20 · Tue, Nov 25 · Tue, Dec 2 · Thu, Dec 4 · Tue, Dec 9' },
        { label: 'Occurrences', value: '8' },
        { label: 'Timezone', value: 'America/Chicago' },
        { label: 'Location', value: 'Ridgeline GC, practice tee' },
        { label: 'Invites', value: '8 active players' },
        { label: 'RSVP', value: 'Required by Mon, Nov 10, 6:00 PM' },
      ],
      affects: [{ kind: 'team', id: 'team-demo', label: CAP_TEAM }, ...affects(CAP_ROSTER)],
      notifications: ['An in-app invitation, email and push notification to 8 players', 'Each player is asked to RSVP'],
      missing: [],
      idempotency_key: 'practice:team-demo:tue-thu-1500:2026-11-11:8',
    },
    saved: done('Create a recurring practice', '8 practices created, every Tuesday and Thursday at 3:00 PM.', [{ kind: 'event', count: 8, href: '/golf/dashboard/calendar', label: 'Team practice' }], [{ channel: 'in-app, email and push', recipients: 8, status: 'sent' }]),
    failed: failed('Create a recurring practice', 'The practice series was not created. Nothing was saved.'),
    partial: { status: 'partial', action: 'Create a recurring practice', summary: '6 of 8 practices created.', created: [{ kind: 'event', count: 6, href: '/golf/dashboard/calendar', label: 'Team practice' }], notifications: [{ channel: 'in-app, email and push', recipients: 8, status: 'sent' }], partial_failures: ['Tue, Dec 2 and Thu, Dec 4 were not created.'], retryable: false, at: AT },
    variants: {
      missing: {
        label: 'No place, no replies, 26 dates',
        proposal: {
          action: 'Create a recurring practice',
          summary: '26 practices, every Monday and Wednesday at 6:30 AM, starting Mon, Jan 12.',
          facts: [
            { label: 'Repeats', value: 'Every Monday and Wednesday at 6:30 AM' },
            { label: 'Dates', value: ['Mon, Jan 12', 'Wed, Jan 14', 'Mon, Jan 19', 'Wed, Jan 21', 'Mon, Jan 26', 'Wed, Jan 28', 'Mon, Feb 2', 'Wed, Feb 4', 'Mon, Feb 9', 'Wed, Feb 11', 'Mon, Feb 16', 'Wed, Feb 18', 'Mon, Feb 23', 'Wed, Feb 25', 'Mon, Mar 2', 'Wed, Mar 4', 'Mon, Mar 9', 'Wed, Mar 11', 'Mon, Mar 16', 'Wed, Mar 18', 'Mon, Mar 23', 'Wed, Mar 25', 'Mon, Mar 30', 'Wed, Apr 1', 'Mon, Apr 6', 'Wed, Apr 8'].join(' · ') },
            { label: 'Occurrences', value: '26' },
            { label: 'Timezone', value: 'America/Chicago' },
            { label: 'Location', value: 'Not set', missing: true },
            { label: 'Invites', value: '8 active players' },
            { label: 'RSVP', value: 'Not required' },
          ],
          affects: [{ kind: 'team', id: 'team-demo', label: CAP_TEAM }, ...affects(CAP_ROSTER)],
          notifications: [],
          missing: ['Location'],
          idempotency_key: 'practice:team-demo:mon-wed-0630:2026-01-12:26',
        },
      },
    },
  },
  {
    tool: 'add_blocked_time',
    name: 'Block your own time',
    ref: 'A3',
    surface: 'Ask and quick chat',
    proposal: { action: 'Block time', summary: 'Recruiting calls', facts: [{ label: 'When', value: '2026-11-13, 13:00 to 15:00' }], affects: [], notifications: ['Nobody is told. Only you see it.'], missing: [], idempotency_key: 'block:recruiting-calls:2026-11-13:13:00' },
    saved: done('add_blocked_time', 'That time is blocked.', [{ kind: 'blocked_time', count: 1, href: '/golf/dashboard/calendar' }]),
    failed: failed('add_blocked_time', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'add_team_break',
    name: 'A team break from class',
    ref: 'A4',
    surface: 'Ask and quick chat',
    proposal: { action: 'Add break', summary: 'Thanksgiving break', facts: [{ label: 'Dates', value: '2026-11-23 to 2026-11-27' }], affects: [], notifications: ['Nobody is told.'], missing: [], idempotency_key: 'break:2026-11-23:2026-11-27' },
    saved: done('add_team_break', 'Thanksgiving break is on the calendar.', [{ kind: 'break', count: 1 }]),
    failed: failed('add_team_break', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'save_team_term',
    name: 'A school term',
    ref: 'A5',
    surface: 'Ask and quick chat',
    proposal: { action: 'Save term', summary: 'Spring 2027', facts: [{ label: 'Classes', value: '2027-01-11 to 2027-04-30' }, { label: 'Exams end', value: '2027-05-08' }], affects: [], notifications: ['Nobody is told.'], missing: [], idempotency_key: 'term:spring-2027:2027-01-11' },
    saved: done('save_team_term', 'Spring 2027 is saved.', [{ kind: 'term', count: 1 }]),
    failed: failed('save_team_term', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'create_trip',
    name: 'A trip',
    ref: 'A6',
    surface: 'Ask and quick chat',
    proposal: {
      visual: { kind: 'trip', from: 'Lower lot, athletics building', to: 'Pinehurst, NC', how: 'bus', leave: '2026-11-14', back: '2026-11-16' },
      action: 'Add the trip',
      summary: 'Sandhills Invitational · Pinehurst, NC',
      facts: [
        { label: 'Leaves', value: '2026-11-14 06:30' },
        { label: 'How', value: 'bus' },
        { label: 'From', value: 'Lower lot, athletics building' },
        { label: 'Back', value: '2026-11-16 19:00' },
        { label: 'Hotel', value: 'The Carolina Hotel' },
        { label: 'Rooms', value: 'Eli and Jonah, room 214. Priya and Sofia, room 216. Theo and Sam, room 218. Ava and Owen, room 220. Coaches in 222 and 224. Keys are handed out on the bus; nobody checks in alone. Lights out is 10:30 PM both nights.' },
        { label: 'Uniform', value: 'Navy polo, khaki trousers, team quarter-zip' },
        { label: 'Gear', value: 'Rain suit, Two gloves, Push cart, Range finder, Team bag tag' },
      ],
      affects: [],
      notifications: ['Nobody is told. Every team member can read the hotel confirmation number.'],
      missing: [],
      idempotency_key: 'trip:sandhills-invitational:2026-11-14:pinehurst',
    },
    saved: done('create_trip', 'The trip to Pinehurst, NC is added.', [{ kind: 'trip', count: 1, href: '/golf/dashboard/travel', label: 'Sandhills Invitational' }]),
    failed: failed('create_trip', 'That didn’t go through. I could not check whether anything was saved: look in Travel before trying again.', false),
    variants: {
      bare: {
        label: 'Only the required fields',
        proposal: {
          visual: { kind: 'trip', from: null, to: 'Austin, TX', how: 'flight', leave: '2027-02-05', back: null },
          action: 'Add the trip',
          summary: 'Longhorn Collegiate · Austin, TX',
          facts: [{ label: 'Leaves', value: '2027-02-05' }, { label: 'How', value: 'flight' }, { label: 'From', value: 'Not set' }, { label: 'Back', value: 'Not set' }, { label: 'Hotel', value: 'Not set' }, { label: 'Rooms', value: 'Not set' }, { label: 'Uniform', value: 'Not set' }, { label: 'Gear', value: 'Not set' }],
          affects: [],
          notifications: ['Nobody is told. Players see it as new travel.'],
          missing: [],
          idempotency_key: 'trip:longhorn-collegiate:2027-02-05:austin',
        },
      },
    },
  },
  {
    tool: 'create_qualifier',
    name: 'A qualifier',
    ref: 'A7',
    surface: 'Ask and quick chat',
    proposal: {
      visual: { kind: 'qual', title: 'Sandhills qualifier', rounds: 3, start: '2026-11-17', total: 5, picks: 1, field: 8, deadline: '2026-11-15' },
      action: 'Set qualifier',
      summary: 'Sandhills qualifier',
      facts: [
        { label: 'Starts', value: '2026-11-17' },
        { label: 'Rounds', value: '3' },
        { label: 'Squad', value: '5, coach picks 1' },
        { label: 'Players', value: CAST.join(', ') },
        { label: 'Rules', value: '54 holes, stroke play, back tees. Low four on aggregate qualify; one coach pick. Ties for fourth are broken on the last 18, then the last 9. Rounds must be posted hole by hole on the day they are played.' },
      ],
      affects: [],
      notifications: ['8 players get a push and an email once Undo closes.'],
      missing: [],
      idempotency_key: 'qualifier:sandhills-qualifier:2026-11-17',
    },
    saved: done('create_qualifier', 'Sandhills qualifier is set.', [{ kind: 'qualifier', count: 1, href: '/golf/dashboard/qualifiers', label: 'Sandhills qualifier' }]),
    failed: failed('create_qualifier', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'create_goal',
    name: 'A goal for a player',
    ref: 'A8',
    surface: 'Ask and quick chat',
    proposal: {
      visual: { kind: 'goal', player: 'Eli Brandt', stat: 'Strokes gained putting', target: 0.4, days: 30 },
      action: 'Set goal',
      summary: 'Strokes gained putting, 30-day goal for Eli Brandt',
      facts: [{ label: 'Player', value: 'Eli Brandt' }, { label: 'Target', value: '0.4' }, { label: 'By', value: '30 days' }, { label: 'How', value: 'Assigned' }],
      affects: [],
      notifications: ['Eli Brandt gets a push once Undo closes.'],
      missing: [],
      idempotency_key: 'goal:p-eli:sg_putting:0.4:30',
    },
    saved: done('create_goal', 'The goal is set for Eli Brandt.', [{ kind: 'goal', count: 1 }]),
    failed: failed('create_goal', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'create_focus_area',
    name: 'A focus area for a player',
    ref: 'A9',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Create a focus area',
      summary: 'Lag putting from outside 20 feet for Jonah Okafor.',
      facts: [
        { label: 'Player', value: 'Jonah Okafor' },
        { label: 'Focus', value: 'Lag putting from outside 20 feet' },
        { label: 'Area', value: 'putting' },
        { label: 'Target', value: 'three putts per round → 1.2 (from 2.4)' },
        { label: 'Over', value: '8 rounds' },
        { label: 'Status', value: 'Proposed: Jonah Okafor accepts before the window starts' },
      ],
      affects: affects([CAP_ROSTER[1]!]),
      notifications: ['Jonah Okafor is notified and asked to accept it'],
      missing: [],
      idempotency_key: 'focus:team-demo:p-jonah-okafor:lag-putting',
    },
    saved: done('Create a focus area', 'Lag putting from outside 20 feet is proposed to Jonah Okafor.', [{ kind: 'focus area', count: 1, href: '/golf/dashboard/intelligence?view=players', label: 'Lag putting from outside 20 feet' }], [{ channel: 'In-app', recipients: 1, status: 'sent' }]),
    failed: { ...failed('Create a focus area', 'The focus area was not created. Jonah already has an active focus area on putting.', false) },
    variants: {
      missing: {
        label: 'No measurable target',
        proposal: {
          action: 'Create a focus area',
          summary: 'Commit to the shot for Theo Marchetti.',
          facts: [{ label: 'Player', value: 'Theo Marchetti' }, { label: 'Focus', value: 'Commit to the shot' }, { label: 'Area', value: 'mental game' }, { label: 'Status', value: 'Proposed: Theo Marchetti accepts before the window starts' }],
          affects: affects([CAP_ROSTER[3]!]),
          notifications: ['Theo Marchetti is notified and asked to accept it'],
          missing: ['Measurable target'],
          idempotency_key: 'focus:team-demo:p-theo-marchetti:commit',
        },
      },
    },
  },
  {
    tool: 'create_task',
    name: 'A task for players',
    ref: 'A10',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Assign a task',
      summary: 'Post your Ridgeline practice round hole by hole: 4 players.',
      visual: { kind: 'task', title: 'Post your Ridgeline practice round hole by hole', due: '2026-11-14', who: CAST.slice(0, 4) },
      facts: [{ label: 'Task', value: 'Post your Ridgeline practice round hole by hole' }, { label: 'Assigned to', value: CAST.slice(0, 4).join(', ') }, { label: 'Due', value: 'Fri, Nov 14' }, { label: 'Priority', value: 'high' }],
      affects: affects(CAP_ROSTER.slice(0, 4)),
      notifications: ['4 players are notified in-app'],
      missing: [],
      idempotency_key: 'task:team-demo:post-ridgeline:2026-11-14',
    },
    saved: done('Assign a task', 'Post your Ridgeline practice round hole by hole assigned to 4 players.', [{ kind: 'task', count: 1, href: '/golf/dashboard/tasks', label: 'Post your Ridgeline practice round hole by hole' }, { kind: 'assignment', count: 4 }], [{ channel: 'In-app', recipients: 4, status: 'sent' }]),
    failed: failed('Assign a task', 'The task was not created. Nothing was saved.'),
    variants: {
      one: {
        label: 'One player, no due date',
        proposal: {
          action: 'Assign a task',
          summary: 'Send me your class schedule: 1 player.',
          visual: { kind: 'task', title: 'Send me your class schedule', due: null, who: ['Theo Marchetti'] },
          facts: [{ label: 'Task', value: 'Send me your class schedule' }, { label: 'Assigned to', value: 'Theo Marchetti' }, { label: 'Due', value: 'No due date', missing: true }, { label: 'Priority', value: 'medium' }],
          affects: affects([CAP_ROSTER[3]!]),
          notifications: ['1 player is notified in-app'],
          missing: ['Due date'],
          idempotency_key: 'task:team-demo:class-schedule:nodate',
        },
      },
      forty: {
        label: 'Forty players',
        roster: CAP_ROSTER_40,
        proposal: {
          action: 'Assign a task',
          summary: 'Sign the travel release before Friday: 40 players.',
          visual: { kind: 'task', title: 'Sign the travel release before Friday', due: '2026-11-13', who: CAP_ROSTER_40.map((p) => p.name) },
          facts: [{ label: 'Task', value: 'Sign the travel release before Friday' }, { label: 'Assigned to', value: 'All 40 active players' }, { label: 'Due', value: 'Thu, Nov 13' }, { label: 'Priority', value: 'medium' }],
          affects: affects(CAP_ROSTER_40),
          notifications: ['40 players are notified in-app'],
          missing: [],
          idempotency_key: 'task:team-demo:travel-release:2026-11-13',
        },
      },
    },
  },
  {
    tool: 'create_team_announcement',
    name: 'A team announcement',
    ref: 'A11',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Send a team update',
      summary: 'Thursday moves to 3:30',
      facts: [
        { label: 'Title', value: 'Thursday moves to 3:30' },
        { label: 'Message', value: 'Practice on Thursday starts at 3:30, not 3:00. The range is closed until then for a junior clinic. Same place, same plan: short game first, then nine holes.' },
        { label: 'To', value: `Everyone on ${CAP_TEAM} (8)` },
        { label: 'Urgency', value: 'normal' },
        { label: 'Acknowledgement', value: 'Not required' },
      ],
      affects: affects(CAP_ROSTER),
      notifications: ['8 players notified in-app'],
      missing: [],
      idempotency_key: 'announce:team-demo:thursday-moves:practice-on-thursday',
    },
    saved: done('Send a team update', 'Thursday moves to 3:30 sent to 8 players.', [{ kind: 'team update', count: 1, href: '/golf/dashboard/announcements', label: 'Thursday moves to 3:30' }], [{ channel: 'In-app', recipients: 8, status: 'sent' }]),
    failed: failed('Send a team update', 'The update was not sent. Nothing was saved.'),
    variants: {
      long: {
        label: 'A long, urgent message to forty',
        roster: CAP_ROSTER_40,
        proposal: {
          action: 'Send a team update',
          summary: 'Qualifier moved to Ridgeline: new times, vans, breakfast and class letters',
          facts: [
            { label: 'Title', value: 'Qualifier moved to Ridgeline: new times, vans, breakfast and class letters' },
            { label: 'Message', value: LONG_BODY },
            { label: 'To', value: `Everyone on ${CAP_TEAM} (40)` },
            { label: 'Urgency', value: 'urgent' },
            { label: 'Acknowledgement', value: 'Required' },
          ],
          affects: affects(CAP_ROSTER_40),
          notifications: ['40 players notified in-app', 'Each player must acknowledge it'],
          missing: [],
          idempotency_key: 'announce:team-demo:qualifier-moved:thursday-s-qualifier',
        },
      },
      one: {
        label: 'To three named players',
        proposal: {
          action: 'Send a team update',
          summary: 'Van 2 leaves ten minutes early',
          facts: [{ label: 'Title', value: 'Van 2 leaves ten minutes early' }, { label: 'Message', value: 'Van 2 leaves at 6:05, not 6:15. Meet at the lower lot.' }, { label: 'To', value: CAST.slice(4, 7).join(', ') }, { label: 'Urgency', value: 'high' }, { label: 'Acknowledgement', value: 'Not required' }],
          affects: affects(CAP_ROSTER.slice(4, 7)),
          notifications: ['3 players notified in-app'],
          missing: [],
          idempotency_key: 'announce:team-demo:van-2:van-2-leaves',
        },
      },
    },
  },
  {
    tool: 'add_round_note',
    name: 'A coach note on a round',
    ref: 'A12',
    surface: 'Ask and quick chat',
    proposal: {
      visual: { kind: 'note', player: 'Priya Natarajan', note: 'Three of your four bogeys came after a missed green long. From 150 in, take one less club and play to the front number this week.' },
      action: 'Add note',
      summary: 'A note on Priya Natarajan’s round',
      facts: [
        { label: 'Earlier note', value: 'Good patience on the back nine. The par save on 14 is the shot of the day.' },
        { label: 'Adding', value: 'Three of your four bogeys came after a missed green long. From 150 in, take one less club and play to the front number this week.' },
      ],
      affects: [],
      notifications: ['Priya Natarajan will see this note, once Undo closes.'],
      missing: [],
      idempotency_key: 'note:round-priya-1108:three-of-your-four',
    },
    saved: done('add_round_note', 'The note is on the round.', [{ kind: 'note', count: 1 }]),
    failed: failed('add_round_note', 'With the earlier note this passes 2000 characters. Nothing was changed; shorten the new note.', false),
  },
  {
    tool: 'set_availability_note',
    name: 'A coach-only availability note',
    ref: 'A13',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Save note',
      summary: 'Availability note for Sam Whitfield',
      facts: [{ label: 'Replaces', value: 'Out Tuesdays until midterms.' }, { label: 'Note', value: 'Lab moved: out Mondays and Wednesdays before 2 PM through the end of term.' }],
      affects: [],
      notifications: ['Nobody is told. Only coaches see it.'],
      missing: [],
      idempotency_key: 'avail:p-sam:lab-moved',
    },
    saved: done('set_availability_note', 'The note is saved.', [{ kind: 'note', count: 1 }]),
    failed: failed('set_availability_note', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'create_recruit',
    name: 'A recruit',
    ref: 'A14',
    surface: 'Ask and quick chat',
    proposal: { action: 'Add recruit', summary: 'Marcus Delgado', facts: [{ label: 'Grad year', value: '2028' }, { label: 'Status', value: 'watched' }, { label: 'Hometown', value: 'Austin, TX' }], affects: [], notifications: ['Nobody is told. Only coaches see it.'], missing: [], idempotency_key: 'recruit:marcus:delgado:2028' },
    saved: done('create_recruit', 'The recruit is added.', [{ kind: 'recruit', count: 1, href: '/golf/dashboard/recruiting' }]),
    failed: failed('create_recruit', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'create_drill',
    name: 'A drill for the drill bank',
    ref: 'A15',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Add drill',
      summary: 'Lag ladder, 20 to 50 feet',
      facts: [
        { label: 'Area', value: 'Putting' },
        { label: 'Length', value: '20 min' },
        { label: 'Setup', value: 'Tees at 20, 30, 40 and 50 feet on one line, uphill. Three balls from each. A ball counts when it stops inside a putter length past the hole and never short.' },
        { label: 'Goal', value: '9 of 12 inside the putter length, no three putts when holing out' },
      ],
      affects: [],
      notifications: ['Nobody is told. Players see it when a plan uses it.'],
      missing: [],
      idempotency_key: 'drill:lag-ladder:putting:20',
    },
    saved: done('create_drill', 'Lag ladder, 20 to 50 feet is in the drill bank.', [{ kind: 'drill', count: 1, label: 'Lag ladder, 20 to 50 feet' }]),
    failed: failed('create_drill', 'That didn’t go through. Nothing was saved.'),
  },
  {
    tool: 'publish_practice_plan',
    name: 'Publish a practice plan',
    ref: 'A16',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Publish to 10 people',
      summary: 'Thursday short game',
      publish: { heading: 'Publish Thursday short game?', coins: six.map((p) => ({ name: p.name })), coinsMore: 2, tellsLine: '8 players and 2 coaches, push and bell', folder: 'Practice plans', teamChat: true, sample: { player: 'Eli', title: 'Thursday short game', body: 'Thu 3:00 PM at the short-game area. You start at Station 2, bunkers.' } },
      facts: [{ label: 'When', value: 'Thu, Nov 12 · 3:00 to 5:30 PM' }, { label: 'Where', value: 'Short-game area' }, { label: 'Tells', value: '8 players and 2 coaches, push and bell' }, { label: 'What they get', value: 'Thu 3:00 PM at the short-game area. You start at Station 2, bunkers.' }],
      affects: [],
      notifications: ['It files in Documents and 10 people hear once Undo closes, 8 seconds later. The plan posts in Team chat, with no second push.'],
      missing: [],
      idempotency_key: 'publish_plan:plan-thu:3:chat',
    },
    saved: done('publish_practice_plan', 'Published. 10 people told.', [{ kind: 'practice_plan', count: 1, href: '/golf/dashboard/practice/plan/plan-thu', label: 'Thursday short game' }], [{ channel: 'push and bell', recipients: 10, status: 'sent' }]),
    failed: failed('publish_practice_plan', 'The plan changed after this card was made. Nothing was sent.', false),
  },
  {
    tool: 'publish_artifact',
    name: 'Publish a document',
    ref: 'A17',
    surface: 'Ask',
    proposal: {
      action: 'Publish to 8 players',
      summary: 'Eli Brandt: fall review',
      facts: [{ label: 'Who can see it', value: `Players on ${CAP_TEAM} will be able to see this: all 8 active players.` }, { label: 'Goes to', value: 'Documents' }, { label: 'Words', value: DOC_BODY }],
      affects: [],
      notifications: [`Players on ${CAP_TEAM} will be able to see this in Documents (all 8 active players), once the Undo window closes. Nobody gets a notification.`],
      missing: [],
      idempotency_key: 'publish_artifact:eli-brandt-fall-review',
    },
    saved: done('publish_artifact', 'Eli Brandt: fall review is in Documents.', [{ kind: 'document', count: 1, label: 'Eli Brandt: fall review' }]),
    failed: failed('publish_artifact', 'That didn’t publish. Nothing changed.'),
  },
  {
    tool: 'send_message',
    name: 'Send a message',
    ref: 'A18',
    surface: 'Quick chat',
    proposal: {
      visual: { kind: 'msg', conversationId: 'c-travel', thread: 'Travel squad', count: 6, last: 'Sofia: are we in the navy or the white polos Friday?', draft: 'Navy polos Friday, white on Saturday. Vans leave the lower lot at 6:30. Bring rain gear.' },
      action: 'Send to 6 players',
      summary: 'Travel squad',
      facts: [{ label: 'Thread', value: 'Travel squad' }, { label: 'Message', value: 'Navy polos Friday, white on Saturday. Vans leave the lower lot at 6:30. Bring rain gear.' }],
      affects: [],
      notifications: ['Sends as you to 6 players in Travel squad, after an 8 second Undo.'],
      missing: [],
      idempotency_key: 'message:c-travel:navy-polos-friday',
    },
    saved: done('send_message', 'Sent to Travel squad.', [{ kind: 'message', count: 1, href: '/golf/dashboard/messages?conversation=c-travel', label: 'Travel squad' }]),
    failed: failed('send_message', 'That didn’t send. Nothing was delivered.'),
  },
  {
    tool: 'set_lineup',
    name: 'Set a tournament lineup',
    ref: 'A19',
    surface: 'Behind the tournaments flag',
    proposal: {
      visual: { kind: 'lineup', seats: [{ slot: 1, name: 'Sofia Alvarez', alternate: false }, { slot: 2, name: 'Eli Brandt', alternate: false }, { slot: 3, name: 'Jonah Okafor', alternate: false }, { slot: 4, name: 'Ava Lindqvist', alternate: false }, { slot: 5, name: 'Priya Natarajan', alternate: false }, { slot: null, name: 'Owen Park', alternate: true }] },
      action: 'Set lineup',
      summary: 'Tournament lineup',
      facts: [{ label: 'Lineup', value: '1 Sofia Alvarez (lineup), 2 Eli Brandt (lineup), 3 Jonah Okafor (lineup), 4 Ava Lindqvist (lineup), 5 Priya Natarajan (lineup), — Owen Park (alternate)' }],
      affects: [],
      notifications: ['Nobody is told.'],
      missing: [],
      idempotency_key: 'lineup:t-sandhills:4',
    },
    saved: done('set_lineup', 'Lineup set.', [{ kind: 'lineup', count: 1, href: '/golf/dashboard/tournaments/t-sandhills' }]),
    failed: failed('set_lineup', 'The lineup changed while this card was open. Nothing was saved.', false),
  },
  {
    tool: 'lock_lineup',
    name: 'Lock a tournament lineup',
    ref: 'A20',
    surface: 'Behind the tournaments flag',
    proposal: { action: 'Lock the lineup', summary: 'This locks at once and can’t be undone.', facts: [{ label: 'Tournament', value: 'As set' }], affects: [], notifications: ['Substitutions only work if the event allows them.'], missing: [], idempotency_key: 'lock:t-sandhills' },
    saved: done('lock_lineup', 'Lineup locked.', [{ kind: 'lineup', count: 1 }]),
    failed: failed('lock_lineup', 'The lineup is still going through. It isn’t locked; lock it once it lands.'),
  },
  {
    tool: 'send_event_reminder',
    name: 'Remind players about an event',
    ref: 'A21',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Send an event reminder',
      summary: 'Remind 5 players about Short-game practice.',
      facts: [
        { label: 'Event', value: 'Short-game practice · Thu, Nov 12, 3:00 PM at Short-game area, Ridgeline GC' },
        { label: 'To (5)', value: list(CAST.slice(0, 5)) },
        { label: 'Will not get it', value: 'Owen Park (no account yet)' },
        { label: 'They see', value: 'Reminder: Short-game practice\nThu, Nov 12, 3:00 PM at Short-game area, Ridgeline GC' },
        { label: 'How', value: 'A notification in the app that opens the event.' },
        { label: 'When', value: 'When the Undo window closes, a few seconds after you confirm.' },
      ],
      affects: [{ kind: 'event', id: 'ev-short', label: 'Short-game practice' }, ...affects(CAP_ROSTER.slice(0, 5))],
      notifications: ['5 players get an in-app notification: “Reminder: Short-game practice”, “Thu, Nov 12, 3:00 PM at Short-game area, Ridgeline GC”.'],
      missing: [],
      idempotency_key: 'send_event_reminder:ev-short:not_replied',
    },
    saved: done('send_event_reminder', 'The reminder about Short-game practice went to 5 players.', [{ kind: 'reminder', count: 5, href: '/golf/dashboard/calendar?event=ev-short', label: 'Short-game practice' }], [{ channel: 'in-app', recipients: 5, status: 'sent' }]),
    failed: failed('send_event_reminder', 'The event changed after this card was made, so the reminder would no longer say what you approved. Nothing was sent. Ask for the reminder again.', false),
    partial: { status: 'partial', action: 'send_event_reminder', summary: 'The reminder about Short-game practice went to 4 players.', created: [{ kind: 'reminder', count: 4, href: '/golf/dashboard/calendar?event=ev-short', label: 'Short-game practice' }], notifications: [{ channel: 'in-app', recipients: 4, status: 'sent' }], partial_failures: ['1 player of the 5 on the card did not get it.'], retryable: false, at: AT },
    variants: {
      one: {
        label: 'One player',
        proposal: {
          action: 'Send an event reminder',
          summary: 'Remind 1 player about Team meeting.',
          facts: [{ label: 'Event', value: 'Team meeting · Mon, Nov 16, 7:00 PM' }, { label: 'To (1)', value: 'Theo Marchetti' }, { label: 'They see', value: 'Reminder: Team meeting\nMon, Nov 16, 7:00 PM' }, { label: 'How', value: 'A notification in the app that opens the event.' }, { label: 'When', value: 'When the Undo window closes, a few seconds after you confirm.' }],
          affects: [{ kind: 'event', id: 'ev-meet', label: 'Team meeting' }, ...affects([CAP_ROSTER[3]!])],
          notifications: ['1 player gets an in-app notification: “Reminder: Team meeting”, “Mon, Nov 16, 7:00 PM”.'],
          missing: [],
          idempotency_key: 'send_event_reminder:ev-meet:named',
        },
      },
      forty: {
        label: 'Forty players',
        roster: CAP_ROSTER_40,
        proposal: {
          action: 'Send an event reminder',
          summary: 'Remind 40 players about Compliance meeting, all squads.',
          facts: [{ label: 'Event', value: 'Compliance meeting, all squads · Wed, Nov 18, 7:30 AM at Hartwell Athletics Center, room 204' }, { label: 'To (40)', value: list(CAP_ROSTER_40.map((p) => p.name)) }, { label: 'They see', value: 'Reminder: Compliance meeting, all squads\nWed, Nov 18, 7:30 AM at Hartwell Athletics Center, room 204' }, { label: 'How', value: 'A notification in the app that opens the event.' }, { label: 'When', value: 'When the Undo window closes, a few seconds after you confirm.' }],
          affects: [{ kind: 'event', id: 'ev-comp', label: 'Compliance meeting, all squads' }, ...affects(CAP_ROSTER_40)],
          notifications: ['40 players get an in-app notification: “Reminder: Compliance meeting, all squads”, “Wed, Nov 18, 7:30 AM at Hartwell Athletics Center, room 204”.'],
          missing: [],
          idempotency_key: 'send_event_reminder:ev-comp:invited',
        },
      },
    },
  },
  {
    tool: 'record_attendance',
    name: 'Record attendance',
    ref: 'A22',
    surface: 'Ask and quick chat',
    proposal: {
      action: 'Record attendance',
      summary: 'Record attendance for 7 players at Short-game practice.',
      facts: [
        { label: 'Event', value: 'Short-game practice · Thu, Nov 12, 3:00 PM' },
        { label: 'Present (5)', value: list([CAST[0]!, CAST[2]!, CAST[5]!, CAST[6]!, CAST[7]!]) },
        { label: 'Late (1)', value: 'Jonah Okafor' },
        { label: 'No-show (1)', value: 'Sam Whitfield' },
        { label: 'Changes a mark already recorded', value: 'Jonah Okafor: Present now, Late after' },
        { label: 'Not marked', value: '1 player on the roster is left as they are.' },
        { label: 'Players are told', value: 'Nothing is sent to players.' },
      ],
      affects: [{ kind: 'event', id: 'ev-short', label: 'Short-game practice' }, ...affects(CAP_ROSTER.filter((p) => p.name !== 'Theo Marchetti'))],
      notifications: [],
      missing: [],
      idempotency_key: 'record_attendance:ev-short:7',
    },
    saved: done('record_attendance', 'Attendance is saved for 7 players at Short-game practice. Nothing was sent to players.', [{ kind: 'attendance', count: 7, href: '/golf/dashboard/calendar?event=ev-short', label: 'Short-game practice' }]),
    failed: failed('record_attendance', 'Failed to save attendance. I could not check which marks were saved: look at the event in the Calendar. Saving again is safe, it writes the same marks.'),
    partial: { status: 'partial', action: 'record_attendance', summary: 'Attendance is saved for 5 players at Short-game practice, and not for Jonah Okafor and Sam Whitfield.', created: [{ kind: 'attendance', count: 5, href: '/golf/dashboard/calendar?event=ev-short', label: 'Short-game practice' }], notifications: [], partial_failures: ['Jonah Okafor: Failed to save attendance.', 'Sam Whitfield: Failed to save attendance.'], error: 'Failed to save attendance.', retryable: true, at: AT },
  },
];

export const capTask = (tool: string | undefined): CapTask | undefined => CAP_TASKS.find((t) => t.tool === tool);
