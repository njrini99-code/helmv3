/**
 * Coach inbox triage — one player/parent message in, a handful of labels out.
 *
 * Each label is an independent Noul (probability of yes) so several can hold
 * at once ("injury" AND "will miss event"). Urgency is a Score whose levels
 * describe concrete situations, so the value is comparable across messages
 * and sortable. Thresholds live with the consumer, not here: the raw
 * probabilities are the reusable data.
 */

import { noul, score, choice } from '@typesafe-ai/sdk';
import { askJev, type JevResult } from '../client';

export const MESSAGE_TRIAGE_QUESTIONS = {
  injury: noul('Does `message` mention a physical injury, pain, illness, or a medical limitation?', {
    true: 'Any mention of being hurt, sore, sick, injured, or under medical restriction',
    false: 'No health or injury content',
  }),
  may_miss_event: noul(
    'Does the sender indicate they may miss, be late to, or need to reschedule a practice, round, tournament, or meeting?',
  ),
  needs_coach_reply: noul(
    'Does `message` call for a reply or decision from the coach, rather than being purely informational or social?',
    {
      true: 'Asks a question, requests permission, or reports something the coach must act on',
      false: 'A thank-you, acknowledgement, or chit-chat that needs no response',
    },
  ),
  negative_sentiment: noul(
    'Does the sender express frustration, discouragement, anxiety, or conflict with a teammate or coach?',
  ),
  urgency: score('How soon does the coach need to act on `message`?', [
    'No action needed, or it can wait a week or more',
    'Should be handled within a day or two',
    'Needs a response today',
    'Needs an immediate response: safety, same-day logistics, or a crisis',
  ]),
  topic: choice('What is `message` mainly about?', {
    health: 'Injury, illness, or medical matters',
    availability: 'Attendance, scheduling, travel, or calendar changes',
    performance: 'How the player is playing or practising, stats, swing, mental game',
    logistics: 'Equipment, uniforms, forms, payments, transport',
    academics: 'School, grades, eligibility',
    recruiting: 'College interest, camps, showcases, coaches from other programs',
    social: 'Greetings, thanks, banter, team spirit',
    other: null,
  }),
} as const;

export type MessageTriageAnswers = JevResult<typeof MESSAGE_TRIAGE_QUESTIONS>['answers'];

export interface MessageTriageInput {
  message: string;
  /** Who sent it, as the coach would see it: 'player' | 'parent' | 'coach'. */
  sender_role: string;
  /** Optional preceding messages in the thread, oldest first, for context. */
  thread_context?: string[];
}

export async function triageMessage(input: MessageTriageInput) {
  return askJev(
    {
      message: input.message,
      sender_role: input.sender_role,
      thread_context: input.thread_context ?? [],
    },
    MESSAGE_TRIAGE_QUESTIONS,
    { purpose: 'message_triage' },
  );
}

/** Labels the consumer can sort/filter on; thresholds are the caller's policy. */
export function summariseTriage(answers: MessageTriageAnswers, threshold = 0.6) {
  const flags: string[] = [];
  if (answers.injury.noul >= threshold) flags.push('injury');
  if (answers.may_miss_event.noul >= threshold) flags.push('may_miss_event');
  if (answers.negative_sentiment.noul >= threshold) flags.push('negative_sentiment');
  return {
    flags,
    needsReply: answers.needs_coach_reply.noul >= threshold,
    urgency: answers.urgency.score,
    topic: answers.topic.choice,
    topicConfidence: answers.topic.confidence,
  };
}
