/**
 * ============================================================================
 * claim-voice — retell a player-voiced CoachHelm claim to a coach
 * ----------------------------------------------------------------------------
 * The CoachHelm NLG layer writes every claim in the second person, because it
 * was built for the player's own surfaces: "Across your last 13 rounds, 7.6% of
 * holes ended in double bogey", "You escape the bunker fine — 92% of your 24
 * sand saves".
 *
 * Those same claim strings are rendered verbatim on the COACH triage surface,
 * where the reader is not the subject — the coach reads "your rounds" and it
 * means their player's rounds (audit 2026-07-24, M12). Rather than fork the
 * generator, we retell the finished sentence in the third person at render
 * time.
 *
 * SCOPE — deliberately narrow. This rewrites only what can be done correctly
 * without parsing:
 *   • possessives      your/yours       → "Cole's"
 *   • contractions     you're/you've/…  → "Cole is" / "Cole has" / …
 *   • subject pronouns "You <verb>"     → "Cole <verb>s" (present simple)
 *   • object pronoun   "…for you"       → "…for Cole"
 *
 * Anything it cannot conjugate confidently it leaves ALONE — a sentence that
 * still says "you" is strictly better than one that says "Cole escape".
 * ========================================================================== */

/** Verbs whose third-person singular is not formed by a suffix rule. */
const IRREGULAR: Record<string, string> = {
  are: 'is',
  have: 'has',
  do: 'does',
  go: 'goes',
  say: 'says',
};

/**
 * Modals take no third-person -s ("you can" → "Cole can"), and a handful of
 * words that follow "you" are not verbs at all — bail rather than mangle them.
 */
const NO_INFLECTION = new Set([
  'can',
  'could',
  'may',
  'might',
  'must',
  'shall',
  'should',
  'will',
  'would',
  'need',
]);

/** Words that can follow "you" but never take an -s (adverbs, negation). */
const NOT_A_VERB = new Set(['not', 'never', 'always', 'still', 'also', 'only', 'just', 'rarely', 'often']);

/** Third-person singular present of a lowercase English verb. */
export function thirdPerson(verb: string): string | null {
  const lower = verb.toLowerCase();
  if (NOT_A_VERB.has(lower)) return null;
  if (NO_INFLECTION.has(lower)) return verb;
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh|o)$/.test(lower)) return `${lower}es`;
  if (/[a-z]$/.test(lower)) return `${lower}s`;
  return null;
}

/** Possessive form of a name — "Cole's", but "Chris'" for a trailing s. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * Retell a second-person claim about `name` in the third person.
 *
 * Returns the input unchanged when `name` is missing or the claim carries no
 * second-person pronouns, so it is safe to call on every string.
 */
export function toCoachVoice(claim: string, name: string | null | undefined): string {
  const who = name?.trim().split(/\s+/)[0];
  if (!who || !claim) return claim;
  if (!/\byou('|’|r|v|ll)?\b|\byour\b/i.test(claim)) return claim;

  let out = claim;

  // Contractions first — "you're" must not be seen as "you" + "re".
  out = out.replace(/\byou['’]re\b/gi, `${who} is`);
  out = out.replace(/\byou['’]ve\b/gi, `${who} has`);
  out = out.replace(/\byou['’]ll\b/gi, `${who} will`);
  out = out.replace(/\byou['’]d\b/gi, `${who} would`);

  // Possessives — "your"/"yours".
  out = out.replace(/\byours\b/gi, possessive(who));
  out = out.replace(/\byour\b/gi, possessive(who));

  // Subject "you" + a present-simple verb → "Cole verbs". Only when a verb
  // follows and we can inflect it; otherwise leave the pronoun in place.
  out = out.replace(/\byou\b(\s+)([A-Za-z]+)/gi, (whole, gap: string, verb: string) => {
    const inflected = thirdPerson(verb);
    if (inflected === null) return whole;
    // Preserve the source's emphasis casing ("You ESCAPE" → "Cole ESCAPES").
    const cased = verb === verb.toUpperCase() && verb.length > 1 ? inflected.toUpperCase() : inflected;
    return `${who}${gap}${cased}`;
  });

  // Remaining bare "you" is an object pronoun ("…works for you").
  out = out.replace(/\byou\b/gi, who);

  return out;
}
