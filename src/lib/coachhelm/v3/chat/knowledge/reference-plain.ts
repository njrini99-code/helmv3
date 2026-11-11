/**
 * CoachHelm chat knowledge: the golf reference in the words an answer may use.
 *
 * The research document (`docs/v3-research-golf-domain.md`) is written in an analyst's shorthand: "SG:APP", "GIR", "FW%",
 * "15-HCP", "25+ ft", "~65%", "vs", arrows. A model handed that text copies it to a coach, and the owner's complaint was
 * exactly that ("n=4", abbreviations, capitals). The document is not edited. Its text is expanded here, at the point
 * the reference a read returns is built (`../golf-reference.ts`), so the model never sees a token the writing rules
 * forbid (`eval/golf-sense.json`, `global_forbid`; `__tests__/reference-plain.test.ts` holds the served text to them).
 *
 * Three things are done, in this order, to prose and table cells but never inside a markdown link (a link's text is a
 * publication's own title, a proper noun, and its address is an address):
 *   1. self-references are removed ("Research doc §4", "see the next section", "section 2"): the model must never be
 *      shown a citation of this document as something to repeat;
 *   2. the shorthand in EXPANSIONS is written out, each rule a pattern and its words, applied top to bottom;
 *   3. a sentence, bullet or table cell that now starts lower-case gets its capital back.
 * Numbers are never changed: a rule may reword what stands between or after digits ("0-6 ft" to "0 to 6 feet"), never
 * the digits. Headings are also put in sentence case, with the proper nouns in KEEP_CAPITALS left as they are written.
 */

export interface Expansion {
  /** What the rule writes out, for the test's messages and a reader of this table. */
  name: string;
  pattern: RegExp;
  to: string;
}

/** Order matters: the specific forms come before the bare ones they contain. */
export const EXPANSIONS: readonly Expansion[] = [
  // --- strokes gained ---------------------------------------------------------------------------------------------
  { name: 'Strokes Gained (SG)', pattern: /Strokes Gained \(SG\)/g, to: 'Strokes gained' },
  { name: 'SG: OTT', pattern: /SG:\s?OTT(?: \(Off-the-Tee\))?/g, to: 'strokes gained off the tee' },
  { name: 'SG: APP', pattern: /SG:\s?APP(?: \(Approach\))?/g, to: 'strokes gained approach' },
  { name: 'SG: ARG', pattern: /SG:\s?ARG(?: \(Around the Green\))?/g, to: 'strokes gained around the green' },
  { name: 'SG: PUTT', pattern: /SG:\s?(?:PUTT(?: \(Putting\))?|Putting)/g, to: 'strokes gained putting' },
  { name: 'SG: Total', pattern: /SG:\s?Total/g, to: 'strokes gained total' },
  { name: 'SG', pattern: /\bSG\b/g, to: 'strokes gained' },
  { name: 'Strokes Gained', pattern: /\bStrokes Gained\b/g, to: 'strokes gained' },
  // --- the older stats --------------------------------------------------------------------------------------------
  { name: 'GIR', pattern: /\bGIR\b/g, to: 'greens in regulation' },
  { name: 'FW%', pattern: /\bFW\s?%/g, to: 'fairways hit %' },
  { name: 'FW', pattern: /\bFW\b/g, to: 'fairway' },
  { name: 'N-HCP', pattern: /(\d)[- ]HCP\b/g, to: '$1-handicap' },
  { name: 'HCP', pattern: /\bHCP\b/g, to: 'handicap' },
  { name: '3-putt', pattern: /\b3-[Pp]utt/g, to: 'three-putt' },
  { name: '1-putt', pattern: /\b1-[Pp]utt/g, to: 'one-putt' },
  { name: 'avg', pattern: /\b[Aa]vg\b/g, to: 'average' },
  // --- distances: feet and yards, in words --------------------------------------------------------------------------
  { name: '>N ft', pattern: />\s?(\d+)\s?ft\b/g, to: 'over $1 feet' },
  { name: 'N+ ft', pattern: /(\d+)\+\s?ft\b/g, to: '$1 feet and beyond' },
  { name: 'N-N ft', pattern: /(\d+)\s?[-–]\s?(\d+)\s?ft\b/g, to: '$1 to $2 feet' },
  { name: 'N-ft (adjective)', pattern: /(\d)-ft\b/g, to: '$1-foot' },
  { name: 'N ft', pattern: /(\d)\s?ft\b/g, to: '$1 feet' },
  { name: '<N yds', pattern: /<\s?(\d+)\s?yds?\b/g, to: 'under $1 yards' },
  { name: 'N+ yds', pattern: /(\d+)\+\s?yds?\b/g, to: '$1 yards and beyond' },
  { name: 'N-N yds', pattern: /(\d+)\s?[-–]\s?(\d+)\s?yds?\b/g, to: '$1 to $2 yards' },
  { name: 'N-yd (adjective)', pattern: /(\d)-yd\b/g, to: '$1-yard' },
  { name: 'N yds', pattern: /(\d)\s?yds?\b/g, to: '$1 yards' },
  // --- other units and rates --------------------------------------------------------------------------------------
  { name: '<N mph', pattern: /<\s?(\d+)\s?mph\b/g, to: 'under $1 miles an hour' },
  { name: 'N mph', pattern: /(\d)\s?mph\b/g, to: '$1 miles an hour' },
  { name: 'N°F', pattern: /(\d)\s?°F\b/g, to: '$1 degrees Fahrenheit' },
  { name: 'N-N°', pattern: /(\d+)\s?[-–]\s?(\d+)°/g, to: '$1 to $2 degrees' },
  { name: '/round', pattern: /\/round\b/g, to: ' a round' },
  { name: '/year', pattern: /\/year\b/g, to: ' a year' },
  // --- clubs --------------------------------------------------------------------------------------------------------
  { name: 'N-Ni', pattern: /\b(\d)-(\d)i\b/g, to: '$1- to $2-iron' },
  { name: 'Ni-Ni', pattern: /\b(\d)i-(\d)i\b/g, to: '$1-iron to $2-iron' },
  { name: 'Ni', pattern: /\b(\d)i\b/g, to: '$1-iron' },
  { name: 'NW', pattern: /\b(\d)W\b/g, to: '$1-wood' },
  { name: 'PW', pattern: /\bPW\b/g, to: 'pitching wedge' },
  { name: 'GW', pattern: /\bGW\b/g, to: 'gap wedge' },
  // --- levels and course terms --------------------------------------------------------------------------------------
  { name: 'D1', pattern: /\bD1\b/g, to: 'Division I' },
  { name: 'D2', pattern: /\bD2\b/g, to: 'Division II' },
  { name: 'D3', pattern: /\bD3\b/g, to: 'Division III' },
  { name: 'JUCO', pattern: /\bJUCO\b/g, to: 'junior college' },
  { name: 'OB', pattern: /\bOB\b/g, to: 'out of bounds' },
  // --- signs written as words -----------------------------------------------------------------------------------------
  { name: 'vs', pattern: /\bvs\b\.?/g, to: 'against' },
  { name: 'N → N', pattern: /(\d%?)\s→\s(\d)/g, to: '$1 to $2' },
  // In prose an arrow reads as a colon: "fairway: about 65%". A heading's arrows are handled in plainHeading ("to").
  { name: '→', pattern: /\s→\s/g, to: ': ' },
  { name: '≈', pattern: /\s?≈\s?/g, to: ' about ' },
  { name: '~', pattern: /~/g, to: 'about ' },
  { name: '×', pattern: /\s×\s/g, to: ' times ' },
  { name: '<N', pattern: /<\s?(\d)/g, to: 'under $1' },
  { name: 'N%+', pattern: /(\d%)\+/g, to: '$1 or more' },
  { name: 'N+', pattern: /(\d)\+(?=[\s),;:.]|$)/g, to: '$1 or more' },
];

/** Citations of the document itself, and pointers around it. Removed wherever they stand. */
export const SELF_REFERENCES: readonly RegExp[] = [
  /\s?\((?:[Ss]ee|[Pp]er|[Ff]rom)?\s?(?:the\s)?[Rr]esearch doc(?:ument)?\b[^)]*\)/g,
  /\b(?:[Pp]er|[Ss]ee|[Ff]rom)\s(?:the\s)?[Rr]esearch doc(?:ument)?\b\s?§?\s?\d*(?:\.\d+)?[,:]?\s?/g,
  /\b[Rr]esearch doc(?:ument)?\b\s?§?\s?\d*(?:\.\d+)?/g,
  /\s?\((?:[Ss]ee|per)\s[^)]*\bsection\b[^)]*\)/g,
  /;\s[^;|.]*\b(?:are|is)\sin\ssection\s\d+/g,
  /\bSection \d+ sources\b/g,
  /§\s?\d+(?:\.\d+)?/g,
];

/** A served text may not match this once it has been made plain: nothing that cites or points around the document. */
export const SELF_REFERENCE_GUARD = /research doc|§|\bsections? \d|\b(?:next|previous|above|below) section\b|\bthis document\b|master plan|\bdocs\//i;

/** Proper nouns a heading keeps as they are written when it is put in sentence case. */
const KEEP_CAPITALS = new Set(['Tour', 'PGA', 'LPGA', 'AJGA', 'NCAA', 'NAIA', 'USGA', 'Shot', 'Scope', 'Broadie', 'Arccos', 'Division', 'I', 'II', 'III', 'Stimp', 'Texas']);

const LINK = /(\[[^\]]*\]\([^)]*\))/g;

/** Applies `change` to everything that is not a markdown link. */
function outsideLinks(text: string, change: (prose: string) => string): string {
  return text
    .split(LINK)
    .map((part, i) => (i % 2 === 1 ? part : change(part)))
    .join('');
}

const expand = (prose: string): string => EXPANSIONS.reduce((out, rule) => out.replace(rule.pattern, rule.to), prose);

/** Stands where a self-reference was cut, until the words around the cut are tidied. Never in a text. */
const CUT = '<<cut>>';

/**
 * Cuts the self-references and tidies only where a cut was made: the sentence that began with one gets its capital, a
 * sentence that was nothing else goes with its full stop, and no space is left before the punctuation that followed.
 * Nothing else in the text is touched, so this is safe on words this module did not write (an insight's body).
 */
const stripSelf = (prose: string): string =>
  SELF_REFERENCES.reduce((out, re) => out.replace(re, CUT), prose)
    .replace(/(^|[.!?]\s+|\n)((?:<<cut>>\s*)+)([a-z])/g, (_, start: string, _cut: string, ch: string) => `${start}${ch.toUpperCase()}`)
    .replace(/([.!?])\s*<<cut>>\s*\./g, '$1')
    .replace(/\s*<<cut>>\s*(?=[.,;:)])/g, '')
    .replace(/([ \t]?)<<cut>>([ \t]?)/g, (_, before: string, after: string) => (before && after ? ' ' : before || after));

/** A capital at the start of the text, of a line (after a bullet, a quote mark, a list number, a table bar or bold), of a table cell, and after a full stop. */
const capitalise = (prose: string): string =>
  prose
    .replace(/(^|\n)((?:[-*>]\s|\d+\.\s|\|\s?)?\*{0,2})([a-z])/g, (_, start: string, marks: string, ch: string) => `${start}${marks}${ch.toUpperCase()}`)
    .replace(/(\|\s\*{0,2})([a-z])/g, (_, bar: string, ch: string) => `${bar}${ch.toUpperCase()}`)
    .replace(/([.!?]\s+\*{0,2})([a-z])/g, (_, stop: string, ch: string) => `${stop}${ch.toUpperCase()}`);

/** Words in sentence case, with the proper nouns in KEEP_CAPITALS left as written. */
function sentenceCase(words: string): string {
  const cased = words
    .split(' ')
    .map((word) => (KEEP_CAPITALS.has(word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')) ? word : word.toLowerCase()))
    .join(' ');
  return cased.replace(/^([^A-Za-z]*)([a-z])/, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/** A table's header row ("| Lie | Key Effect | Skill That Matters |") in sentence case: a header is a label the model may repeat. */
const headerRows = (text: string): string =>
  text.replace(/^(\|.*\|)[ \t]*\n(?=\|\s?-{3})/gm, (_, row: string) => `${row.split('|').map((cell: string) => (cell.trim() ? ` ${sentenceCase(cell.trim())} ` : cell)).join('|')}\n`);

/** Removes a citation of the research document from any text a model will read (an insight's body, a note, a reference section). */
export function stripSelfReferences(text: string): string {
  return outsideLinks(text, stripSelf).replace(/^\s+/, '');
}

/** A reference section's text in the words an answer may use. Links are left exactly as they are. */
export function plainText(text: string): string {
  const done = outsideLinks(text, (prose) => expand(stripSelf(prose)));
  // The capital goes back after the pieces are joined, so a sentence that starts right after a link is seen as one.
  return headerRows(outsideLinks(done, capitalise)).replace(/[ \t]{2,}/g, ' ');
}

/** A chapter or section heading: no chapter number, the shorthand written out, sentence case with proper nouns kept. */
export function plainHeading(heading: string): string {
  return sentenceCase(expand(heading.replace(/^\d+\.\s+/, '').replace(/\s→\s/g, ' to ')));
}
