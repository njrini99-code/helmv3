import type { ChAskConversation, ChAskData, ChAskFinding } from '../data/coachhelm-chat-shape';
import { buildAskSuggestions } from '../data/coachhelm-chat-shape';
import { ASK_PLAYERS } from './fixtures-ask-thread';

/**
 * Ask CoachHelm, frame data for the preview (`/clubhouse-preview/coachhelm-ask`) and the tests. The team, the chats and the
 * findings are the approved chat mockups' (Finley University; "Putting inside 6 feet"; the three findings), so the looks can
 * be compared to the boards. The conversation pieces are in fixtures-ask-thread.ts.
 */

/** The server's clock for the fixtures: Sept 30, 2026, 2:00 PM in New York. */
export const ASK_NOW = '2026-09-30T18:00:00.000Z';
export const ASK_ZONE = 'America/New_York';

export const ASK_CONVERSATIONS: ChAskConversation[] = [
  { id: 'c-putting', title: 'Putting inside 6 feet', updatedAt: '2026-09-30T17:30:00.000Z' },
  { id: 'c-brief', title: 'Weekly brief, Sept 29', updatedAt: '2026-09-30T12:10:00.000Z' },
  { id: 'c-qual', title: 'Qualifier lineup for Oct 6', updatedAt: '2026-09-28T20:00:00.000Z' },
  { id: 'c-approach', title: 'Jonah and Theo on approach shots', updatedAt: '2026-09-27T15:00:00.000Z' },
  { id: 'c-practice', title: 'Practice plan after Hilltop', updatedAt: '2026-09-25T15:00:00.000Z' },
  { id: 'c-goals', title: 'Fall goals by player', updatedAt: '2026-09-15T15:00:00.000Z' },
  { id: 'c-gir', title: 'Why Eli’s greens in regulation dropped', updatedAt: '2026-09-10T15:00:00.000Z' },
  { id: 'c-travel', title: 'Travel week focus areas', updatedAt: '2026-09-04T15:00:00.000Z' },
];

export const ASK_FINDINGS: ChAskFinding[] = [
  {
    id: 'putting',
    category: 'Putting',
    headline: 'Downhill putts from 4 to 6 feet dropped to 58%',
    evidence: 'Uphill from the same range is 81%.',
    tone: 'attention',
    ask: 'Why are we missing so many short putts lately?',
    link: null,
  },
  {
    id: 'player',
    category: 'Player',
    headline: 'Theo Marchetti has 3 rounds under 72 in a row',
    evidence: 'Approach play is the main lift.',
    tone: 'positive',
    ask: 'What is behind Theo Marchetti’s last three rounds?',
    link: null,
  },
  {
    id: 'rsvp-q',
    category: 'Schedule',
    headline: 'Qualifier on Oct 6, 2 players haven’t replied',
    evidence: 'Priya Natarajan and Ava Lindqvist.',
    tone: 'attention',
    ask: 'Send an RSVP reminder for the Oct 6 qualifier',
    link: { label: 'Open calendar', href: '/golf/dashboard/calendar' },
  },
];

export const PREVIEW_ASK_DATA: ChAskData = {
  teamName: 'Finley University',
  timezone: ASK_ZONE,
  nowIso: ASK_NOW,
  players: ASK_PLAYERS,
  suggestions: buildAskSuggestions({
    openers: ['Brief me on Finley University', 'Where is the team losing the most strokes?'],
    recentCovered: 6,
    rosterCount: ASK_PLAYERS.length,
  }),
  pulse: { findings: ASK_FINDINGS, coverage: '6 of 8 players have a round in the last 30 days. Answers cover those 6.', asOfLabel: '2:00 PM' },
  noRounds: false,
  conversations: { list: ASK_CONVERSATIONS, error: false },
  thread: null,
  notFound: false,
  threadFailed: false,
};

/** Players, and not one recorded round between them (mockups NoRounds, PhoneNoRounds). */
export const PREVIEW_ASK_NOROUNDS: ChAskData = {
  ...PREVIEW_ASK_DATA,
  suggestions: buildAskSuggestions({ openers: [], recentCovered: 0, rosterCount: ASK_PLAYERS.length }),
  pulse: { findings: [], coverage: 'No player has a recorded round yet.', asOfLabel: '2:00 PM' },
  noRounds: true,
  conversations: { list: [], error: false },
};

/** The raw errors the stream route's failures reach the hook as (the hook's `error`), for `?state=error&q=`. */
export const ASK_RAW_ERRORS: Record<string, unknown> = {
  rate: { statusCode: 429, responseBody: JSON.stringify({ error: 'Too many requests. Please slow down.' }) },
  budget: { statusCode: 429, responseBody: JSON.stringify({ error: 'You have reached today’s analysis limit for your program. It resets tomorrow.', reason: 'gated' }) },
  gone: { statusCode: 404, responseBody: JSON.stringify({ error: 'Conversation not found' }) },
  fault: new Error('AI features are unavailable: the Anthropic account is out of credit. Retrying will not help until it is topped up.'),
  dropped: new TypeError('Failed to fetch'),
};
