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

/**
 * The stored text is typed on a keyboard; the page sets it in the type the rest of Clubhouse uses: curly apostrophes and
 * quotes, an en dash between the two ends of a number range ("4-6 ft" reads "4–6 ft"; a date or a chain is left), and a
 * no-break space between a distance and its unit, so "4–6 ft" never breaks before "ft".
 */
function typeset(text: string): string {
  return text
    .replace(/(^|[^\d-])(\d{1,3}(?:\.\d+)?)-(\d{1,3}(?:\.\d+)?)(?![\d-])/g, '$1$2–$3')
    .replace(/(\d) (ft|yds?)\b/g, '$1\u00a0$2')
    .replace(/(^|[\s([{])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{])'/g, '$1‘')
    .replace(/'/g, '’');
}

/** `text` as the viewer reads it, typeset: the player's first name for a coach, "you" for the player; as it is with no viewer. */
export function speak(text: string, viewer: ChViewer | undefined): string {
  if (!text || !viewer) return text;
  if (viewer.role === 'player') return typeset(toSecondPerson(text));
  const first = viewer.first.trim();
  return typeset(first ? toThirdPerson(text, first) : text);
}

/**
 * The numbers a text states, in order, as written ("58", "4", "6", "0.4"): the check that two voices of one read agree. A thousands
 * comma is read as part of the number, and a number's sign is left out (a coach's "lost 0.4" and a player's "−0.4" are the same 0.4).
 */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));
}

/** The same numbers, as many times each, in any order (a retelling may move a clause). */
export function sameNumbers(a: string, b: string): boolean {
  const x = numbersIn(a).sort();
  const y = numbersIn(b).sort();
  return x.length === y.length && x.every((n, i) => n === y[i]);
}

/** The source text of a read, before it is spoken: the stored title and content. */
export interface ChReadText {
  title: string;
  content: string;
}

/**
 * The text a read is spoken from for this viewer (design call, "Coach voice vs player voice"; chs-40). A coach reads the engine's
 * stored coach copy (`evidence.coach_copy`, written in neutral third person by the generators, `generator-base.ts`) when the row
 * carries it; `speak` then only names the player and typesets it. Without it, or for a player, the row's own title and content,
 * which `speak` turns into the coach's voice by its regex, as before. Each part falls back on its own, and a coach part whose
 * numbers differ from the player's is not used: both voices of one read must state the same numbers.
 */
export function readTextFor(ins: { title: string; content: string; evidence?: unknown }, coach: boolean): ChReadText & { coachCopy: { title: boolean; content: boolean } } {
  const own = { title: ins.title, content: ins.content, coachCopy: { title: false, content: false } };
  if (!coach) return own;
  const ev = ins.evidence && typeof ins.evidence === 'object' && !Array.isArray(ins.evidence) ? (ins.evidence as Record<string, unknown>) : null;
  const cc = ev?.coach_copy && typeof ev.coach_copy === 'object' && !Array.isArray(ev.coach_copy) ? (ev.coach_copy as Record<string, unknown>) : null;
  if (!cc) return own;
  const usable = (stored: unknown, theirs: string): stored is string => typeof stored === 'string' && stored.trim() !== '' && sameNumbers(stored, theirs);
  const title = usable(cc.title, ins.title);
  const content = usable(cc.content, ins.content);
  return {
    title: title ? (cc.title as string).trim() : ins.title,
    content: content ? (cc.content as string).trim() : ins.content,
    coachCopy: { title, content },
  };
}
