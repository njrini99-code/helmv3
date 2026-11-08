import type { RejectedClaim } from '../llm/claim-validator';
import type { UnsupportedClaim } from './provenance';
import type { TurnVerdict } from './verdict';

/**
 * What the model is told when the audit refused its answer and the route gives it one more try (a coach turn, once).
 *
 * The message names each refused figure or claim and says WHY in the words a model can act on: the figure is in no read, it belongs to someone
 * else's row, it is a count nobody worked out, it rests on too few rounds, a reason has no figure behind it. It never carries an id, a tool
 * name or a field name, and never says what the true figure is: the model reads again if it needs one. Returns null when there is nothing
 * specific to say (the stream did not finish, or the refusal names nothing), because a repair then has nothing to go on.
 */
export type RejectedTurn = Extract<TurnVerdict, { outcome: 'rejected' }>;

const MAX_LISTED = 8;
const MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const WORD_COUNT = /^(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;

/** "sg_around_green" read as words; a metric the model wrote about, not a field it must name. */
function metricWords(id: string): string {
  return id.replace(/^sg_/, 'strokes gained ').replace(/_/g, ' ').replace(/\bpct\b/g, '%').trim();
}

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

function describeFigure(u: UnsupportedClaim): string {
  if (MONTH.test(u.text)) return `${q(u.text)} is a date none of your reads returned; use only dates a read returned, or leave the date out`;
  if (u.misattributed) return `${q(u.text)} is in your reads, but for a different player, metric or window than the one you wrote it against; restate it with the right one, or leave it out`;
  if (WORD_COUNT.test(u.text) || (/^\d{1,2}$/.test(u.text) && Number.isInteger(u.value) && u.value >= 3 && u.value <= 12)) {
    return `${q(u.text)} is a count none of your reads states; use a count a read returned, or have it counted and quote that figure`;
  }
  return `${q(u.text)} is not a figure any of your reads returned; use the figure as a read returned it, or leave it out`;
}

function describeClaim(r: RejectedClaim): string {
  const what = `the figure for ${metricWords(r.claim.metric_id)} (${r.claim.value})`;
  switch (r.reason) {
    case 'unsupported_small_number':
      return `${what} rests on too few rounds or attempts; write how many it is over right beside it, or leave it out`;
    case 'unsupported_cause':
      return 'a reason you gave for a result has no figure behind it; say what the numbers show without saying why, or give the reason only with the figure that backs it';
    case 'wrong_player':
      return `${what} is written against a player whose reads do not hold it; check whose it is`;
    case 'wrong_window':
      return `${what} is over a different stretch of rounds than the one you wrote; say the stretch the read covered`;
    case 'value_mismatch':
      return `${what} does not match what the read returned for that player and window; copy it as the read returned it`;
    case 'wrong_unit':
    case 'wrong_denominator':
      return `${what} is written in a different unit or out of a different total than the read; copy the read's own`;
    default:
      return `${what} did not match your reads; copy it as a read returned it, or leave it out`;
  }
}

export function repairFeedback(verdict: RejectedTurn): string | null {
  if (verdict.reason === 'stream_incomplete') return null;
  const items: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      items.push(s);
    }
  };
  for (const u of verdict.unsupported ?? []) add(describeFigure(u));
  for (const r of verdict.rejectedClaims ?? []) add(describeClaim(r));
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_LISTED);
  const more = items.length - shown.length;
  return [
    'Your answer was checked against what your reads returned this turn, and part of it could not be confirmed:',
    ...shown.map((i) => `- ${i}`),
    ...(more > 0 ? [`- and ${more} more of the same kind`] : []),
    'Write the whole answer again. Quote only figures a read returned this turn, as it returned them, with the number of rounds beside any figure over a few. If you need a figure you do not have, read it first; if you cannot get it, say so instead of estimating. Leave out any reason for a result that no figure backs. Keep the citations block at the end.',
  ].join('\n');
}
