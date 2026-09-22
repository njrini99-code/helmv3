/**
 * Intent routing for CoachHelm chat.
 *
 * One Choice picks the kind of request; a few speculative Nouls run in the
 * same call so the route can act on whichever are relevant without a second
 * round trip (docs: patterns/intent-routing, patterns/fan-out).
 */

import { choice, noul } from '@typesafe-ai/sdk';
import { askJev, type JevResult } from '../client';

export const CHAT_INTENT_QUESTIONS = {
  intent: choice('What is the coach asking for in `question`?', {
    stat_lookup: 'A specific number or fact about a player, team, or round ("what is X\'s scoring average")',
    trend_or_comparison: 'How something changed over time, or how players/rounds compare',
    diagnosis: 'Why a player is struggling, what their biggest leak is, what to work on',
    practice_plan: 'A drill, practice schedule, or training prescription',
    lineup_or_qualifying: 'Who should play, lineup order, qualifying standings',
    scheduling_or_logistics: 'Calendar, events, travel, RSVPs, announcements',
    recruiting_or_roster: 'Recruits, roster moves, eligibility',
    app_help: 'How to use the app itself',
    off_topic: 'Not about coaching this golf program at all',
    unclear: 'Too vague or fragmentary to tell',
  }),
  names_specific_player: noul('Does `question` refer to one or more specific players by name or nickname?'),
  is_follow_up: noul(
    'Does `question` depend on `previous_turns` to be understood (pronouns like "him", "that", "the same for", or an elliptical fragment)?',
  ),
  needs_fresh_data: noul(
    'Would answering `question` well require looking up current data (rounds, stats, calendar) rather than general golf knowledge?',
  ),
  wants_action: noul(
    'Is the coach asking the assistant to DO something (create, send, schedule, assign) rather than to tell them something?',
  ),
} as const;

export type ChatIntentAnswers = JevResult<typeof CHAT_INTENT_QUESTIONS>['answers'];
export type ChatIntent = ChatIntentAnswers['intent']['choice'];

export async function judgeChatIntent(input: {
  question: string;
  /** Up to the last few turns, oldest first, as "role: text". */
  previous_turns: string[];
}) {
  return askJev(input, CHAT_INTENT_QUESTIONS, { purpose: 'chat_intent', timeoutMs: 1_500 });
}
