/**
 * The model talking to itself at the top of an answer (coach audit 13 Nov 2026, §3c: an answer's headline was "Oops, I
 * added a stray key."). The answer's first two sentences are its lead, set large, so a self-correction became the headline.
 * The instructions ask for none (instructions.ts); this takes out what still comes, both where the answer is drawn and where
 * a stored turn is restored.
 *
 * Only openers that are about the model's own work are taken: an apology for its mistake, a self-correction, "let me try
 * again". A bare "Sorry, there are no rounds this season." states a finding and stays. An answer that is nothing but such a
 * sentence stays too: an empty answer would say less.
 */
const SELF_TALK =
  /^(?:oops|whoops|my (?:bad|mistake|apologies)|sorry (?:about that|for (?:the|that|my) (?:error|mistake|confusion|mix-?up|trouble))|apologies for (?:the|that|my) (?:error|mistake|confusion|mix-?up)|oh,? wait|(?:let me|i(?:'|’)ll) (?:fix|correct|redo|rebuild|redraw|re-?run|try (?:that |it |this )?again)|i (?:accidentally|mistakenly|added a stray|made (?:a|an) (?:error|mistake|typo)|messed (?:that |it )?up)|that (?:didn(?:'|’)t|did not) work)\b/i;

/** The first sentence and what follows it, split at the first stop followed by a space (a decimal point is never one). */
function firstSentence(text: string): [string, string] | null {
  const m = /^([\s\S]*?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  if (!m) return null;
  return [m[1]!, m[2]!];
}

export function withoutSelfTalk(text: string): string {
  let rest = text.trimStart();
  for (let i = 0; i < 3; i += 1) {
    const split = firstSentence(rest);
    if (!split || !SELF_TALK.test(split[0].trim())) break;
    rest = split[1];
  }
  return rest === text.trimStart() ? text : rest;
}
