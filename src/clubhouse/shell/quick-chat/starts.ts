/**
 * What quick chat knows about the screen it was opened on (QUICK-CHAT.md, Moments 1 and 2): the context chip and the
 * starts that fit that screen. Fixed copy, drawn from the shell's route and crumb trail; a start only seeds a turn.
 */
export type QcScreen = 'player' | 'roster' | 'calendar' | 'stats' | 'rounds' | 'qualifiers' | 'tournaments' | 'messages' | 'team' | 'recruiting' | 'practice' | 'other';

export interface QcContext {
  /** Stable for a screen and a selection: a chip the coach removed stays removed for this key in this conversation. */
  key: string;
  screen: QcScreen;
  /** The page's own words: "Roster · Eli Brandt". */
  label: string;
  playerId: string | null;
  playerName: string | null;
}

export interface QuickStart {
  id: string;
  /** The question, as it is sent. */
  ask: string;
  /** What it reads or makes, in secondary ink: "Putting · Eli", "Makes a task". */
  does: string;
}

const SECTION: ReadonlyArray<[RegExp, QcScreen]> = [
  [/^\/golf\/dashboard\/(roster|players)(\/|$)/, 'roster'],
  [/^\/golf\/dashboard\/calendar(\/|$)/, 'calendar'],
  [/^\/golf\/dashboard\/stats(\/|$)/, 'stats'],
  [/^\/golf\/dashboard\/rounds(\/|$)/, 'rounds'],
  [/^\/golf\/dashboard\/qualifiers(\/|$)/, 'qualifiers'],
  [/^\/golf\/dashboard\/tournaments(\/|$)/, 'tournaments'],
  [/^\/golf\/dashboard\/messages(\/|$)/, 'messages'],
  [/^\/golf\/dashboard\/(team-hub|tasks|announcements|team|travel|documents)(\/|$)/, 'team'],
  [/^\/golf\/dashboard\/recruiting(\/|$)/, 'recruiting'],
  [/^\/golf\/dashboard\/practice(\/|$)/, 'practice'],
];

export function qcScreen(pathname: string): QcScreen {
  return SECTION.find(([re]) => re.test(pathname))?.[1] ?? 'other';
}

/**
 * The chip, or null on a screen with nothing for the chat to read (Home, Settings, What's new): there the composer sits
 * alone. A selection is a player the page itself names (the shell's `lookingAt`).
 */
export function qcContext(pathname: string, looking: { label: string; playerId: string | null; playerName: string | null }): QcContext | null {
  const screen = qcScreen(pathname);
  const player = looking.playerId && looking.playerName ? { id: looking.playerId, name: looking.playerName } : null;
  if (screen === 'other' && !player) return null;
  return { key: `${screen}:${player?.id ?? ''}`, screen: player ? 'player' : screen, label: looking.label, playerId: player?.id ?? null, playerName: player?.name ?? null };
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

const SLIPPING: QuickStart = { id: 'slipping', ask: 'Who’s slipping this month?', does: 'Rounds · team' };
const PRACTICE: QuickStart = { id: 'practice', ask: 'Add a practice', does: 'Makes an event' };
const MESSAGE: QuickStart = { id: 'message', ask: 'Message the team', does: 'Drafts, you send' };
const TEAM_TASK: QuickStart = { id: 'team-task', ask: 'Add a task for the team', does: 'Makes a task' };
const ANNOUNCE: QuickStart = { id: 'announce', ask: 'Post an announcement', does: 'Makes an announcement' };
const TRIP: QuickStart = { id: 'trip', ask: 'Add a trip', does: 'Makes a trip' };
const PLAN: QuickStart = { id: 'plan', ask: 'Set up Thursday’s practice', does: 'Makes a plan' };

const BY_SCREEN: Readonly<Record<Exclude<QcScreen, 'player'>, readonly QuickStart[]>> = {
  roster: [SLIPPING, { id: 'no-round', ask: 'Who hasn’t posted a round this week?', does: 'Rounds · team' }, TEAM_TASK, MESSAGE],
  calendar: [{ id: 'week', ask: 'What’s on this week?', does: 'Calendar' }, PRACTICE, PLAN, { id: 'block', ask: 'Block time for me', does: 'Makes a block' }],
  stats: [{ id: 'losing', ask: 'Where are we losing shots?', does: 'Strokes gained · team' }, { id: 'putting', ask: 'Who’s putting best?', does: 'Putting · team' }, { id: 'compare', ask: 'Compare our last two events', does: 'Rounds · team' }, SLIPPING],
  rounds: [{ id: 'posted', ask: 'Who posted this week?', does: 'Rounds · team' }, { id: 'latest', ask: 'What stands out in the latest rounds?', does: 'Rounds · team' }, SLIPPING, TEAM_TASK],
  qualifiers: [{ id: 'qualifier', ask: 'Set up a qualifier', does: 'Makes a qualifier' }, { id: 'leading', ask: 'Who’s leading the qualifier?', does: 'Qualifiers' }, PRACTICE, MESSAGE],
  tournaments: [{ id: 'last-event', ask: 'How did we score last event?', does: 'Rounds · team' }, { id: 'travel', ask: 'Who should travel?', does: 'Rounds · team' }, TRIP, { id: 'squad', ask: 'Message the travel squad', does: 'Drafts, you send' }],
  messages: [MESSAGE, ANNOUNCE, PRACTICE, SLIPPING],
  team: [TEAM_TASK, ANNOUNCE, TRIP, { id: 'overdue', ask: 'What’s overdue?', does: 'Tasks' }],
  recruiting: [{ id: 'recruit', ask: 'Add a recruit', does: 'Makes a recruit' }, { id: 'board', ask: 'Who’s on the board?', does: 'Recruiting' }, { id: 'my-task', ask: 'Add a task for me', does: 'Makes a task' }, MESSAGE],
  practice: [PLAN, PRACTICE, { id: 'work-on', ask: 'What should we work on this week?', does: 'Strokes gained · team' }, MESSAGE],
  other: [SLIPPING, PRACTICE, MESSAGE, { id: 'can', ask: 'What can you do?', does: 'A short list' }],
};

/** Starts for this screen: three on the phone (what fits above a raised keyboard), four on a desk. `planOn` off drops the plan row. */
export function quickStarts(context: QcContext | null, pathname: string, opts: { count: number; planOn?: boolean }): QuickStart[] {
  const name = context?.playerName ? first(context.playerName) : null;
  const rows: readonly QuickStart[] = name
    ? [
        { id: 'p-putting', ask: `How is ${name} putting?`, does: `Putting · ${name}` },
        { id: 'p-changed', ask: `What changed in ${possessive(name)} last 3 rounds?`, does: `Rounds · ${name}` },
        { id: 'p-focus', ask: `Give ${name} a focus area`, does: 'Makes a focus area' },
        { id: 'p-task', ask: `Set ${name} a task for this week`, does: 'Makes a task' },
      ]
    : BY_SCREEN[context && context.screen !== 'player' ? context.screen : qcScreen(pathname)];
  return rows.filter((r) => opts.planOn !== false || r.id !== 'plan').slice(0, opts.count);
}
