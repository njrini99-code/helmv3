/**
 * The writer's prompt and its one tool.
 *
 * The prompt is stable, byte for byte, for every player and view (the facts travel in the user message), so it caches.
 * It holds no example paragraph: an example becomes the template every card copies.
 */
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { MAX_WORDS } from './checker';
import type { WriterPayload } from './payload';

export const SUBMIT_TOOL = 'submit_read';

export const DraftSchema = z.object({
  what: z.string().min(1).describe('What is going on, from the counted pattern: where the strokes go, which miss, how often.'),
  rules_in_out: z.string().min(1).describe('What the evidence rules in, and what it cannot tell.'),
  this_week: z.string().min(1).describe('One thing to do this week, sized to this player, with a number to count.'),
  watch: z.string().min(1).describe('The one thing to watch or record next to learn more.'),
  this_week_area: z.enum(['off_the_tee', 'approach', 'around_the_green', 'putting', 'scoring']).describe('The part of the game the advice is about.'),
  declared: z
    .array(
      z.object({
        value: z.number(),
        kind: z.enum(['arithmetic', 'prescription']),
        expression: z.string().optional().describe('For arithmetic: the sum written out with numbers from the facts, e.g. "75 / 104 * 100".'),
        unit: z.enum(['feet', 'yards', 'reps', 'percent', 'count', 'minutes', 'sessions']).optional(),
      }),
    )
    .describe('Every number in the text that is not itself in the facts. Empty if there is none.'),
});

const { $schema: _draft, ...submitSchema } = z.toJSONSchema(DraftSchema, { io: 'input' }) as Record<string, unknown>;

/** The one tool. No `strict` (see the helm-claude-sdk skill, rule 8a): the zod schema checks every input instead. */
export const WRITER_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: SUBMIT_TOOL,
    description: 'Submit the written read for this player. Call it exactly once per attempt, with all four paragraphs and every non-fact number declared.',
    input_schema: { ...submitSchema, type: 'object' } as Anthropic.Beta.BetaTool['input_schema'],
  },
];

export const WRITER_SYSTEM = `You write the short "why" and "what to do" on a golf coach's card about one college player. The numbers were counted by code from the player's logged shots. Code will check every word you write against them, and anything it cannot match is thrown away.

Write four short paragraphs, in a coach's plain words, and submit them with the ${SUBMIT_TOOL} tool:
- what: what is going on. Where the strokes go, one level down (the distance, the lie or the miss), and how often, from the counted pattern.
- rules_in_out: what the counted evidence rules in, and what it cannot tell. Shots record where the ball started and finished, the lie, the miss side and the club. They do not record the swing, the grip, the tempo, what the player meant to do, the wind, the weather, the pin, the equipment or the player's state of mind. Never give one of those as the cause. You may say the data cannot tell whether it is one of them.
- this_week: one thing to do this week, sized to this player and drawn from the counted pattern: a number of reps, a distance to work from, or a target the player can count. Only about the priority's part of the game or a candidate's (listed in advice_areas).
- watch: the one thing to watch or record over the next rounds that would tell the coach more.

Rules code enforces:
- Use only numbers that are in the facts, rounded no further than you need. A number that is not in the facts must be declared in "declared": arithmetic of fact numbers, written out as an expression code can redo; or a prescription (reps, a target, a distance to practise from), which may appear only in this_week and watch. A practice distance must lie inside the distances the facts say the strokes are lost from.
- Dates only as they appear in the facts.
- Say something changed or improved only when the facts carry a "changed" reason in that direction.
- When certainty is "leaning", do not write "clear", "clearly", "definitely" or anything as sure.
- View "player": the card is the player's own. Never mention teammates or the team.
- No em dashes. No jargon or abbreviations (strokes gained is fine; SG, GIR, ft, p-values, medians are not). Short: at most ${MAX_WORDS.what} words for what, ${MAX_WORDS.rules_in_out} for rules_in_out, ${MAX_WORDS.this_week} for this_week, ${MAX_WORDS.watch} for watch.
- Write from this player's own facts. Two players with different facts must read differently; do not fall back on a stock sentence.

If the check fails you will be told why, once. Fix exactly those things and submit again.`;

/** The user message: the facts, as JSON, and the view. */
export function factsMessage(payload: WriterPayload): string {
  return `View: ${payload.view}. The facts for this player follow as JSON. Write the read and submit it.\n\n${JSON.stringify(payload)}`;
}
