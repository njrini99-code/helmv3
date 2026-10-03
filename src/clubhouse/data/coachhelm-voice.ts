/**
 * Whose voice a CoachHelm insight's text is in (Clubhouse P013). The generators write one text for everyone: second person ("you're
 * making 58%") with, in some rows, a coach's instruction inside it ("Recommended: have the player call the carry number"). The
 * player reads it as written, minus the coach's instruction; on the coach's board the same text is about the player by their first
 * name. Pure string work over what is stored (rows already written carry the old wording), with a closed list of the verbs the
 * generators put after "you", so a verb it does not know leaves the sentence as written rather than printing "Jonah finish".
 */
export type ChViewer = { role: 'coach'; first: string } | { role: 'player' };

/** Present-tense verbs the generators write after "you" (measured over the stored insights). */
const PRESENT = new Set([
  'finish', 'average', 'birdie', 'escape', 'tee', 'play', 'make', 'reach', 'lose', 'take', 'leave', 'miss', 'gain', 'score', 'convert', 'save',
  'find', 'get', 'keep', 'give', 'drive', 'putt', 'hold', 'avoid', 'record', 'post', 'shoot', 'sink', 'need', 'want', 'tend', 'rely', 'face',
  'carry', 'struggle', 'bogey', 'par',
]);

/** Past forms that do not end in -ed; a verb that does is past already, and stays. */
const IRREGULAR_PAST = new Set(['found', 'got', 'made', 'lost', 'took', 'left', 'gave', 'kept', 'saw', 'went', 'came', 'ran', 'shot', 'sank', 'held', 'drove', 'won']);

const AUXILIARY: Record<string, string> = {
  are: 'is',
  were: 'was',
  have: 'has',
  had: 'had',
  do: 'does',
  did: 'did',
  "don't": "doesn't",
  "didn't": "didn't",
  "aren't": "isn't",
  "weren't": "wasn't",
  "haven't": "hasn't",
  "hadn't": "hadn't",
};

/** A straight or curly apostrophe. */
const AP = "['’]";

const MODALS = `can|could|couldn${AP}t|can${AP}t|cannot|will|would|won${AP}t|wouldn${AP}t|should|shouldn${AP}t|may|might|must|shall`;
const AUX = `are|were|have|had|do|did|don${AP}t|didn${AP}t|aren${AP}t|weren${AP}t|haven${AP}t|hadn${AP}t`;

/** What follows "you" when it is the object of the sentence ("costs you about", "gives you the", "for you,"). */
const OBJECT_FOLLOWER = String.raw`(?=\s+(?:to|the|a|an|plenty|about|out|in|on|at|for|with|from|and|or|that|if|when)\b|\s*[,.;:!?)\]]|\s*$)`;

const straight = (s: string) => s.replace(/’/g, "'").toLowerCase();

function third(verb: string): string {
  if (verb === 'have') return 'has';
  if (verb === 'do') return 'does';
  if (verb === 'go') return 'goes';
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  return `${verb}s`;
}

function toThirdPerson(text: string, first: string): string {
  return text
    .replace(new RegExp(String.raw`\byou${AP}re\b`, 'gi'), `${first} is`)
    .replace(new RegExp(String.raw`\byou${AP}ve\b`, 'gi'), `${first} has`)
    .replace(new RegExp(String.raw`\byou${AP}ll\b`, 'gi'), `${first} will`)
    .replace(new RegExp(String.raw`\byou${AP}d\b`, 'gi'), `${first} would`)
    .replace(new RegExp(String.raw`\byou (${AUX})(?![\w'’])`, 'gi'), (_m, aux: string) => `${first} ${AUXILIARY[straight(aux)] ?? aux}`)
    .replace(new RegExp(String.raw`\byou (${MODALS})(?![\w'’])`, 'gi'), (_m, modal: string) => `${first} ${modal.toLowerCase()}`)
    .replace(/\byou ([a-z]+)\b/gi, (m, word: string) => {
      const w = word.toLowerCase();
      if (PRESENT.has(w)) return `${first} ${third(w)}`;
      if (IRREGULAR_PAST.has(w) || /ed$/.test(w)) return `${first} ${w}`;
      return m;
    })
    .replace(new RegExp(String.raw`\byou\b${OBJECT_FOLLOWER}`, 'gi'), first)
    .replace(/\byour\b/gi, `${first}'s`)
    .replace(new RegExp(String.raw`\bthe player${AP}s\b`, 'gi'), `${first}'s`)
    .replace(/\bthe player\b/gi, first);
}

function toSecondPerson(text: string): string {
  return text
    .replace(/\b(Have|have) the player\s+(\w)/g, (_m, have: string, next: string) => (have === 'Have' ? next.toUpperCase() : next))
    // The approach generators end the instruction "...from here together": the coach and the player, which the player's own copy says.
    .replace(/\bfrom here together\b/g, 'from here with your coach')
    .replace(new RegExp(String.raw`\b(The|the) player${AP}s\b`, 'g'), (_m, the: string) => (the === 'The' ? 'Your' : 'your'))
    .replace(/\b(The|the) player\b/g, (_m, the: string) => (the === 'The' ? 'You' : 'you'));
}

/** `text` as the viewer reads it: the player's first name for a coach, "you" for the player, as it is with no viewer. */
export function speak(text: string, viewer: ChViewer | undefined): string {
  if (!text || !viewer) return text;
  if (viewer.role === 'player') return toSecondPerson(text);
  const first = viewer.first.trim();
  return first ? toThirdPerson(text, first) : text;
}
