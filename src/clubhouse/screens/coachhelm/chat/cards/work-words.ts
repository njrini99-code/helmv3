/**
 * Every kind of work a turn can be doing and the exact words the coach is shown for it (CAPABILITIES.md, section F).
 * The labels are the server's own `progress` strings (`readers.ts`, `readers-direct.ts`, `tasks.ts`, `action-planners`
 * via `tasks.ts`, `tasks/event-tasks.ts`, `context/**`) and the shell's sentences (SPEC Moment 4 and 7). A tool name is
 * never one of them. Data only: the work line itself is the chat UI lead's.
 */
export interface WorkKind {
  id: string;
  kind: string;
  /** Does the mark turn. */
  mark: 'turning' | 'at rest';
  words: readonly string[];
  /** What follows when it ends. */
  after?: string;
}

export const WORK_KINDS: readonly WorkKind[] = [
  { id: 'sending', kind: 'Nothing from the server yet', mark: 'turning', words: ['(no words for 1.2 s)', 'Sending', 'Still sending. This is taking longer than usual.', 'No answer yet. You can stop and ask again.'] },
  { id: 'thinking', kind: 'The server has the turn', mark: 'turning', words: ['Thinking', 'Still thinking. Long questions take a little longer.'] },
  {
    id: 'reading',
    kind: 'Reading',
    mark: 'turning',
    words: ['Reading the statistics', 'Reading the rounds and statistics', 'Reading Team Stats', 'Reading the rounds', 'Reading the round hole by hole', 'Reading the logged shots', 'Reading the season', 'Reading the qualifiers', 'Reading the qualifier board', 'Reading tournament results', 'Checking the schedule', 'Checking the schedule and travel', 'Checking outstanding tasks', 'Reading what CoachHelm has on record', 'Reading practice', 'Reading the standards', 'Looking it up in the golf reference', 'Looking that up', 'Reading the team’s records', 'Finding the thread', 'Finding that in the app'],
    after: 'The check, and the detail when the server sends one (“38 rounds”)',
  },
  { id: 'comparing', kind: 'Comparing and ranking', mark: 'turning', words: ['Ranking the team', 'Comparing the seasons'], after: 'The check' },
  { id: 'calculating', kind: 'Calculating', mark: 'turning', words: ['Working out the figures', 'Working it out across the team'], after: '“14 reads · 1 calculation · 4s”' },
  { id: 'drawing', kind: 'Drawing', mark: 'turning', words: ['Building the visual', 'Putting the board together'], after: 'The visual arrives whole' },
  { id: 'drafting', kind: 'Drafting', mark: 'turning', words: ['Drafting a task', 'Drafting a focus area', 'Drafting a team update', 'Drafting the goal', 'Drafting the note', 'Drafting the drill', 'Drafting the message', 'Drafting the poll', 'Drafting the practice plan', 'Writing it up', 'Putting the questions together'], after: 'The card arrives whole' },
  { id: 'preparing', kind: 'Preparing a task', mark: 'turning', words: ['Preparing the event', 'Preparing the practice dates', 'Preparing the trip', 'Preparing the qualifier', 'Preparing the blocked time', 'Preparing the break', 'Preparing the term', 'Preparing the recruit', 'Preparing the lineup', 'Preparing to lock the lineup', 'Preparing to publish', 'Preparing to publish the plan', 'Preparing the reminder', 'Preparing attendance', 'Reading the note on that round'], after: 'The card arrives whole' },
  { id: 'noting', kind: 'Saving a note', mark: 'turning', words: ['Saving that note', 'Removing that note'], after: 'The chip' },
  { id: 'waiting', kind: 'Waiting for the coach', mark: 'at rest', words: ['Waiting for you'] },
  { id: 'holding', kind: 'Holding a write', mark: 'at rest', words: ['Not saved yet'], after: 'The ring and its sentence are on the card' },
  { id: 'saving', kind: 'Saving', mark: 'turning', words: ['Saving…'], after: 'Shown only if the result takes over 300 ms' },
  { id: 'saved', kind: 'Saved', mark: 'at rest', words: ['Added', 'Set', 'Assigned', 'Proposed', 'Posted', 'Published', 'Sent', 'Saved', 'Blocked', 'Locked'] },
  { id: 'undone', kind: 'Undone, cancelled, set aside', mark: 'at rest', words: ['Undone', 'Cancelled', 'Set aside'] },
  { id: 'failed', kind: 'Failed', mark: 'at rest', words: ['Not saved', 'Not sent', 'Couldn’t read practice reviews'] },
  { id: 'done', kind: 'Done', mark: 'at rest', words: ['3 reads · 2s', '1 read · 1s', '3 reads'] },
  { id: 'player', kind: 'A player’s Ask', mark: 'turning', words: ['Reading your statistics', 'Reading your season', 'Reading your CoachHelm', 'Working out your figures'] },
];
